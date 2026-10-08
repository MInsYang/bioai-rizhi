#!/usr/bin/env python3
"""Import the dated, official-source supplement without live discovery or article writes.

The default is a JSON-only dry run. Use --apply after migrations and seed. Every
manifest checksum is applied atomically once, preserving later administrator edits.
"""
import argparse
import datetime as dt
from email.utils import parsedate_to_datetime
import hashlib
import ipaddress
import json
from pathlib import Path
import re
import sys
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.db import Jsonb, audit, connection
from backend.identity import normalize
from scripts.manage import load_env

DEFAULT_MANIFEST = ROOT / 'docs/bootstrap/bioai_focus_supplement_v1.json'
NS = uuid.UUID('b5b62e53-9a2a-4dbf-9c95-e3366b875730')
ACTOR = 'operator:focus-supplement'
USER_AGENT = 'BioAIRegistry/2.0 public-news-metadata'


def required(condition, message):
    if not condition:
        raise ValueError(message)


def public_url(value):
    required(isinstance(value, str), 'Evidence URL must be a string')
    p = urlsplit(value)
    required(p.scheme == 'https' and p.hostname and not p.username and not p.password
             and p.port in (None, 443), 'Public HTTPS evidence URL required')
    host = p.hostname.lower()
    required('.' in host and not host.endswith(('.local', '.internal', '.localhost')),
             'Public evidence hostname required')
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise ValueError('Evidence URLs must use declared public hostnames')
    return p


def canonical(value):
    p = public_url(value)
    query = [(k, v) for k, v in parse_qsl(p.query) if not k.lower().startswith('utm_')
             and k.lower() not in ('fbclid', 'gclid')]
    return urlunsplit(('https', p.netloc.lower(), p.path or '/', urlencode(sorted(query)), ''))


def timestamp(value):
    required(isinstance(value, str), 'Dated observation required')
    result = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    required(result.tzinfo is not None, 'Observation timestamp must include its timezone')
    return result


def observation(value):
    required(isinstance(value, dict) and value.get('http_status') == 200,
             'Successful dated HTTP evidence required')
    timestamp(value.get('observed_at'))
    required(parsedate_to_datetime(value.get('http_date', '')).tzinfo is not None,
             'HTTP response Date required')
    required(bool(re.fullmatch(r'[0-9a-f]{64}', value.get('body_sha256', ''))),
             'Evidence body checksum required')


def identity_evidence(value, host):
    observation(value)
    required(public_url(value.get('url')).hostname == host, 'Identity evidence must be on the official company host')
    if value.get('published_on'):
        dt.date.fromisoformat(value['published_on'])
    if value.get('closed_on'):
        dt.date.fromisoformat(value['closed_on'])
    required(bool(value.get('quote') or value.get('summary')), 'Identity evidence explanation required')


