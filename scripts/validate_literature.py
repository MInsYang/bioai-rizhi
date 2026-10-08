#!/usr/bin/env python3
"""Read-only real-network validation of the selected-journal metadata endpoints.

Uses the system curl trust store; never reads database credentials or writes sources.
The dated JSON is an activation prerequisite for scripts/configure_focus.py.
"""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import time
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]


def contract():
    code = "import {FOCUSED_QUERY,PUBMED_QUERY,QUERY_VERSION} from './cloudflare/site/topics.js'; import {JOURNAL_POLICY_VERSION,SELECTED_JOURNALS} from './cloudflare/site/journals.js'; console.log(JSON.stringify({FOCUSED_QUERY,PUBMED_QUERY,QUERY_VERSION,JOURNAL_POLICY_VERSION,SELECTED_JOURNALS}));"
    result = subprocess.run(['node', '--input-type=module', '-e', code], cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def fetch(url, body=None):
    with tempfile.TemporaryDirectory(prefix='bioai-literature-') as directory:
        body_path = Path(directory) / 'body.json'
        result = subprocess.run(['curl', '--silent', '--show-error', '--max-time', '30', '--retry', '1',
                                 '--user-agent', 'BioAIRegistry/3.0 public-news-metadata validation',
                                 '--output', str(body_path), '--write-out', '%{http_code}',
                                 *(['--header','Content-Type: application/x-www-form-urlencoded','--data-raw',body] if body is not None else []),url],
                                capture_output=True, text=True, timeout=65)
        body = body_path.read_bytes() if body_path.exists() else b''
    observation = {'url': url, 'http_status': int(result.stdout) if result.stdout.isdigit() else None,
                   'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest(),
                   'observed_at': dt.datetime.now(dt.timezone.utc).isoformat()}
    if result.returncode or observation['http_status'] != 200:
        observation['error'] = (result.stderr or 'HTTP '+str(observation['http_status'])).strip()[:500]
        return observation, None
    try:
        return observation, json.loads(body)
    except json.JSONDecodeError:
        observation['error'] = 'Response is not JSON'
        return observation, None


def sample(item):
    return {'doi': item.get('DOI'), 'title': (item.get('title') or [None])[0],
            'journal': (item.get('container-title') or [None])[0], 'issns': item.get('ISSN'),
            'type': item.get('type'), 'published': item.get('published'),
            'original_url': item.get('URL')}


def validate(lookback_days=30, prior=None, retry_failed=False):
    data = contract()
    today = dt.datetime.now(dt.timezone.utc).date()
    start = today - dt.timedelta(days=lookback_days)
    report = {'started_at': dt.datetime.now(dt.timezone.utc).isoformat(), 'real_network': True,
              'writes_database': False, 'journal_policy_version': data['JOURNAL_POLICY_VERSION'],
              'query_version': data['QUERY_VERSION'], 'date_window': {'from': str(start), 'to': str(today)},
              'sources': []}
    crossref = {'registry_key': 'crossref', 'status': 'passed', 'journals': [],
                'documentation': 'https://www.crossref.org/documentation/retrieve-metadata/rest-api/'}
    prior = prior or {}
    prior_journals = {}
    if (prior.get('real_network') is True and prior.get('journal_policy_version') == data['JOURNAL_POLICY_VERSION']
            and prior.get('date_window') == report['date_window']):
        prior_crossref = next((item for item in prior.get('sources', []) if item.get('registry_key') == 'crossref'), {})
        prior_journals = {item['id']: item for item in prior_crossref.get('journals', [])}
    for journal in data['SELECTED_JOURNALS']:
        old = prior_journals.get(journal['id'], {}).get('metadata', {})
        if old.get('http_status') == 200 and journal['issns'][0] in old.get('issns', []):
            observed = old
            message = {'title': old.get('title'), 'ISSN': old.get('issns')}
            meta_ok = True
        else:
            observed, response = fetch(journal['metadata_url'])
            message = (response or {}).get('message') or {}
            meta_ok = response is not None and response.get('status') == 'ok' and journal['issns'][0] in message.get('ISSN', [])
            observed.update(title=message.get('title'), issns=message.get('ISSN'), publisher=message.get('publisher'))
        args = urlencode({'filter': 'issn:'+journal['issns'][0]+',type:journal-article,from-update-date:'+str(start)+',until-update-date:'+str(today),
                          'rows': 2, 'sort': 'deposited', 'order': 'desc'})
        old_works = prior_journals.get(journal['id'], {}).get('works', {})
        if (retry_failed and prior_journals.get(journal['id'], {}).get('status') == 'passed'
                and old_works.get('url', '').startswith('https://api.crossref.org/works?')):
            works_observed = old_works
            works_ok = True
        else:
            time.sleep(1)
            works_observed, works = fetch('https://api.crossref.org/works?'+args)
            works_message = (works or {}).get('message') or {}
            items = works_message.get('items')
            works_ok = (works is not None and works.get('status') == 'ok' and works.get('message-type') == 'work-list'
                        and isinstance(items, list) and isinstance(works_message.get('total-results'), int))
            works_observed.update(total=works_message.get('total-results'), samples=[sample(item) for item in items or []])
        entry = {'id': journal['id'], 'requested_title': journal['title'], 'metadata': observed, 'works': works_observed,
                 'status': 'passed' if meta_ok and works_ok else 'failed'}
        if message.get('title') != journal['title']:
            entry['serial_metadata_note'] = 'Registry canonical title differs from requested journal; each work must match the exact selected title before admission.'
        crossref['journals'].append(entry)
        if entry['status'] != 'passed':
            crossref['status'] = 'failed'
        print(journal['title']+': '+entry['status'], flush=True)
        time.sleep(1)
    passed = [item['id'] for item in crossref['journals'] if item['status'] == 'passed']
    crossref['enabled_journal_ids'] = passed
    crossref['degraded_journal_ids'] = [item['id'] for item in crossref['journals'] if item['status'] != 'passed']
    crossref['status'] = 'passed' if len(passed) == len(data['SELECTED_JOURNALS']) else 'partial' if passed else 'failed'
    report['sources'].append(crossref)

    epmc_args = urlencode({'query': '('+data['FOCUSED_QUERY']+') AND FIRST_PDATE:['+str(start)+' TO '+str(today)+']',
                          'format': 'json', 'resultType': 'core', 'pageSize': 3})
    observed, response = fetch('https://www.ebi.ac.uk/europepmc/webservices/rest/search?'+epmc_args)
    items = (response or {}).get('resultList', {}).get('result')
    epmc_ok = response is not None and isinstance(response.get('hitCount'), int) and isinstance(items, list)
    observed.update(registry_key='europe-pmc', status='passed' if epmc_ok else 'failed',
                    hit_count=(response or {}).get('hitCount'), query=data['FOCUSED_QUERY'],
                    samples=[{'id': item.get('id'), 'source': item.get('source'), 'title': item.get('title'),
                              'doi': item.get('doi'), 'journal': item.get('journalInfo', {}).get('journal'),
                              'published': item.get('firstPublicationDate')} for item in items or []])
    report['sources'].append(observed)

    pubmed_args = urlencode({'db': 'pubmed', 'term': data['PUBMED_QUERY'], 'retmode': 'json', 'retmax': 3,
                            'datetype': 'edat', 'mindate': str(start), 'maxdate': str(today), 'tool': 'bioai_registry'})
    observed, response = fetch('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi',pubmed_args)
    result = (response or {}).get('esearchresult') or {}
    pubmed_ok = (response is not None and isinstance(result.get('idlist'), list)
                 and str(result.get('count', '')).isdigit() and not result.get('ERROR')
                 and not any((result.get('errorlist') or {}).values()))
    observed.update(registry_key='pubmed-eutils', status='passed' if pubmed_ok else 'failed',request_method='POST',
                    hit_count=result.get('count'), ids=result.get('idlist'), query=data['PUBMED_QUERY'],
                    warnings=result.get('warninglist'), errors=result.get('errorlist'))
    report['sources'].append(observed)
    report['status'] = 'passed' if all(item['status'] == 'passed' for item in report['sources']) else 'partial'
    report['finished_at'] = dt.datetime.now(dt.timezone.utc).isoformat()
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--lookback-days', type=int, default=30)
    parser.add_argument('--output', type=Path, default=ROOT / 'docs/literature-live-validation-2026-10-08.json')
    parser.add_argument('--reuse-journal-metadata', action='store_true', help='Reuse successful identity observations from the same dated policy/window; all works and searches are fetched again.')
    parser.add_argument('--retry-failed', action='store_true', help='Retain successful dated work observations and repeat failed endpoints; observed_at remains the original timestamp.')
    args = parser.parse_args()
    if not 1 <= args.lookback_days <= 90:
        parser.error('--lookback-days must be 1..90')
    prior = json.loads(args.output.read_text()) if (args.reuse_journal_metadata or args.retry_failed) and args.output.exists() else None
    report = validate(args.lookback_days, prior, args.retry_failed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'status': report['status'], 'report': str(args.output)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
