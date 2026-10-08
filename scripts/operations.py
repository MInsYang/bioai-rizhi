#!/usr/bin/env python3
"""Read-only production health/backup and an isolated, empty-database restore drill.

Connection strings and passphrases come only from environment variables. Reports
contain safe status and counts; only encrypted backups leave the temporary folder.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
from urllib.parse import unquote, urlsplit

import httpx
import psycopg

TABLES = ('companies', 'sources', 'raw_items', 'events', 'event_evidence', 'relations',
          'ingestion_jobs', 'schema_migrations')
RESTORE_DATABASES = {'restored', 'bioai_restore_test'}
SECRET_ENV = {'DATABASE_URL', 'RESTORE_DATABASE_URL', 'BACKUP_PASSPHRASE'}


def file_sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def table_counts(connection):
    # Identifiers come exclusively from this fixed allowlist.
    return {name: connection.execute('SELECT count(*) FROM public.' + name).fetchone()[0]
            for name in TABLES}


def count_tables(uri):
    with psycopg.connect(uri, options='-c default_transaction_read_only=on') as connection:
        return table_counts(connection)


def write_report(path, result):
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))


def health(report):
    origin = os.environ.get('BIOAI_SITE_ORIGIN') or 'https://bioai-rizhi.pages.dev'
    now = dt.datetime.now(dt.timezone.utc)
    problems, warnings, stale = [], [], []
    http_status, age, sources_enabled = None, None, None
    try:
        with httpx.Client(timeout=30) as client:
            http_status = client.get(origin + '/health').status_code
        if http_status != 200:
            problems.append('public_health_unavailable')
    except Exception:
        problems.append('public_health_unavailable')
    try:
        with psycopg.connect(os.environ['DATABASE_URL'], connect_timeout=30,
                             options='-c default_transaction_read_only=on -c statement_timeout=30000') as connection:
            recent = connection.execute("SELECT max(finished_at) FROM scheduler_runs WHERE trigger_kind='cron' AND status='succeeded'").fetchone()[0]
            age = (now - recent).total_seconds() / 3600 if recent else None
            if age is None or age > 3:
                problems.append('hourly_scheduler_stale')
            sources = connection.execute("""SELECT registry_key,name,consecutive_failures,last_success_at
                FROM sources WHERE enabled AND verified AND config->>'cloud_runtime_enabled'='true'""").fetchall()
            sources_enabled = len(sources)
            warnings = [{'source': row[0] or row[1], 'failures': row[2]} for row in sources if row[2] > 0]
            stale = [row[0] or row[1] for row in sources
                     if not row[3] or (now - row[3]).total_seconds() > 172800]
            if stale:
                problems.append('sources_stale_over_48h')
            digest = connection.execute('SELECT max(digest_date) FROM daily_digests').fetchone()[0]
            beijing = now + dt.timedelta(hours=8)
            # Before 09:00 Beijing allow yesterday's digest; afterwards today's
            # 08:00 digest should exist. This also handles 00:00–07:59 correctly.
            expected_day = beijing.date() if beijing.hour >= 9 else beijing.date() - dt.timedelta(days=1)
            if not digest or digest < expected_day:
                problems.append('daily_digest_missing')
    except Exception:
        problems.append('database_health_unavailable')
    result = {'checked_at': now.isoformat(), 'status': 'failed' if problems else 'passed',
              'http_status': http_status, 'scheduler_age_hours': age, 'sources_enabled': sources_enabled,
              'source_warnings': warnings, 'stale_sources': stale, 'problems': problems}
    write_report(report, result)
    # A separate final step marks an unhealthy run failed AFTER artifact upload.
    return result


def restore_target(uri):
    parsed = urlsplit(uri)
    if parsed.scheme not in {'postgresql', 'postgres'} or parsed.hostname not in {'127.0.0.1', 'localhost'}:
        raise ValueError('Restore accepts only an isolated loopback PostgreSQL database')
    if parsed.query or parsed.fragment:
        raise ValueError('Restore URI cannot override connection parameters')
    database = unquote(parsed.path.lstrip('/'))
    if database not in RESTORE_DATABASES or parsed.path != '/' + database:
        raise ValueError('Restore requires a dedicated test database')
    if not parsed.username or not parsed.password:
        raise ValueError('Restore requires explicit dedicated credentials')
    return {'PGDATABASE': database, 'PGUSER': unquote(parsed.username),
            'PGPASSWORD': unquote(parsed.password), 'PGHOST': parsed.hostname,
            'PGPORT': str(parsed.port or 5432)}


def process_environment():
    # Do not carry production credentials or inherited libpq service overrides
    # into the restore/GPG processes. pg_dump receives its source separately.
    return {key: value for key, value in os.environ.items()
            if key not in SECRET_ENV and not key.startswith('PG')}


def source_environment(uri):
    if urlsplit(uri).scheme not in {'postgresql', 'postgres'}:
        raise ValueError('Source must use a PostgreSQL URI')
    fields = psycopg.conninfo.conninfo_to_dict(uri)
    mapping = {'host': 'PGHOST', 'port': 'PGPORT', 'user': 'PGUSER',
               'password': 'PGPASSWORD', 'dbname': 'PGDATABASE',
               'sslmode': 'PGSSLMODE', 'channel_binding': 'PGCHANNELBINDING'}
    if set(fields) - set(mapping):
        raise ValueError('Source URI contains unsupported connection parameters')
    if any(not fields.get(key) for key in ('host', 'user', 'password', 'dbname')):
        raise ValueError('Source requires explicit host, user, password and database')
    if any(character in fields['host'] for character in ',/ \t\r\n'):
        raise ValueError('Source requires one explicit server host')
    port = fields.get('port', '5432')
    if not port.isdigit() or not 1 <= int(port) <= 65535:
        raise ValueError('Source port is invalid')
    if fields.get('sslmode', 'prefer') not in {'disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'}:
        raise ValueError('Source SSL mode is invalid')
    if fields.get('channel_binding', 'prefer') not in {'disable', 'prefer', 'require'}:
        raise ValueError('Source channel binding mode is invalid')
    # PGDATABASE must be the actual database name. pg_dump does not interpret a
    # full URI placed in this environment variable as a connection string.
    return {**{mapping[key]: value for key, value in fields.items()}, 'PGPORT': port}


def pg_command(container, command):
    if not container:
        return command
    variables = ('PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGHOST', 'PGPORT', 'PGSSLMODE',
                 'PGCHANNELBINDING', 'PGCONNECT_TIMEOUT', 'PGOPTIONS')
    prefix = ['docker', 'exec', '-i']
    for name in variables:
        prefix.extend(['-e', name])
    return prefix + [container] + command


def assert_empty_restore(uri):
    with psycopg.connect(uri, connect_timeout=30) as connection:
        count = connection.execute("""SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%%'
            AND c.relkind IN ('r','p','v','m','S','f')""").fetchone()[0]
        if count:
            raise ValueError('Restore target must be an empty isolated database')


def backup(output, container=None):
    source, restore = os.environ['DATABASE_URL'], os.environ['RESTORE_DATABASE_URL']
    target = restore_target(restore)
    source_fields = source_environment(source)
    if (source_fields['PGHOST'] in {'localhost', '127.0.0.1'} and
            source_fields['PGPORT'] == target['PGPORT'] and
            source_fields['PGDATABASE'] == target['PGDATABASE']):
        raise ValueError('Source and restore target must differ')
    passphrase = os.environ.get('BACKUP_PASSPHRASE', '')
    if len(passphrase) < 40 or '\n' in passphrase or '\r' in passphrase:
        raise ValueError('Backup passphrase needs at least 40 characters and no newline')
    assert_empty_restore(restore)
    out = Path(output)
    out.mkdir(parents=True, exist_ok=True)
    base_env = process_environment()
    dump_env = {**base_env, **source_fields, 'PGCONNECT_TIMEOUT': '30',
                'PGOPTIONS': '-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=10000'}
    restore_env = {**base_env, **target, 'PGCONNECT_TIMEOUT': '30',
                   'PGOPTIONS': '-c statement_timeout=300000 -c lock_timeout=10000'}
    if container:
        # The workflow maps this dedicated PostgreSQL 17 service to the host;
        # pg_restore runs INSIDE it, where the server listens on localhost:5432.
        restore_env.update(PGHOST='localhost', PGPORT='5432')
    with tempfile.TemporaryDirectory(prefix='bioai-backup-') as tmp:
        dump, decrypted = Path(tmp) / 'snapshot.dump', Path(tmp) / 'decrypted.dump'
        gpg_home = Path(tmp) / 'gnupg'
        gpg_home.mkdir(mode=0o700)
        base_env['GNUPGHOME'] = str(gpg_home)
        # Counts and pg_dump share exactly one MVCC snapshot. Live ingestion can
        # continue without making the validation race production writes.
        with psycopg.connect(source, connect_timeout=30, autocommit=True,
                             options='-c default_transaction_read_only=on -c statement_timeout=300000') as connection:
            connection.execute('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
            try:
                snapshot = connection.execute('SELECT pg_export_snapshot()').fetchone()[0]
                expected_counts = table_counts(connection)
                with dump.open('wb') as stream:
                    subprocess.run(pg_command(container, ['pg_dump', '--format=custom', '--no-owner', '--no-acl', '--snapshot=' + snapshot]),
                                   env=dump_env, stdout=stream, stderr=subprocess.PIPE, check=True, timeout=360)
            finally:
                connection.execute('ROLLBACK')
        encrypted = out / 'bioai.dump.gpg'
        gpg = ['gpg', '--no-options', '--batch', '--yes', '--pinentry-mode', 'loopback', '--passphrase-fd', '0']
        subprocess.run(gpg + ['--symmetric', '--cipher-algo', 'AES256', '--s2k-mode', '3', '--s2k-digest-algo', 'SHA512',
                             '--s2k-count', '65011712', '--output', str(encrypted), str(dump)],
                       input=passphrase.encode(), env=base_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=180)
        subprocess.run(gpg + ['--decrypt', '--output', str(decrypted), str(encrypted)],
                       input=passphrase.encode(), env=base_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=180)
        if file_sha256(dump) != file_sha256(decrypted):
            raise ValueError('Encrypted backup round-trip checksum mismatch')
        with decrypted.open('rb') as stream:
            subprocess.run(pg_command(container, ['pg_restore', '--no-owner', '--no-acl', '--exit-on-error', '--single-transaction',
                                                 '--dbname=' + target['PGDATABASE']]),
                           env=restore_env, stdin=stream, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=360)
        counts = count_tables(restore)
        if counts != expected_counts or counts['companies'] < 1 or counts['schema_migrations'] < 8:
            raise ValueError('Restored snapshot table counts differ or core tables are empty')
        manifest = {'created_at': dt.datetime.now(dt.timezone.utc).isoformat(),
                    'encryption': 'GnuPG AES256 symmetric with integrity protection',
                    'ciphertext_sha256': file_sha256(encrypted), 'bytes': encrypted.stat().st_size,
                    'restore_drill': 'passed', 'validation': 'shared_read_only_snapshot_table_counts_and_full_pg_restore',
                    'expected_snapshot_counts': expected_counts, 'restored_counts': counts,
                    'checked_tables': list(TABLES), 'retention_days': 7,
                    'limits': 'Counts validate the listed core tables, not every row value or application behavior; full pg_restore must also succeed.'}
        write_report(out / 'manifest.json', manifest)


def check_health(report):
    try:
        result = json.loads(Path(report).read_text())
        if result.get('status') == 'passed':
            print('Production health check passed.')
            return
    except Exception:
        pass
    raise ValueError('Health check failed or report missing; inspect the sanitized artifact')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    for name in ('health', 'check-health'):
        command = sub.add_parser(name)
        command.add_argument('--report', required=True)
    command = sub.add_parser('backup')
    command.add_argument('--output', required=True)
    command.add_argument('--pg-docker-container')
    args = parser.parse_args()
    try:
        if args.command == 'health':
            health(args.report)
        elif args.command == 'check-health':
            check_health(args.report)
        else:
            backup(args.output, args.pg_docker_container)
    except Exception as error:
        # psycopg/subprocess diagnostics can contain sensitive URI details.
        print(json.dumps({'status': 'failed', 'error_type': type(error).__name__}))
        raise SystemExit(1)
