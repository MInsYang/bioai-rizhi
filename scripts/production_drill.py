#!/usr/bin/env python3
"""Explicit opt-in, rollback-only PostgreSQL checks on existing production data.

This is NOT a Cloudflare Queue transport test or a public HTTP revocation test.
No source content, companies, news, evidence, or events are inserted or rewritten.
DATABASE_URL is accepted only through the environment and is never printed.
"""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import time
from urllib.parse import urlsplit

import psycopg
from psycopg.rows import dict_row


class DrillFailure(Exception):
    pass


def require(condition, code):
    if not condition:
        raise DrillFailure(code)


def begin(connection):
    connection.execute('BEGIN ISOLATION LEVEL REPEATABLE READ')
    connection.execute("SET LOCAL statement_timeout='15s'")
    connection.execute("SET LOCAL lock_timeout='2s'")
    connection.execute("SET LOCAL idle_in_transaction_session_timeout='15s'")


def visibility(connection, source_id):
    return connection.execute("""SELECT
      (SELECT count(*) FROM public_records WHERE source_id=%s) AS records,
      (SELECT count(*) FROM public_evidence WHERE source_id=%s) AS evidence,
      (SELECT count(DISTINCT e.id) FROM public_events e JOIN public_evidence v ON v.event_id=e.id WHERE v.source_id=%s) AS events""",
      (source_id, source_id, source_id)).fetchone()


def attempt_state(connection, job_id):
    return connection.execute("""SELECT count(*) AS count,
      md5(COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.id)::text,'[]')) AS fingerprint
      FROM ingestion_attempts a WHERE job_id=%s""", (job_id,)).fetchone()


