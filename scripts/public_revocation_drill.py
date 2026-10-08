#!/usr/bin/env python3
"""Bounded, audited public-HTTP source revocation with independent restoration.

Production execution requires --allow-production. Only verified and
verification_status are changed; audit_log records the operational test.
No source content, company, event, evidence, relation or scheduling is edited.
The detached watchdog owns the source row lock and restores within a 35-second
public window, independently of the HTTP-check process. Credentials are read
only from .sites-runtime/cloud-secrets.json and are never serialized.
"""
import argparse
import concurrent.futures
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlencode, urlsplit
import uuid

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'docs/public-revocation-drill-2026-10-08.json'
ACTOR = 'operator:public-revocation-drill'
PUBLIC_WINDOW = 35
REVOKED = {'verified': False, 'verification_status': 'pending'}
ORIGINS = {'https://bioai-rizhi.pages.dev', 'https://bioai-rizhi.328558608.workers.dev'}


class DrillFailure(Exception):
    pass


def require(ok, code):
    if not ok:
        raise DrillFailure(code)


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def plain(value):
    return json.loads(json.dumps(value, default=str))


def atomic_json(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + '.tmp')
    with temporary.open('w') as out:
        json.dump(plain(value), out, ensure_ascii=False, indent=2)
        out.write('\n'); out.flush(); os.fsync(out.fileno())
    temporary.replace(path)