def load_manifest(path=DEFAULT_MANIFEST):
    path = Path(path)
    payload = path.read_bytes()
    required(len(payload) <= 500_000, 'Supplement manifest exceeds the bounded size')
    data = json.loads(payload)
    metadata, companies, sources = data['metadata'], data['companies'], data['sources']
    required(metadata['company_count'] == len(companies) and metadata['source_count'] == len(sources),
             'Supplement count mismatch')
    required(companies and sources and len(companies) <= 100 and len(sources) <= 100,
             'Bounded nonempty company/source lists required')
    timestamp(metadata['generated_at'])
    required(metadata['polling_profile'] == {'id': 'P0', 'ttl_hours': 1}, 'Hourly P0 profile required')
    slugs = {c['slug']: c for c in companies}
    required(len(slugs) == len(companies), 'Duplicate company slug')
    for company in companies:
        required(bool(re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', company['slug'])), 'Invalid company slug')
        required(isinstance(company['name_en'], str) and bool(normalize(company['name_en'])), 'Company name required')
        host = public_url(company['official_website']).hostname
        required(company['status'] in ('active', 'part_of_parent') and type(company['include_in_company_wall']) is bool,
                 'Explicit company visibility/status required')
        required(company['status'] != 'part_of_parent' or not company['include_in_company_wall'],
                 'Acquired historical entities must retain the existing visibility convention')
        required(company['priority'] == 'P0' and isinstance(company['focus'], list), 'Declared hourly company fields required')
        required(bool(company['identity_evidence']), 'Official company identity evidence required')
        for evidence in company['identity_evidence']:
            identity_evidence(evidence, host)
        alias_keys = set()
        for alias in company['aliases']:
            key = normalize(alias['alias'])
            required(key and key not in alias_keys, 'Duplicate or empty company alias')
            alias_keys.add(key)
            required(alias['alias_type'] in ('alias', 'historical_brand'), 'Declared alias type required')
            identity_evidence(alias['evidence'], host)
            for field in ('valid_from', 'valid_to'):
                if alias.get(field):
                    dt.date.fromisoformat(alias[field])
            required(not alias.get('valid_from') or not alias.get('valid_to') or alias['valid_from'] <= alias['valid_to'],
                     'Invalid alias validity interval')
            if alias['alias_type'] == 'historical_brand':
                required(bool(alias['evidence'].get('published_on')), 'Historical alias requires a dated official announcement')
        evidence_urls = {e['url'] for e in company['identity_evidence']} | {a['evidence']['url'] for a in company['aliases']}
        for link in company['identity_links']:
            required(link['link_type'] in ('parent', 'historical_brand') and link['related_name']
                     and link['evidence_url'] in evidence_urls, 'Identity link must reference supplied official evidence')

    seen_keys, seen_urls = set(), set()
    for source in sources:
        required(source['company_slug'] in slugs, 'Source company is absent from the manifest')
        required(source['registry_key'] not in seen_keys and source['url'] not in seen_urls, 'Duplicate source key or URL')
        seen_keys.add(source['registry_key']); seen_urls.add(source['url'])
        required(source['adapter'] == 'rss' and source['source_type'] == 'rss' and source['poll_profile'] == 'P0',
                 'Only the declared official hourly RSS adapter is supported')
        config = source['config']
        required(config.get('cloud_runtime_enabled') is True and config.get('official_feed_verified') is True,
                 'Verified cloud feed flags required')
        hosts = config.get('allowed_hosts')
        required(isinstance(hosts, list) and hosts and len(set(hosts)) == len(hosts)
                 and all(h == public_url('https://' + h + '/').hostname and '*' not in h for h in hosts),
                 'Exact official host allowlist required')
        required(public_url(source['url']).hostname in hosts, 'Feed host is outside its exact allowlist')
        required(config['query_version'] == metadata['query_version'], 'Source taxonomy version mismatch')
        provenance = config['provenance']
        required(canonical(provenance['official_anchor']) == canonical(slugs[source['company_slug']]['official_website']),
                 'Feed evidence anchor differs from company identity')
        chain = provenance['chain']
        required(chain and chain[-1]['page_url'] == provenance['discovered_on'], 'Stored backlink page must match supplied discovery proof')
        required(public_url(chain[0]['page_url']).hostname == public_url(provenance['official_anchor']).hostname,
                 'Discovery chain must start on the official company host')
        for index, step in enumerate(chain):
            observation(step)
            target = canonical(urljoin(step['page_url'], step['href']))
            required(target == canonical(step['target_url']), 'Discovery href does not establish its target')
            expected = chain[index + 1]['page_url'] if index + 1 < len(chain) else source['url']
            required(target == canonical(expected), 'Official discovery chain is broken')
        feed = config['http_observation']
        observation(feed)
        timestamp(provenance['live_validated_at'])
        required(feed['observed_at'] == provenance['live_validated_at'], 'Feed validation date must match the HTTP observation')
        required(canonical(feed['requested_url']) == canonical(source['url'])
                 and public_url(feed['resolved_url']).hostname in hosts, 'Observed feed differs from its allowlisted endpoint')
        required(feed['format'] in ('rss', 'atom') and 0 < feed['bytes'] <= 1_500_000
                 and 0 < feed['item_count'] <= 40, 'Feed exceeds the bounded cloud RSS adapter contract')
        latest = timestamp(feed['latest_article_published_at'])
        required(latest == parsedate_to_datetime(feed['latest_article_date_raw']), 'Article date must preserve the original RSS date')
        required(public_url(feed['latest_article_url']).hostname in hosts, 'Article link is outside its exact allowlist')
        robots = config['robots']
        observation(robots)
        required(public_url(robots['url']).hostname == public_url(source['url']).hostname
                 and urlsplit(robots['url']).path == '/robots.txt', 'Robots evidence must cover the feed host')
        required(hashlib.sha256(robots['body'].encode()).hexdigest() == robots['body_sha256'], 'Robots snapshot checksum mismatch')
        parser = RobotFileParser(); parser.parse(robots['body'].splitlines())
        required(robots.get('allowed_feed') is True and parser.can_fetch(USER_AGENT, source['url']), 'Robots snapshot disallows the feed')
        # Some sites place Crawl-delay before the first User-agent. Honor that
        # declared delay conservatively even when RobotFileParser ignores it.
        delays = [float(v) for v in re.findall(r'^\s*Crawl-delay\s*:\s*(\d+(?:\.\d+)?)', robots['body'], re.I | re.M)]
        required(robots['crawl_delay_seconds'] >= max(delays, default=0), 'Declared robots delay was reduced')
        interval = config['request_interval_seconds']
        required(type(interval) in (int, float) and 1 <= interval <= 3600
                 and interval >= robots['crawl_delay_seconds'], 'Feed interval must respect robots Crawl-delay')
    return data, hashlib.sha256(payload).hexdigest()


def plan(data, checksum):
    return {'status': 'dry_run', 'checksum': checksum,
            'companies': [{'slug': c['slug'], 'status': c['status'], 'include_in_company_wall': c['include_in_company_wall']} for c in data['companies']],
            'sources': [{'registry_key': s['registry_key'], 'url': s['url'],
                         'request_interval_seconds': s['config']['request_interval_seconds'],
                         'http_observed_at': s['config']['http_observation']['observed_at'],
                         'latest_article_published_at': s['config']['http_observation']['latest_article_published_at']} for s in data['sources']],
            'writes_raw_records': False, 'writes_events': False}


def apply_manifest(conn, data, checksum, filename):
    conn.execute('SELECT pg_advisory_xact_lock(724091423)')
    if conn.execute('SELECT 1 FROM seed_imports WHERE filename=%s AND checksum=%s', (filename, checksum)).fetchone():
        return {'status': 'already_imported', 'checksum': checksum, 'companies_created': 0, 'sources_created': 0}
    if any(s['config']['request_interval_seconds'] > 1 for s in data['sources']):
        function = conn.execute("SELECT pg_get_functiondef(to_regprocedure('ingestion_claim(uuid,text)')) AS body").fetchone()
        required(function and 'request_interval_seconds' in (function['body'] or ''),
                 'Install the request_interval_seconds ingestion migration before enabling these feeds')
    profile = data['metadata']['polling_profile']
    conn.execute('INSERT INTO polling_profiles(id,ttl_hours) VALUES(%s,%s) ON CONFLICT DO NOTHING', (profile['id'], profile['ttl_hours']))
    required(conn.execute('SELECT ttl_hours FROM polling_profiles WHERE id=%s', (profile['id'],)).fetchone()['ttl_hours'] == profile['ttl_hours'],
             'Configure the existing P0 profile for hourly polling before importing this supplement')
    summary = {'status': 'imported', 'checksum': checksum, 'companies_created': 0, 'companies_preserved': 0,
               'sources_created': 0, 'sources_activated': 0, 'enabled_cloud_sources': [], 'historical_company_slugs': [], 'warnings': []}
    ids = {}
    for company in data['companies']:
        existing = conn.execute('SELECT * FROM companies WHERE slug=%s FOR UPDATE', (company['slug'],)).fetchone()
        cid = existing['id'] if existing else uuid.uuid5(NS, 'company:' + company['slug'])
        keys = [normalize(company['name_en']), *[normalize(a['alias']) for a in company['aliases']]]
        collisions = conn.execute('SELECT c.slug FROM company_aliases a JOIN companies c ON c.id=a.company_id WHERE a.normalized=ANY(%s) AND c.id<>%s', (keys, cid)).fetchall()
        required(not collisions, 'Company identity collides with an existing entity; resolve the supplied aliases before import')
        if existing:
            required(canonical(existing['official_website'] or '') == canonical(company['official_website']),
                     'Existing company identity anchor was edited; do not overwrite it from an older supplement')
            summary['companies_preserved'] += 1
        else:
            conn.execute('''INSERT INTO companies(id,slug,name_zh,name_en,aliases,track,region,focus,official_website,status,priority,include_in_company_wall,notes,seed_payload)
              VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
                         (cid, company['slug'], company['name_zh'], company['name_en'], Jsonb([a['alias'] for a in company['aliases']]),
                          company['track'], company['region'], Jsonb(company['focus']), company['official_website'], company['status'], company['priority'],
                          company['include_in_company_wall'], company['notes'], Jsonb(company)))
            for field, kind in [('name_zh', 'name_zh'), ('name_en', 'name_en')]:
                if company[field]:
                    conn.execute('INSERT INTO company_aliases(company_id,alias,normalized,alias_type,verification_status) VALUES(%s,%s,%s,%s,\'manual_reviewed\')',
                                 (cid, company[field], normalize(company[field]), kind))
            audit(conn, ACTOR, 'import_focus_company', 'company', cid, after=company)
            summary['companies_created'] += 1
        for alias in company['aliases']:
            conn.execute('''INSERT INTO company_aliases(company_id,alias,normalized,alias_type,verification_status,valid_from,valid_to)
              VALUES(%s,%s,%s,%s,'manual_reviewed',%s,%s) ON CONFLICT(company_id,normalized) DO NOTHING''',
                         (cid, alias['alias'], normalize(alias['alias']), alias['alias_type'], alias.get('valid_from'), alias.get('valid_to')))
        if existing:
            merged = list(existing['aliases'])
            for alias in company['aliases']:
                if not any(normalize(v) == normalize(alias['alias']) for v in merged):
                    merged.append(alias['alias'])
            if merged != existing['aliases']:
                conn.execute('UPDATE companies SET aliases=%s,updated_at=now() WHERE id=%s', (Jsonb(merged), cid))
                audit(conn, ACTOR, 'append_focus_aliases', 'company', cid, before=existing, after={'aliases': merged, 'evidence': company['aliases']})
        ids[company['slug']] = cid
        if company['status'] == 'part_of_parent':
            summary['historical_company_slugs'].append(company['slug'])

    for company in data['companies']:
        for link in company['identity_links']:
            related = conn.execute('SELECT id FROM companies WHERE slug=%s', (link['related_slug'],)).fetchone() if link.get('related_slug') else None
            required(not link.get('related_slug') or related, 'Declared related company slug is absent from the database')
            lid = uuid.uuid5(NS, 'identity:' + company['slug'] + ':' + link['link_type'] + ':' + link['related_name'])
            inserted = conn.execute('''INSERT INTO company_identity_links(id,company_id,related_company_id,related_name,link_type,verification_status,evidence_url,notes)
              VALUES(%s,%s,%s,%s,%s,'verified',%s,%s) ON CONFLICT(company_id,link_type,related_name) DO NOTHING RETURNING id''',
                                    (lid, ids[company['slug']], related['id'] if related else None, link['related_name'], link['link_type'], link['evidence_url'], link['notes'])).fetchone()
            if inserted:
                audit(conn, ACTOR, 'import_focus_identity_link', 'company_identity_link', lid, after=link)
    for source in data['sources']:
        cid = ids[source['company_slug']]
        old = conn.execute('SELECT * FROM sources WHERE (company_id=%s AND url=%s) OR registry_key=%s FOR UPDATE',
                           (cid, source['url'], source['registry_key'])).fetchall()
        required(len(old) <= 1, 'Conflicting source registry key and company URL')
        old = old[0] if old else None
        required(not old or (old['company_id'] == cid and old['url'] == source['url'] and old['registry_key'] in (None, source['registry_key'])),
                 'Source registry key belongs to another identity')
        required(not old or old['verification_status'] != 'rejected', 'Previously rejected source requires a new administrator review')
        sid = old['id'] if old else uuid.uuid5(NS, 'source:' + source['company_slug'] + ':' + source['url'])
        config = {**(old['config'] if old else {}), **source['config'], 'verification_report': filename, 'supplement_checksum': checksum}
        if old:
            conn.execute('''UPDATE sources SET registry_key=%s,name=%s,source_type=%s,poll_profile=%s,adapter=%s,config=%s,
              enabled=true,verified=true,verification_status='verified',verified_at=COALESCE(verified_at,now()),next_poll_at=now() WHERE id=%s''',
                         (source['registry_key'], source['name'], source['source_type'], source['poll_profile'], source['adapter'], Jsonb(config), sid))
            summary['sources_activated'] += 1
        else:
            conn.execute('''INSERT INTO sources(id,company_id,registry_key,name,source_type,url,poll_profile,adapter,config,enabled,verified,verification_status,verified_at)
              VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,true,true,'verified',now())''',
                         (sid, cid, source['registry_key'], source['name'], source['source_type'], source['url'], source['poll_profile'], source['adapter'], Jsonb(config)))
            summary['sources_created'] += 1
        review_id = uuid.uuid5(NS, 'focus-review:' + checksum + ':' + source['registry_key'])
        proof = source['config']['provenance']
        review_text = json.dumps({'scope': 'Official feed identity and bounded transport, not editorial fact review or a freshness claim',
                                  'manifest': filename, 'checksum': checksum, 'provenance': proof,
                                  'http_observation': source['config']['http_observation'], 'robots': source['config']['robots']}, ensure_ascii=False)
        conn.execute('''INSERT INTO verification_reviews(id,source_id,decision,method,evidence_url,evidence_text,reviewer)
          VALUES(%s,%s,'verified','official_backlink',%s,%s,%s) ON CONFLICT DO NOTHING''',
                     (review_id, sid, proof['discovered_on'], review_text, ACTOR))
        audit(conn, ACTOR, 'import_verified_focus_feed', 'source', sid, before=old,
              after={'registry_key': source['registry_key'], 'company_id': str(cid), 'url': source['url'], 'enabled': True, 'verified': True, 'config': config})
        summary['enabled_cloud_sources'].append(source['registry_key'])
    conn.execute('INSERT INTO seed_imports(filename,checksum,metadata) VALUES(%s,%s,%s)', (filename, checksum, Jsonb(data)))
    return summary


def import_supplement(path=DEFAULT_MANIFEST, conn=None):
    data, checksum = load_manifest(path)
    filename = str(Path(path).resolve().relative_to(ROOT)) if Path(path).resolve().is_relative_to(ROOT) else Path(path).name
    if conn is not None:
        with conn.transaction():
            return apply_manifest(conn, data, checksum, filename)
    with connection() as session, session.transaction():
        return apply_manifest(session, data, checksum, filename)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, default=DEFAULT_MANIFEST)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--apply', action='store_true')
    modes.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    data, checksum = load_manifest(args.manifest)
    if args.apply:
        load_env()
        result = import_supplement(args.manifest)
    else:
        result = plan(data, checksum)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