def run(connection, source_key=None, result=None):
    result = result if result is not None else {}
    result["stage"] = "source_revocation"
    begin(connection)
    try:
        # Select actual source data without creating a fixture. Prefer a source with
        # published evidence, so a passing report can cover event visibility too.
        selected = connection.execute("""SELECT s.id,s.registry_key,s.name
          FROM sources s WHERE s.verified AND s.enabled
          AND (%s::text IS NULL OR s.registry_key=%s)
          AND EXISTS(SELECT 1 FROM public_records r WHERE r.source_id=s.id)
          AND EXISTS(SELECT 1 FROM ingestion_jobs j WHERE j.source_id=s.id AND j.status='succeeded')
          ORDER BY (SELECT count(DISTINCT e.id) FROM public_events e JOIN public_evidence v ON v.event_id=e.id WHERE v.source_id=s.id) DESC,
          (SELECT count(*) FROM public_evidence v WHERE v.source_id=s.id) DESC,
          CASE WHEN s.registry_key='pubmed-eutils' THEN 0 ELSE 1 END,s.id LIMIT 1 FOR UPDATE OF s SKIP LOCKED""",
          (source_key, source_key)).fetchone()
        require(selected is not None, 'no_unlocked_eligible_real_source')
        source_id = selected['id']
        result['source'] = {'id': str(source_id), 'registry_key': selected['registry_key'], 'name': selected['name']}
        before = connection.execute('SELECT verified,verification_status,enabled FROM sources WHERE id=%s FOR UPDATE', (source_id,)).fetchone()
        require(before['verified'] and before['enabled'], 'source_no_longer_eligible')
        baseline = visibility(connection, source_id)
        require(baseline['records'] > 0, 'source_has_no_public_records')
        affected = connection.execute("""SELECT DISTINCT v.event_id FROM public_evidence v JOIN public_events e ON e.id=v.event_id
          WHERE v.source_id=%s AND NOT EXISTS(SELECT 1 FROM public_evidence other
            WHERE other.event_id=v.event_id AND other.source_id<>%s)""", (source_id, source_id)).fetchall()
        event_ids = [row['event_id'] for row in affected]
        before_relations = connection.execute('SELECT count(*) AS n FROM relations r JOIN public_events e ON e.id=r.event_id WHERE e.id=ANY(%s::uuid[])', (event_ids,)).fetchone()['n']
        connection.execute("UPDATE sources SET verified=false,verification_status='rejected' WHERE id=%s", (source_id,))
        revoked = visibility(connection, source_id)
        require(revoked['records'] == 0, 'revoked_source_records_visible')
        require(revoked['evidence'] == 0, 'revoked_source_evidence_visible')
        require(revoked['events'] == 0, 'revoked_source_evidence_events_visible')
        remaining = connection.execute('SELECT count(*) AS n FROM public_events WHERE id=ANY(%s::uuid[])', (event_ids,)).fetchone()['n']
        require(remaining == 0, 'events_without_remaining_evidence_visible')
        after_relations = connection.execute('SELECT count(*) AS n FROM relations r JOIN public_events e ON e.id=r.event_id WHERE e.id=ANY(%s::uuid[])', (event_ids,)).fetchone()['n']
        require(after_relations == 0, 'relations_without_remaining_event_evidence_visible')
        result['revocation'] = {'status': 'passed', 'before': baseline, 'inside_revocation_transaction': revoked,
          'events_depending_only_on_source': len(event_ids), 'dependent_events_still_visible': remaining,
          'event_evidence_exercised': baseline['evidence'] > 0,
          'sole_source_event_visibility_exercised': bool(event_ids),
          'relations_via_public_event_gate_before': before_relations,
          'relations_via_public_event_gate_revoked': after_relations,
          'relation_visibility_exercised': before_relations > 0,
          'rollback_required': True, 'public_http_visibility_changed': False}
    finally:
        connection.execute('ROLLBACK')
    restored = connection.execute('SELECT verified,verification_status,enabled FROM sources WHERE id=%s', (source_id,)).fetchone()
    restored_visibility = visibility(connection, source_id)
    require(restored == before, 'source_flags_not_restored')
    require(restored_visibility['records'] > 0, 'source_records_not_visible_after_rollback')
    require(not baseline['evidence'] or restored_visibility['evidence'] > 0, 'source_evidence_not_visible_after_rollback')
    restored_relations = connection.execute('SELECT count(*) AS n FROM relations r JOIN public_events e ON e.id=r.event_id WHERE e.id=ANY(%s::uuid[])', (event_ids,)).fetchone()['n']
    require(not before_relations or restored_relations > 0, 'relations_not_visible_after_rollback')
    result['revocation']['rollback_confirmed'] = True
    result['revocation']['after_rollback'] = restored_visibility
    result['revocation']['relations_via_public_event_gate_after_rollback'] = restored_relations
    result['revocation']['restoration_check'] = 'Flags match exactly; existing source records/evidence are visible. Counts may grow through concurrent ingestion.'
    result['stage'] = 'duplicate_claim'
    begin(connection)
    try:
        job = connection.execute("""SELECT to_jsonb(j) AS row FROM ingestion_jobs j
          WHERE j.source_id=%s AND j.status='succeeded'
          ORDER BY j.finished_at DESC,j.id LIMIT 1 FOR UPDATE SKIP LOCKED""", (source_id,)).fetchone()
        require(job is not None, 'no_completed_real_job')
        before_job = job['row']
        job_id = before_job['id']
        before_attempts = attempt_state(connection, job_id)
        claims = []
        for index in range(2):
            claim = connection.execute('SELECT ingestion_claim(%s::uuid,%s) AS result',
                (job_id, 'production-noop-redelivery-drill-' + str(index + 1))).fetchone()['result']
            claims.append(claim['status'])
            require(claim['status'] == 'succeeded', 'completed_job_was_claimed_again')
        after_job = connection.execute('SELECT to_jsonb(j) AS row FROM ingestion_jobs j WHERE j.id=%s', (job_id,)).fetchone()['row']
        after_attempts = attempt_state(connection, job_id)
        require(before_job == after_job, 'duplicate_claim_mutated_job')
        require(before_attempts == after_attempts, 'duplicate_claim_mutated_attempts')
        result['duplicate_claim'] = {'status': 'passed', 'job_id': job_id, 'returned_statuses': claims,
          'job_row_unchanged': True, 'attempt_rows_unchanged': True, 'attempt_row_count': before_attempts['count'],
          'new_jobs_created': 0, 'queue_transport_exercised': False, 'rollback_required': True}
    finally:
        connection.execute('ROLLBACK')
    result['duplicate_claim']['rollback_confirmed'] = True
    result['stage'] = 'completed'
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--allow-production', action='store_true', help='Required explicit opt-in to rollback-only production transactions')
    parser.add_argument('--source', help='Optional exact registry_key; otherwise choose one real source with evidence and a completed job')
    parser.add_argument('--report', default='docs/production-drill-2026-10-08.json')
    args = parser.parse_args()
    require(args.allow_production, 'production_execution_requires_explicit_opt_in')
    uri = os.environ.get('DATABASE_URL', '')
    try:
        parsed = urlsplit(uri)
        actual = psycopg.conninfo.conninfo_to_dict(uri)
    except Exception:
        raise DrillFailure('invalid_database_configuration') from None
    require(parsed.scheme in {'postgres', 'postgresql'} and actual.get('host', '').endswith('.neon.tech') and actual.get('dbname') == 'bioai' and ',' not in actual.get('host', ''), 'unexpected_production_database_target')
    report = {'started_at': dt.datetime.now(dt.timezone.utc).isoformat(), 'status': 'running',
      'scope': 'Live production PostgreSQL, rollback-only source revocation/restoration and repeated terminal-job claim',
      'limitations': ['Source revocation is isolated in one transaction; public Worker requests never observe it.',
        'Repeated ingestion_claim calls exercise the production database gate, not actual Cloudflare Queue transport or consumer retries.',
        'No synthetic companies, news, events, relations or source content are inserted. No production mutation is committed.']}
    start = time.monotonic()
    exit_code = 0
    try:
        with psycopg.connect(uri, autocommit=True, row_factory=dict_row, connect_timeout=15,
                             options='-c statement_timeout=15000 -c lock_timeout=2000') as connection:
            run(connection, args.source, report)
        report['status'] = 'passed'
    except Exception as error:
        # Never serialize database diagnostics: they can contain URI details.
        report['status'] = 'failed'
        report['error_type'] = type(error).__name__
        if getattr(error, 'sqlstate', None):
            report['sqlstate'] = error.sqlstate
        report['problem'] = str(error) if isinstance(error, DrillFailure) else 'database_or_network_error'
        exit_code = 1
    report['finished_at'] = dt.datetime.now(dt.timezone.utc).isoformat()
    report['duration_seconds'] = round(time.monotonic() - start, 3)
    path = Path(args.report)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        previous = json.loads(path.read_text())
        report['previous_attempts'] = previous.get('previous_attempts', []) + [{key: previous[key] for key in ('started_at', 'finished_at', 'status', 'duration_seconds', 'error_type', 'problem', 'stage') if key in previous}]
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': report['status'], 'report': str(path), 'duration_seconds': report['duration_seconds']}, ensure_ascii=False))
    return exit_code


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except DrillFailure as error:
        print(json.dumps({'status': 'refused', 'problem': str(error)}))
        raise SystemExit(2)
