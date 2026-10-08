#!/usr/bin/env python3
"""Replay one already-succeeded real job exactly twice through Cloudflare Queues.

Requires explicit production opt-in and DATABASE_URL/CLOUDFLARE_API_TOKEN in the
environment. Never retries a push with an uncertain result. Database access is
read-only. Tail output is parsed in memory: headers, log text, stack traces and
message purge references are never printed or saved.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import threading
import time
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
import uuid

import psycopg
from psycopg.rows import dict_row


JOB_ID = '5676121e-08a9-4b01-b0d2-95592943643e'
SOURCE_ID = '3e7497e2-5218-5f47-8e78-73bcb2a6baea'
SOURCE_KEY = 'isomorphic-labs-official-announcements'
QUEUE_NAME = 'bioai-ingestion'
ROOT = Path(__file__).resolve().parents[1]


class DrillFailure(Exception):
    pass


def require(condition, code):
    if not condition:
        raise DrillFailure(code)


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str).encode()).hexdigest()


def snapshot(connection):
    row = connection.execute("""SELECT to_jsonb(j) AS job,s.registry_key,
      (SELECT count(*) FROM ingestion_jobs WHERE source_id=j.source_id) AS source_jobs,
      (SELECT count(*) FROM ingestion_jobs WHERE source_id=j.source_id AND status IN ('queued','running','retry')) AS active_source_jobs,
      (SELECT count(*) FROM ingestion_attempts WHERE job_id=j.id) AS attempts,
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.id)::text,'[]')) FROM ingestion_attempts a WHERE a.job_id=j.id) AS attempts_fingerprint,
      (SELECT count(*) FROM raw_items WHERE source_id=j.source_id) AS source_raw_records,
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.id)::text,'[]')) FROM raw_items r WHERE r.source_id=j.source_id) AS source_records_fingerprint,
      (SELECT count(*) FROM raw_items WHERE job_id=j.id) AS job_raw_records
      FROM ingestion_jobs j JOIN sources s ON s.id=j.source_id WHERE j.id=%s""", (JOB_ID,)).fetchone()
    require(row is not None, 'real_job_missing')
    job = row.pop('job')
    require(job['status'] == 'succeeded' and job['source_id'] == SOURCE_ID and row['registry_key'] == SOURCE_KEY,
            'unexpected_job_or_source')
    return {**row, 'job_id': JOB_ID, 'source_id': SOURCE_ID, 'job_status': job['status'],
            'job_fingerprint': fingerprint(job), 'observed_at': now()}


def cf_call(token, account, queue, suffix, body):
    endpoint = f'https://api.cloudflare.com/client/v4/accounts/{account}/queues/{queue}/messages{suffix}'
    request = Request(endpoint, data=json.dumps(body).encode(), method='POST', headers={
        'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json',
        'User-Agent': 'BioAI-production-noop-drill/1.0'})
    # A push is attempted once. Even a transport timeout must not replay it.
    try:
        response = urlopen(request, timeout=20)
    except HTTPError as error:
        response = error
    with response:
        content = json.loads(response.read(1_000_000))
        receipt = {'at': now(), 'http_status': response.status, 'cf_ray': response.headers.get('CF-Ray'),
                   'success': content.get('success') is True,
                   'error_codes': [e.get('code') for e in content.get('errors', []) if isinstance(e, dict)]}
    metrics = (content.get('result') or {}).get('metadata', {}).get('metrics', {})
    receipt['metrics'] = {key: metrics[key] for key in ('backlog_count','backlog_bytes','oldest_message_timestamp_ms')
                          if isinstance(metrics.get(key), (int, float))}
    return receipt, content.get('result') or {}


def peek(token, account, queue):
    receipt, result = cf_call(token, account, queue, '/peek', {'batch_size': 100})
    receipt['matching_messages'] = []
    messages = result.get('messages', [])
    receipt['returned_message_count'] = len(messages)
    for message in messages:
        body = message.get('body')
        if isinstance(body, str):
            try:
                body = json.loads(body)
            except (ValueError, TypeError):
                continue
        if isinstance(body, dict) and body.get('job_id') == JOB_ID:
            receipt['matching_messages'].append({key: message[key] for key in ('id','attempts','timestamp_ms') if key in message})
    # Explicitly exclude bodies of unrelated messages, metadata and purge refs.
    return receipt


class SafeTail:
    def __init__(self, worker, probe):
        self.probe = probe
        self.ready = threading.Event()
        self.events = []
        environment = os.environ.copy()
        for key in ('DATABASE_URL', 'CLOUDFLARE_API_TOKEN', 'ADMIN_TOKEN'):
            environment.pop(key, None)
        environment['WRANGLER_SEND_METRICS'] = 'false'
        environment['WRANGLER_LOG'] = 'error'
        environment['WRANGLER_WRITE_LOGS'] = 'false'
        self.process = subprocess.Popen([str(ROOT / 'cloudflare/site/node_modules/.bin/wrangler'),
            'tail', worker, '--format', 'json'], cwd=ROOT / 'cloudflare/site', env=environment,
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, start_new_session=True)
        self.reader = threading.Thread(target=self.read, daemon=True)
        self.reader.start()

    def read(self):
        buffer = ''
        for line in self.process.stdout:
            if not buffer and not line.lstrip().startswith('{'):
                continue
            buffer += line
            if len(buffer) > 1_000_000:
                buffer = ''
                continue
            try:
                value = json.loads(buffer)
            except ValueError:
                continue
            buffer = ''
            event = value.get('event') or {}
            request = event.get('request') or {}
            if self.probe in request.get('url', ''):
                self.ready.set()
            if event.get('queue') == QUEUE_NAME:
                safe = {key: value[key] for key in ('eventTimestamp','outcome','cpuTime','wallTime','scriptVersion') if key in value}
                safe['observed_at'] = now()
                safe['queue'] = QUEUE_NAME
                safe['batch_size'] = event.get('batchSize')
                safe['exception_count'] = len(value.get('exceptions') or [])
                if len(self.events) < 100:
                    self.events.append(safe)

    def close(self):
        if self.process.poll() is None:
            os.killpg(self.process.pid, signal.SIGINT)
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(self.process.pid, signal.SIGTERM)
                self.process.wait(timeout=5)
        self.reader.join(timeout=2)


def run(args, report):
    token = os.environ.get('CLOUDFLARE_API_TOKEN', '')
    uri = os.environ.get('DATABASE_URL', '')
    require(token and uri, 'missing_environment_credentials')
    info = psycopg.conninfo.conninfo_to_dict(uri)
    require(info.get('host', '').endswith('.neon.tech') and ',' not in info.get('host', '') and info.get('dbname') == 'bioai',
            'unexpected_production_database')
    require(re.fullmatch(r'[0-9a-f]{32}', args.account) and re.fullmatch(r'[0-9a-f]{32}', args.queue), 'invalid_cloudflare_target')
    require(urlsplit(args.origin).scheme == 'https' and urlsplit(args.origin).hostname in {
        'bioai-rizhi.pages.dev', 'bioai-rizhi.328558608.workers.dev'}, 'unexpected_health_probe_origin')
    tail = None
    with psycopg.connect(uri, autocommit=True, row_factory=dict_row, connect_timeout=15,
        options='-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=2000') as connection:
        report['before'] = snapshot(connection)
        require(report['before']['active_source_jobs'] == 0, 'source_has_concurrent_active_job')
        report['baseline_peek'] = peek(token, args.account, args.queue)
        require(report['baseline_peek']['success'], 'queue_peek_denied_or_failed')
        require(report['baseline_peek']['returned_message_count'] == 0, 'queue_not_empty_before_drill')
        try:
            probe = 'bioai-duplicate-drill-' + uuid.uuid4().hex
            tail = SafeTail('bioai-rizhi', probe)
            ready_deadline = time.monotonic() + 40
            report['health_probe_receipts'] = []
            while not tail.ready.is_set() and time.monotonic() < ready_deadline:
                require(tail.process.poll() is None, 'tail_exited_before_ready')
                try:
                    health_request = Request(args.origin + '/health?drill=' + probe,
                                             headers={'User-Agent': 'BioAI-production-noop-drill/1.0'})
                    with urlopen(health_request, timeout=10) as response:
                        response.read(100_000)
                        report['health_probe_receipts'].append({'at': now(), 'http_status': response.status})
                except Exception as error:
                    report['health_probe_receipts'].append({'at': now(), 'error_type': type(error).__name__,
                        'http_status': error.code if isinstance(error, HTTPError) else None})
                tail.ready.wait(3)
            require(tail.ready.is_set(), 'tail_readiness_not_observed_no_messages_sent')
            report['tail_ready_at'] = now()
            report['pre_push_peek'] = peek(token, args.account, args.queue)
            require(report['pre_push_peek']['success'] and report['pre_push_peek']['returned_message_count'] == 0,
                    'queue_no_longer_empty_no_messages_sent')
            report['push_receipts'] = []
            report['push_start_ms'] = int(time.time() * 1000)
            for number in (1, 2):
                # Persist intent before networking. A crash or ambiguous timeout
                # must not lead a later invocation to silently send two more.
                report['push_attempted_count'] = number
                Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
                receipt, _ = cf_call(token, args.account, args.queue, '', {
                    'body': {'job_id': JOB_ID}, 'content_type': 'json', 'delay_seconds': 15})
                receipt['delivery_number'] = number
                report['push_receipts'].append(receipt)
                require(receipt['success'], 'queue_push_denied_or_failed_no_retry')
            report['after_push_peek'] = peek(token, args.account, args.queue)
            require(report['after_push_peek']['success'], 'post_push_peek_failed')
            deadline = time.monotonic() + 100
            while time.monotonic() < deadline:
                successful = [e for e in tail.events if e.get('eventTimestamp', 0) >= report['push_start_ms']
                    and e.get('outcome') == 'ok' and e.get('exception_count') == 0]
                if sum(e.get('batch_size') or 0 for e in successful) >= 2:
                    break
                time.sleep(1)
            report['after_delivery_peek'] = peek(token, args.account, args.queue)
            report['after'] = snapshot(connection)
            report['consumer_events'] = [e for e in tail.events if e.get('eventTimestamp', 0) >= report['push_start_ms']]
            comparable = lambda snapshot: {key: value for key, value in snapshot.items() if key != 'observed_at'}
            report['assertions'] = {
                'two_pushes_accepted': len(report['push_receipts']) == 2 and all(r['success'] for r in report['push_receipts']),
                'two_or_more_queue_messages_processed_without_exception': sum(e.get('batch_size') or 0 for e in report['consumer_events']
                    if e.get('outcome') == 'ok' and not e.get('exception_count')) >= 2,
                'no_visible_messages_in_final_peek': report['after_delivery_peek']['success'] and report['after_delivery_peek']['returned_message_count'] == 0,
                'job_attempts_source_jobs_and_source_records_unchanged': comparable(report['before']) == comparable(report['after'])}
            require(all(report['assertions'].values()), 'one_or_more_transport_or_database_assertions_failed')
        finally:
            if tail:
                tail.close()
                report.setdefault('consumer_events', tail.events)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--allow-production', action='store_true')
    parser.add_argument('--account', required=True)
    parser.add_argument('--queue', required=True)
    parser.add_argument('--origin', default='https://bioai-rizhi.pages.dev')
    parser.add_argument('--report', default='docs/queue-duplicate-drill-2026-10-08.json')
    args = parser.parse_args()
    require(args.allow_production, 'explicit_production_opt_in_required')
    path = Path(args.report)
    path.parent.mkdir(parents=True, exist_ok=True)
    previous = json.loads(path.read_text()) if path.exists() else None
    if previous:
        attempts = [previous, *previous.get('previous_attempts', [])]
        require(not any(r.get('push_attempted_count') or r.get('push_receipts') for r in attempts),
                'report_already_contains_push_attempt_do_not_repeat_transport_drill')
    report = {'started_at': now(), 'status': 'running', 'queue': QUEUE_NAME, 'job_id': JOB_ID,
        'scope': 'Two actual HTTP Queue pushes of the same existing succeeded production job; read-only PostgreSQL comparisons.',
        'official_references': [
            'https://developers.cloudflare.com/api/resources/queues/subresources/messages/methods/push/',
            'https://developers.cloudflare.com/api/resources/queues/subresources/messages/methods/peek/'],
        'limitations': [
            'The Queue consumer tail envelope identifies the queue and batch size, not individual job ids or its returned terminal status.',
            'Correlation uses two initially empty peek results, two accepted push receipts and successful consumer invocations after the delivery delay. Peek is a point-in-time sample and does not establish absence of delayed or in-flight messages.',
            'Only this real source and job are compared; unrelated sources may legitimately ingest concurrently.',
            'No consumer code, queue configuration, source content or database rows are changed by this script. No fake records are created.',
            'Push responses expose best-effort backlog metrics and do not return a message id. A push is never automatically retried.']}
    if previous:
        report['previous_attempts'] = previous.get('previous_attempts', []) + [{key: previous[key] for key in (
            'started_at','finished_at','status','problem','push_attempted_count','push_receipts','consumer_events','assertions') if key in previous}]
    start = time.monotonic()
    try:
        run(args, report)
        report['status'] = 'passed'
    except Exception as error:
        report['status'] = 'failed'
        report['error_type'] = type(error).__name__
        report['problem'] = str(error) if isinstance(error, DrillFailure) else 'network_database_or_local_process_error'
    report['finished_at'] = now()
    report['duration_seconds'] = round(time.monotonic() - start, 3)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': report['status'], 'report': str(path), 'duration_seconds': report['duration_seconds']}))
    return 0 if report['status'] == 'passed' else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except DrillFailure as error:
        print(json.dumps({'status': 'refused', 'problem': str(error)}))
        raise SystemExit(2)
