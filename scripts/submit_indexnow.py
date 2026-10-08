#!/usr/bin/env python3
"""Notify IndexNow of public sitemap changes. Never equate receipt with indexing."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import time
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET

import httpx

ORIGIN = 'https://bioai-rizhi.pages.dev'
ENDPOINT = 'https://api.indexnow.org/indexnow'
NS = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
MAX_BATCH_URLS = 10000
MAX_DISCOVERED_URLS = 100000
MAX_SITEMAP_PAGES = 1000


class SubmissionRejected(RuntimeError):
    def __init__(self, status):
        super().__init__('IndexNow submission rejected')
        self.status = status


def get_public(client, url):
    """Retry only transient fetch failures; never checkpoint a partial sitemap."""
    for attempt in range(3):
        try:
            response = client.get(url)
        except httpx.TransportError:
            if attempt == 2:
                raise
        else:
            if response.status_code not in (429, 500, 502, 503, 504) or attempt == 2:
                response.raise_for_status()
                return response
        time.sleep(1 + 2 * attempt)


def failure_report(error):
    result = {'status': 'failed', 'error_type': type(error).__name__, 'indexing_confirmed': False}
    if isinstance(error, httpx.HTTPStatusError):
        result['http_status'] = error.response.status_code
        # Only fixed stage names, never a request URL, body, headers or key.
        path = error.request.url.path
        result['stage'] = ('verification_file' if path == '/indexnow-key.txt' else
                           'sitemap' if path == '/sitemap.xml' or path.startswith('/sitemaps/') else
                           'submission')
    elif isinstance(error, SubmissionRejected):
        result.update(http_status=error.status, stage='submission')
    return result


def public_url(value, sitemap=False):
    url = urlsplit(value)
    if url.scheme != 'https' or url.netloc != urlsplit(ORIGIN).netloc or url.query or url.fragment:
        raise ValueError('Unexpected sitemap origin or query')
    pattern = (r'/sitemaps/(pages|companies|records|events|digests)/[1-9][0-9]*\.xml' if sitemap
               else r'/(?:connect|guides(?:/[a-z0-9-]+)?|briefings|topics/[a-z0-9-]+|companies/[a-z0-9_-]+|(?:records|events)/[a-f0-9-]{36}|digest/\d{4}-\d{2}-\d{2})?')
    if not re.fullmatch(pattern, url.path):
        raise ValueError('Unexpected sitemap path')
    return value


def discover(client):
    response = get_public(client, ORIGIN + '/sitemap.xml')
    if len(response.content) > 2_000_000:
        raise ValueError('Oversized sitemap')
    root = ET.fromstring(response.content)
    documents = [root]
    if root.tag.endswith('sitemapindex'):
        pages = [public_url(node.text or '', True) for node in root.findall('s:sitemap/s:loc', NS)]
        if len(pages) > MAX_SITEMAP_PAGES:
            raise ValueError('Sitemap page bound exceeded')
        documents = []
        for page in pages:
            reply = get_public(client, page)
            if len(reply.content) > 2_000_000:
                raise ValueError('Oversized sitemap page')
            document = ET.fromstring(reply.content)
            if not document.tag.endswith('urlset'):
                raise ValueError('Expected a sitemap URL set')
            documents.append(document)
    elif not root.tag.endswith('urlset'):
        raise ValueError('Invalid sitemap document')
    urls = {}
    for document in documents:
        for node in document.findall('s:url', NS):
            value = public_url(node.findtext('s:loc', '', NS))
            urls[value] = node.findtext('s:lastmod', '', NS)
    if not urls or len(urls) > MAX_DISCOVERED_URLS:
        raise ValueError('Empty or oversized public sitemap')
    return urls


def changed_urls(current, previous):
    # A missing URL notifies deletion/withdrawal. Do not pretend a collection date
    # is a reliable modification timestamp for an existing source-backed page.
    candidates = {url for url, revision in current.items() if url not in previous or previous[url] != revision}
    candidates.update(url for url in previous if url not in current)
    return sorted(candidates)


def submit(client, key, state_path, dry_run=False):
    if not re.fullmatch(r'[a-zA-Z0-9-]{8,128}', key):
        raise ValueError('IndexNow verification key missing or invalid')
    key_url = ORIGIN + '/indexnow-key.txt'
    check = get_public(client, key_url)
    if check.text.strip() != key:
        raise ValueError('Published verification file differs from configured key')
    previous = {}
    if state_path.exists():
        saved = json.loads(state_path.read_text())
        if saved.get('origin') != ORIGIN or not isinstance(saved.get('urls'), dict):
            raise ValueError('State does not belong to this site')
        previous = {public_url(url): str(revision) for url, revision in saved['urls'].items()}
    current = discover(client)
    changes = changed_urls(current, previous)
    report = {'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'origin': ORIGIN,
              'sitemap_urls': len(current), 'new_or_changed': sum(url in current for url in changes),
              'withdrawn': sum(url not in current for url in changes), 'submitted': 0,
              'indexing_confirmed': False, 'scope': 'New/withdrawn URLs and explicit sitemap lastmod changes; existing pages without lastmod are revisited by search crawlers.',
              'status': 'dry_run' if dry_run else 'no_changes'}
    if changes and not dry_run:
        receipts = []
        for start in range(0,len(changes),MAX_BATCH_URLS):
            batch = changes[start:start+MAX_BATCH_URLS]
            reply = client.post(ENDPOINT, json={'host': urlsplit(ORIGIN).hostname, 'key': key,
                                'keyLocation': key_url, 'urlList': batch})
            if reply.status_code not in (200, 202):
                raise SubmissionRejected(reply.status_code)
            receipts.append(reply.status_code)
            report['submitted'] += len(batch)
        pending = 202 in receipts
        report.update(http_status=202 if pending else 200,batches=len(receipts),
                      status='key_validation_pending' if pending else 'received')
        # 202 is receipt with validation pending; retry on a later run until 200.
        if pending:
            return report
    if not dry_run:
        state_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = state_path.with_suffix('.tmp')
        temporary.write_text(json.dumps({'origin': ORIGIN, 'urls': current}, ensure_ascii=False, indent=2) + '\n')
        temporary.replace(state_path)
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', type=Path, default=Path('.indexnow/state.json'))
    parser.add_argument('--report', type=Path, default=Path('indexnow-report.json'))
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    try:
        # Explicit HTTP proxy avoids interpreting local SOCKS settings as HTTP.
        with httpx.Client(proxy=os.environ.get('HTTPS_PROXY'), trust_env=False, timeout=45,
                          follow_redirects=False, headers={'User-Agent': 'BioAI-IndexNow/1.0'}) as client:
            result = submit(client, os.environ.get('BIOAI_INDEXNOW_KEY', ''), args.state, args.dry_run)
    except Exception as error:
        # Never serialize request bodies or external exception messages containing keys.
        result = failure_report(error)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False))
    if result['status'] == 'failed':
        raise SystemExit(1)


if __name__ == '__main__':
    main()