def read_json(path):
    try:
        return json.loads(Path(path).read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def connect():
    secrets = read_json(ROOT / '.sites-runtime/cloud-secrets.json')
    uri = secrets.get('DATABASE_URL', '')
    try:
        info = psycopg.conninfo.conninfo_to_dict(uri)
        parsed = urlsplit(uri)
    except Exception:
        raise DrillFailure('invalid_private_database_configuration') from None
    host = info.get('host', '')
    require(parsed.scheme in ('postgres', 'postgresql') and host.endswith('.neon.tech')
            and ',' not in host and info.get('dbname') == 'bioai', 'unexpected_production_target')
    return psycopg.connect(uri, autocommit=True, row_factory=dict_row, connect_timeout=4,
                          options='-c statement_timeout=3000 -c lock_timeout=500 -c idle_in_transaction_session_timeout=45000')


def flags(row):
    return {key: row[key] for key in ('verified', 'verification_status')}


def nonflag_hash(row):
    data = {key: value for key, value in row.items() if key not in REVOKED}
    return hashlib.sha256(json.dumps(plain(data), sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def audit(conn, action, source_id, request_id, before, after):
    return conn.execute('''INSERT INTO audit_log(actor,action,entity_type,entity_id,before_value,after_value)
      VALUES (%s,%s,'source',%s,%s,%s) RETURNING id''',
      (ACTOR, action, source_id, Jsonb({'flags': before, 'operational_test_id': request_id}),
       Jsonb({'flags': after, 'operational_test_id': request_id,
              'reason': 'Temporary public publication-gate test; not a new ownership assessment'}))).fetchone()['id']


def eligible(conn, source_id):
    return conn.execute('''SELECT
      EXISTS(SELECT 1 FROM ingestion_jobs WHERE source_id=%s AND status='succeeded') completed,
      NOT EXISTS(SELECT 1 FROM ingestion_jobs WHERE source_id=%s AND status IN ('queued','retry','running')) idle''',
      (source_id, source_id)).fetchone()


def select_target(conn, key):
    selected = conn.execute('''SELECT s.id AS source_id,s.registry_key,s.name,c.slug AS company_slug,
      target.event_id,target.record_id,target.evidence_record_id,target.relation_id,target.record_title,target.canonical_url
      FROM sources s JOIN companies c ON c.id=s.company_id
      JOIN LATERAL (
        SELECT e.id AS event_id,listing.id AS record_id,p.raw_item_id AS evidence_record_id,
          re.id AS relation_id,listing.title AS record_title,listing.canonical_url
        FROM public_events e JOIN public_evidence p ON p.event_id=e.id
        JOIN public_records r ON r.id=p.raw_item_id JOIN relations re ON re.event_id=e.id
        JOIN public_resources listing ON listing.source_id=s.id AND listing.canonical_url=r.canonical_url
        WHERE p.source_id=s.id AND re.subject_type='company' AND re.object_type='company'
          AND NOT EXISTS(SELECT 1 FROM public_evidence other WHERE other.event_id=e.id AND other.source_id<>s.id)
        ORDER BY COALESCE(e.occurred_at,e.published_at) DESC,e.id LIMIT 1
      ) target ON true
      WHERE s.verified AND s.enabled AND s.verification_status='verified'
        AND s.config->>'official_industry_source'='true'
        AND (%s::text IS NULL OR s.registry_key=%s)
        AND EXISTS(SELECT 1 FROM ingestion_jobs j WHERE j.source_id=s.id AND j.status='succeeded')
        AND NOT EXISTS(SELECT 1 FROM ingestion_jobs j WHERE j.source_id=s.id AND j.status IN ('queued','retry','running'))
      ORDER BY CASE WHEN s.registry_key='iambic-official-newsroom' THEN 0 ELSE 1 END,s.registry_key LIMIT 1''',
      (key, key)).fetchone()
    require(selected is not None, 'no_idle_official_source_with_real_event_and_relation')
    return plain(selected)


def snapshot(conn, target):
    row = conn.execute('SELECT * FROM sources WHERE id=%s', (target['source_id'],)).fetchone()
    public = conn.execute('''SELECT
      (SELECT count(*) FROM public_records WHERE source_id=%s) records,
      (SELECT count(*) FROM public_evidence WHERE source_id=%s) evidence,
      (SELECT count(*) FROM public_events WHERE id=%s) selected_event,
      (SELECT count(*) FROM relations r JOIN public_events e ON e.id=r.event_id WHERE r.id=%s) selected_relation''',
      (target['source_id'], target['source_id'], target['event_id'], target['relation_id'])).fetchone()
    # Hash exact stored entities, including job/schedule state, without exposing content or configuration.
    stable = conn.execute('''SELECT
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.id)::text,'[]')) FROM raw_items r WHERE r.source_id=%s) raw_items,
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.id)::text,'[]')) FROM events e WHERE e.id=%s) event,
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.raw_item_id,to_jsonb(v)::text)::text,'[]')) FROM event_evidence v WHERE v.event_id=%s) evidence,
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.id)::text,'[]')) FROM relations r WHERE r.event_id=%s) relations,
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(j) ORDER BY j.id)::text,'[]')) FROM ingestion_jobs j WHERE j.source_id=%s) ingestion_jobs,
      (SELECT md5(to_jsonb(c)::text) FROM companies c WHERE c.slug=%s) company''',
      (target['source_id'], target['event_id'], target['event_id'], target['event_id'],
       target['source_id'], target['company_slug'])).fetchone()
    return {'flags': flags(row), 'nonflag_source_sha256': nonflag_hash(row),
            'public_visibility': dict(public), 'stored_entity_fingerprints': dict(stable)}


def parent_alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False


def restore_on_connection(conn, target, backup, request_id, reason, locked=False):
    if not locked:
        conn.execute('BEGIN')
    current = conn.execute('SELECT * FROM sources WHERE id=%s FOR UPDATE NOWAIT', (target['source_id'],)).fetchone()
    require(nonflag_hash(current) == backup['nonflag_source_sha256'], 'concurrent_nonflag_change_no_overwrite')
    current_flags = flags(current)
    require(current_flags in (REVOKED, backup['flags']), 'concurrent_admin_status_change_no_overwrite')
    if current_flags == REVOKED:
        changed = conn.execute('''UPDATE sources SET verified=%s,verification_status=%s
          WHERE id=%s AND verified=false AND verification_status='pending' RETURNING id''',
          (backup['flags']['verified'], backup['flags']['verification_status'], target['source_id'])).fetchone()
        require(changed is not None, 'restore_compare_and_swap_failed')
    audit_id = audit(conn, 'operational_test_source_restore', target['source_id'], request_id,
                     current_flags, backup['flags'])
    conn.execute('COMMIT')
    after = snapshot(conn, target)
    require(after['flags'] == backup['flags'] and after['nonflag_source_sha256'] == backup['nonflag_source_sha256'],
            'restoration_not_exact')
    return {'confirmed': True, 'reason': reason, 'restored_at': now(), 'audit_id': audit_id, 'after': after}


def emergency_restore(target, backup, request_id, reason):
    # Two bounded attempts; no infinite retries or external requests.
    last = None
    for _ in range(2):
        try:
            with connect() as conn:
                return restore_on_connection(conn, target, backup, request_id, reason)
        except Exception as error:
            last = error
    raise last


def watchdog(control_dir):
    directory = Path(control_dir)
    context = read_json(directory / 'context.json')
    target, request_id = context['target'], context['request_id']
    state = {'pid': os.getpid(), 'started_at': now(), 'stage': 'starting', 'revocation_committed': False}
    backup = None; conn = None; locked = False; committed = False
    try:
        conn = connect(); conn.execute('BEGIN')
        row = conn.execute('SELECT * FROM sources WHERE id=%s FOR UPDATE NOWAIT', (target['source_id'],)).fetchone()
        require(flags(row) == {'verified': True, 'verification_status': 'verified'} and row['enabled'], 'source_flags_changed_before_arm')
        qualification = eligible(conn, target['source_id'])
        require(qualification['completed'] and qualification['idle'], 'source_has_active_or_no_completed_job')
        backup = snapshot(conn, target)
        require(backup['public_visibility']['records'] > 0 and backup['public_visibility']['selected_event'] == 1
                and backup['public_visibility']['selected_relation'] == 1, 'real_visibility_missing_before_arm')
        atomic_json(directory / 'backup.json', backup)
        locked = True; state.update(stage='armed_original_locked', backup=backup)
        atomic_json(directory / 'state.json', state)
        arm_deadline = time.monotonic() + 25
        while True:
            command = read_json(directory / 'command.json').get('command')
            if command == 'revoke':
                break
            if command == 'restore' or not parent_alive(context['parent_pid']) or time.monotonic() >= arm_deadline:
                conn.execute('ROLLBACK'); locked = False
                state.update(stage='cancelled_before_revocation', restoration={'confirmed': True, 'no_mutation_committed': True})
                atomic_json(directory / 'state.json', state); return 0
            time.sleep(0.05)
        conn.execute("UPDATE sources SET verified=false,verification_status='pending' WHERE id=%s", (target['source_id'],))
        audit_id = audit(conn, 'operational_test_source_revocation', target['source_id'], request_id, backup['flags'], REVOKED)
        # A lost COMMIT response cannot establish rollback. Persist the possible
        # commit before sending it; every such attempt requires independent CAS
        # inspection/restoration, including a server commit with a lost reply.
        committed = True
        state.update(stage='revocation_commit_attempted', commit_attempted=True, revocation_committed=None)
        atomic_json(directory / 'state.json', state)
        conn.execute('COMMIT'); locked = False
        committed_at = now(); public_started = time.monotonic()
        state.update(revocation_committed=True, revoked_at=committed_at, revocation_audit_id=audit_id)
        # New committed flags are visible to readers. Immediately reacquire a row
        # lock, then compare every other source column before permitting checks.
        conn.execute('BEGIN')
        current = conn.execute('SELECT * FROM sources WHERE id=%s FOR UPDATE NOWAIT', (target['source_id'],)).fetchone()
        locked = True
        require(flags(current) == REVOKED and nonflag_hash(current) == backup['nonflag_source_sha256'],
                'source_changed_during_commit_lock_handoff')
        state.update(stage='revoked_protected', restore_deadline_seconds=PUBLIC_WINDOW)
        atomic_json(directory / 'state.json', state)
        reason = 'watchdog_deadline'
        while time.monotonic() - public_started < PUBLIC_WINDOW:
            if read_json(directory / 'command.json').get('command') == 'restore':
                reason = 'main_finally'; break
            if not parent_alive(context['parent_pid']):
                reason = 'main_process_disappeared'; break
            time.sleep(0.05)
        restored = restore_on_connection(conn, target, backup, request_id, reason, locked=True)
        locked = False; committed = False
        restored['public_window_seconds'] = round(time.monotonic() - public_started, 3)
        state.update(stage='restored', restoration=restored)
        atomic_json(directory / 'state.json', state)
        return 0
    except Exception as error:
        if conn:
            try: conn.execute('ROLLBACK')
            except Exception: pass
        locked = False
        state.update(stage='watchdog_error', error_type=type(error).__name__,
                     problem=str(error) if isinstance(error, DrillFailure) else 'database_or_network_error')
        if committed and backup:
            try:
                state['restoration'] = emergency_restore(target, backup, request_id, 'watchdog_emergency')
                state['stage'] = 'restored_after_watchdog_error'
            except Exception as recovery_error:
                state['restoration'] = {'confirmed': False, 'error_type': type(recovery_error).__name__,
                    'problem': str(recovery_error) if isinstance(recovery_error, DrillFailure) else 'database_or_network_error'}
        elif backup:
            state['restoration'] = {'confirmed': True, 'no_mutation_committed': True}
        atomic_json(directory / 'state.json', state)
        return 1
    finally:
        if conn:
            conn.close()


def await_stage(directory, desired, timeout):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        state = read_json(directory / 'state.json')
        if state.get('stage') in desired:
            return state
        if state.get('stage') in ('watchdog_error', 'restored_after_watchdog_error', 'cancelled_before_revocation'):
            raise DrillFailure('watchdog_not_in_required_stage:' + state['stage'])
        time.sleep(0.05)
    raise DrillFailure('watchdog_stage_timeout')


def row_lock_probe(target):
    with connect() as conn:
        conn.execute('BEGIN')
        try:
            conn.execute('SELECT id FROM sources WHERE id=%s FOR UPDATE NOWAIT', (target['source_id'],))
        except psycopg.errors.LockNotAvailable:
            conn.execute('ROLLBACK')
            return {'administrator_update_serialized': True, 'sqlstate': '55P03', 'probe_changed_flags': False}
        conn.execute('ROLLBACK')
    raise DrillFailure('watchdog_source_row_lock_not_held')


def public_request(origin, path, payload=None):
    url = origin + path
    command = ['curl', '--proto', '=https', '--silent', '--show-error', '--max-time', '6',
               '--connect-timeout', '3', '--max-filesize', '1048576', '--header', 'Cache-Control: no-cache',
               '--write-out', '\n%{http_code}', url]
    if payload is not None:
        command.extend(['--header', 'Content-Type: application/json', '--header', 'Accept: application/json, text/event-stream',
                        '--header', 'MCP-Protocol-Version: 2025-03-26', '--data-binary', json.dumps(payload)])
    result = subprocess.run(command, capture_output=True, timeout=8)
    if result.returncode:
        raise DrillFailure('public_transport_failure_curl_exit_' + str(result.returncode))
    body, status = result.stdout.rsplit(b'\n', 1)
    require(int(status) != 429, 'public_rate_limited_no_retry')
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        lines = [line[5:].strip() for line in body.decode().splitlines() if line.startswith('data:')]
        if len(lines) != 1:
            error = DrillFailure('unexpected_public_response_format')
            error.details = {'http_status': int(status), 'bytes': len(body)}
            raise error
        data = json.loads(lines[0])
    return {'status': int(status), 'bytes': len(body), 'body_sha256': hashlib.sha256(body).hexdigest(), 'data': data}


def tool_data(response):
    result = response.get('result', {})
    if result.get('structuredContent') is not None:
        return result['structuredContent']
    for content in result.get('content', []):
        if content.get('type') == 'text':
            try: return json.loads(content.get('text', ''))
            except json.JSONDecodeError: pass
    return {}


def probe(origin, target, request_id, hidden):
    nonce = {'_revocation_drill': request_id, 'days': 0}
    records_path = '/api/records?' + urlencode({**nonce, 'source': target['registry_key'], 'journal_tier': 'all', 'limit': 100})
    events_path = '/api/events?' + urlencode({**nonce, 'company': target['company_slug'], 'limit': 200})
    graph_path = '/api/graph?' + urlencode({**nonce, 'company': target['company_slug']})
    def call(name, arguments, identifier):
        return {'jsonrpc': '2.0', 'id': identifier, 'method': 'tools/call', 'params': {'name': name, 'arguments': arguments}}
    requests = {
        'records_list': (records_path, None),
        'record_detail': ('/api/records/' + target['record_id'] + '?' + urlencode(nonce), None),
        'events_list': (events_path, None),
        'event_detail': ('/api/events/' + target['event_id'] + '?' + urlencode(nonce), None),
        'graph': (graph_path, None),
        'company': ('/api/companies/' + target['company_slug'] + '?' + urlencode(nonce), None),
        'mcp_record': ('/mcp', call('get_resource', {'id': target['record_id'], 'kind': 'record'}, 1)),
        'mcp_event': ('/mcp', call('get_resource', {'id': target['event_id'], 'kind': 'event'}, 2)),
        'mcp_search': ('/mcp', call('search_resources', {'query': target['record_title'][:199], 'company': target['company_slug'],
                                                     'days': 0, 'limit': 40}, 3)),
    }
    output = {}; errors = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        pending = {pool.submit(public_request, origin, path, payload): key for key, (path, payload) in requests.items()}
        for future in concurrent.futures.as_completed(pending):
            key = pending[future]
            try: output[key] = future.result()
            except Exception as error: errors.append({'surface': key, 'type': type(error).__name__,
                    'problem': str(error) if isinstance(error, DrillFailure) else 'public_request_error',
                    'details': getattr(error, 'details', None)})
    if errors:
        error = DrillFailure('public_surface_transport_or_format_failure')
        error.details = errors
        raise error
    checks = {}
    for key in ('records_list', 'events_list', 'graph', 'company', 'mcp_record', 'mcp_event', 'mcp_search'):
        checks[key + '_http_200'] = output[key]['status'] == 200
    checks['record_detail_status'] = output['record_detail']['status'] == (404 if hidden else 200)
    checks['event_detail_status'] = output['event_detail']['status'] == (404 if hidden else 200)
    record_ids = [str(r.get('id')) for r in output['records_list']['data'].get('items', [])]
    event_ids = [str(r.get('id')) for r in output['events_list']['data'].get('items', [])]
    edge_ids = [str(r.get('id')) for r in output['graph']['data'].get('edges', [])]
    company = output['company']['data']
    checks['all_source_records_hidden' if hidden else 'record_list_contains_target'] = (
        output['records_list']['data'].get('total') == 0 if hidden else target['record_id'] in record_ids)
    checks['event_list_target_visibility'] = (target['event_id'] not in event_ids) if hidden else (target['event_id'] in event_ids)
    checks['graph_relation_target_visibility'] = (target['relation_id'] not in edge_ids) if hidden else (target['relation_id'] in edge_ids)
    checks['company_directory_retained'] = company.get('slug') == target['company_slug']
    company_events = [str(e.get('id')) for e in company.get('events', [])]
    company_relations = [str(e.get('id')) for e in company.get('relations', [])]
    checks['company_event_target_visibility'] = (target['event_id'] not in company_events) if hidden else (target['event_id'] in company_events)
    checks['company_relation_target_visibility'] = (target['relation_id'] not in company_relations) if hidden else (target['relation_id'] in company_relations)
    for key, identity in [('mcp_record', target['record_id']), ('mcp_event', target['event_id'])]:
        response = output[key]['data']; result = response.get('result', {})
        if hidden:
            checks[key + '_denied_without_data'] = (result.get('isError') is True
                and tool_data(response).get('error', {}).get('code') == 'not_public_or_missing'
                and not tool_data(response).get('data'))
        else:
            checks[key + '_returns_target'] = not result.get('isError', False) and tool_data(response).get('data', {}).get('id') == identity
    search = tool_data(output['mcp_search']['data'])
    ids = [str(r.get('id')) for r in search.get('items', [])]
    checks['mcp_search_target_visibility'] = (target['record_id'] not in ids) if hidden else (target['record_id'] in ids)
    checks['mcp_search_success'] = (not output['mcp_search']['data'].get('result', {}).get('isError', False)
                                  and 'error' not in output['mcp_search']['data'])
    safe = {key: {k: value[k] for k in ('status', 'bytes', 'body_sha256')} for key, value in output.items()}
    return {'observed_at': now(), 'all_checks_passed': all(checks.values()), 'checks': checks,
            'responses': safe, 'source_record_count': output['records_list']['data'].get('total'),
            'graph_edge_count': len(edge_ids), 'reviewed_event_count': output['events_list']['data'].get('total')}


def main(args):
    require(args.allow_production, 'production_execution_requires_explicit_opt_in')
    require(args.origin in ORIGINS, 'unexpected_public_origin')
    request_id = str(uuid.uuid4())
    result = {'started_at': now(), 'status': 'running', 'operational_test_id': request_id, 'origin': args.origin,
        'scope': 'Committed, temporary production source flags; real public Worker API and MCP requests',
        'limits': {'public_window_seconds': PUBLIC_WINDOW, 'independent_watchdog': True,
                   'http_retries': 0, 'http_max_parallel': 3},
        'limitations': ['Representative real record, sole-source event and relation are checked; this is not an exhaustive site audit.',
          'Source/company directory metadata may remain visible while source content and dependent events are hidden.',
          'A commit-to-lock handoff is guarded by exact row comparison; an intervening administrator change is never overwritten.',
          'Restoration is bounded under normal process/network operation; a host outage plus database outage cannot be certified by a local watchdog.']}
    previous = read_json(REPORT)
    if previous:
        attempt = {key: previous[key] for key in ('started_at', 'finished_at', 'status', 'problem', 'diagnostics',
            'flags_restored_exactly', 'other_source_columns_unchanged', 'stored_entities_and_jobs_unchanged') if key in previous}
        attempt['revocation_committed'] = previous.get('watchdog_final', {}).get('revocation_committed', False)
        attempt['failed_baseline_checks'] = [key for key, passed in previous.get('before', {}).get('checks', {}).items() if not passed]
        result['previous_attempts'] = previous.get('previous_attempts', []) + [attempt]
    atomic_json(REPORT, result)
    directory = Path(tempfile.mkdtemp(prefix='bioai-public-revocation-'))
    process = None; target = None; backup = None
    try:
        with connect() as conn:
            target = select_target(conn, args.source)
        result['target'] = target
        atomic_json(directory / 'context.json', {'target': target, 'request_id': request_id, 'parent_pid': os.getpid()})
        process = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--watchdog-control', str(directory)],
                                   stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   start_new_session=True, close_fds=True, cwd=ROOT)
        armed = await_stage(directory, {'armed_original_locked'}, 10)
        backup = armed['backup']; result['backup'] = backup
        result['watchdog'] = {'pid': armed['pid'], 'detached_session': True, 'backup_persisted_before_commit': True,
                              'deadline_seconds': PUBLIC_WINDOW}
        result['original_lock_probe'] = row_lock_probe(target)
        result['before'] = probe(args.origin, target, request_id, hidden=False)
        require(result['before']['all_checks_passed'], 'baseline_public_visibility_failed_no_revocation')
        atomic_json(REPORT, result)
        atomic_json(directory / 'command.json', {'command': 'revoke'})
        state = await_stage(directory, {'revoked_protected'}, 8)
        result['revoked_at'] = state['revoked_at']; result['revocation_audit_id'] = state['revocation_audit_id']
        result['revoked_lock_probe'] = row_lock_probe(target)
        with connect() as conn:
            result['during_database'] = snapshot(conn, target)
        require(result['during_database']['flags'] == REVOKED, 'revocation_not_committed')
        result['during'] = probe(args.origin, target, request_id, hidden=True)
        require(result['during']['all_checks_passed'], 'public_revocation_gate_failure')
    except Exception as error:
        result['status'] = 'failed'; result['error_type'] = type(error).__name__
        result['problem'] = str(error) if isinstance(error, DrillFailure) else 'database_or_network_error'
        if getattr(error, 'details', None) is not None:
            result['diagnostics'] = error.details
    finally:
        if process:
            atomic_json(directory / 'command.json', {'command': 'restore'})
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                # Never kill the process responsible for restoration.
                pass
            state = read_json(directory / 'state.json')
            result['watchdog_final'] = state
            if not state.get('restoration', {}).get('confirmed') and backup and target:
                try:
                    result['emergency_restoration'] = emergency_restore(target, backup, request_id, 'main_finally_emergency')
                except Exception as error:
                    result['emergency_restoration'] = {'confirmed': False, 'error_type': type(error).__name__,
                        'problem': str(error) if isinstance(error, DrillFailure) else 'database_or_network_error'}
        if backup and target:
            try:
                with connect() as conn:
                    after = snapshot(conn, target)
                result['after_database'] = after
                result['flags_restored_exactly'] = after['flags'] == backup['flags']
                result['other_source_columns_unchanged'] = after['nonflag_source_sha256'] == backup['nonflag_source_sha256']
                result['stored_entities_and_jobs_unchanged'] = after['stored_entity_fingerprints'] == backup['stored_entity_fingerprints']
                require(result['flags_restored_exactly'] and result['other_source_columns_unchanged']
                        and result['stored_entities_and_jobs_unchanged'], 'final_restoration_or_immutable_entity_check_failed')
                # A failed read-only baseline committed no revocation. Do not
                # repeat failed HTTP requests (especially a 429) in that case.
                if result.get('revoked_at') and not result.get('diagnostics'):
                    result['after'] = probe(args.origin, target, request_id, hidden=False)
                    require(result['after']['all_checks_passed'], 'public_visibility_not_restored')
                elif result.get('diagnostics'):
                    result['after_public_verification_not_attempted'] = 'Failed HTTP phase; no retry, including 429 responses'
                if result['status'] != 'failed':
                    result['status'] = 'passed'
            except Exception as error:
                result['status'] = 'failed'; result['final_error_type'] = type(error).__name__
                result['final_problem'] = str(error) if isinstance(error, DrillFailure) else 'database_or_network_error'
        result['finished_at'] = now()
        atomic_json(REPORT, result)
    print(json.dumps({'status': result['status'], 'report': str(REPORT),
                      'flags_restored_exactly': result.get('flags_restored_exactly'),
                      'public_window_seconds': result.get('watchdog_final', {}).get('restoration', {}).get('public_window_seconds')}))
    return 0 if result['status'] == 'passed' else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--allow-production', action='store_true')
    parser.add_argument('--source')
    parser.add_argument('--origin', default='https://bioai-rizhi.pages.dev')
    parser.add_argument('--watchdog-control', help=argparse.SUPPRESS)
    args = parser.parse_args()
    try:
        raise SystemExit(watchdog(args.watchdog_control) if args.watchdog_control else main(args))
    except DrillFailure as error:
        print(json.dumps({'status': 'refused', 'problem': str(error)}))
        raise SystemExit(2)
