#!/usr/bin/env python3
"""Import the dated official industry registry and optional private review queue.

The default is a credential-free dry run. --apply activates only this manifest's
sources after runtime-gate checks. --import-candidates also retains the exact
short official excerpts as raw records and creates pending industry_candidates.
This command never approves an event or creates collaboration relationships.
--verify-live makes bounded read-only requests and does not rewrite the manifest.
"""
import argparse
import concurrent.futures
import datetime as dt
from email.utils import parsedate_to_datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import urljoin, urlsplit
from urllib.robotparser import RobotFileParser
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.db import Jsonb, audit, connection
from backend.identity import normalize
from scripts.import_focus_supplement import canonical, observation, public_url, required, timestamp
from scripts.manage import load_env

DEFAULT_MANIFEST = ROOT / 'docs/bootstrap/bioai_industry_sources_v2.json'
NS = uuid.UUID('b5b62e53-9a2a-4dbf-9c95-e3366b875730')
ACTOR = 'operator:industry-config'
USER_AGENT = 'BioAIRegistry/2.0 public-news-metadata'
MAX_BYTES = 1_500_000
EVENT_TYPES = {'financing','partnership','licensing','merger_acquisition','product_launch',
               'model_or_dataset_release','clinical_trial_milestone','regulatory',
               'facility_or_geographic_expansion','earnings','executive_change','hiring','other'}
TYPE_HINT = {'financing':'funding','merger_acquisition':'acquisition','product_launch':'product',
             'model_or_dataset_release':'product','clinical_trial_milestone':'clinical',
             'facility_or_geographic_expansion':'strategy'}


def domain(value):
    return public_url(value).hostname.removeprefix('www.')


def on_company_domain(value, official):
    host = public_url(value).hostname
    base = domain(official)
    return host == base or host.endswith('.' + base)


def load_manifest(path=DEFAULT_MANIFEST):
    path = Path(path)
    payload = path.read_bytes()
    required(len(payload) <= 500_000, 'Industry manifest exceeds its bounded size')
    data = json.loads(payload)
    metadata = data['metadata']
    companies, sources, candidates = data['companies'], data['sources'], data['event_candidates']
    required(metadata['company_count'] == len(companies) and metadata['source_count'] == len(sources)
             and metadata['candidate_count'] == len(candidates), 'Industry manifest count mismatch')
    required(1 <= len(sources) <= 20 and len(companies) <= 10 and len(candidates) <= 30,
             'Bounded industry company/source/candidate lists required')
    timestamp(metadata['generated_at'])
    required(metadata['polling_profile'] == {'id':'P0','ttl_hours':1}, 'Hourly P0 profile required')
    seed = json.loads((ROOT / 'docs/bootstrap/bioai_company_registry_v1.json').read_text())
    identities = {c['id']: {'official_website':c['website']} for c in seed['companies']}
    for company in companies:
        required(re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', company['slug']), 'Invalid new company slug')
        required(company['slug'] not in identities and normalize(company['name_en']), 'New identity conflicts with the original seed')
        required(company['status'] == 'active' and type(company['include_in_company_wall']) is bool,
                 'Explicit new company status required')
        evidence = company['identity_evidence']
        observation(evidence)
        required(on_company_domain(evidence['url'],company['official_website']), 'New company identity must have an official domain observation')
        public_url(company['official_website'])
        identities[company['slug']] = company
    seen_keys, seen_urls = set(), set()
    for source in sources:
        required(source['company_slug'] in identities, 'Industry source company is absent from the seed and manifest')
        required(source['registry_key'] not in seen_keys and source['url'] not in seen_urls, 'Duplicate industry source')
        seen_keys.add(source['registry_key']); seen_urls.add(source['url'])
        required(source['adapter'] in ('rss','official_html') and source['poll_profile'] == 'P0', 'Unsupported industry adapter/profile')
        required(source['source_type'] == ('rss' if source['adapter'] == 'rss' else 'newsroom'), 'Industry source type differs from adapter')
        config = source['config']; identity = config['company_identity']
        required(config.get('content_domain') == 'industry' and config.get('official_industry_source') is True
                 and config.get('cloud_runtime_enabled') is True, 'Official industry activation contract required')
        required(type(config.get('ai_biopharma_identity_verified')) is bool, 'Explicit industry company-scope flag required')
        required(config.get('query_version') == metadata['version'], 'Industry query version mismatch')
        required(identity['canonical_slug'] == source['company_slug']
                 and canonical(identity['official_website']) == canonical(identities[source['company_slug']]['official_website']),
                 'Industry source identity differs from the canonical seed')
        observation(identity['evidence'])
        required(on_company_domain(identity['evidence']['url'],identity['official_website']), 'Identity evidence is outside the official company domain')
        if config['ai_biopharma_identity_verified']:
            required(bool(identity['evidence'].get('quote')), 'AI biopharma identity fallback requires a dated official quote')
        hosts = config.get('allowed_hosts')
        required(isinstance(hosts,list) and hosts and len(set(hosts)) == len(hosts)
                 and all(h == public_url('https://' + h + '/').hostname and '*' not in h for h in hosts), 'Exact official host allowlist required')
        required(public_url(source['url']).hostname in hosts and all(on_company_domain('https://' + h + '/',identity['official_website']) for h in hosts),
                 'Source host is outside the declared company domain')
        robots = config['robots']; observation(robots)
        required(public_url(robots['url']).hostname == public_url(source['url']).hostname
                 and urlsplit(robots['url']).path == '/robots.txt', 'Robots evidence differs from the source host')
        required(hashlib.sha256(robots['body'].encode()).hexdigest() == robots['body_sha256'], 'Robots snapshot checksum mismatch')
        robot = RobotFileParser(); robot.parse(robots['body'].splitlines())
        delays = [float(v) for v in re.findall(r'^\s*Crawl-delay\s*:\s*(\d+(?:\.\d+)?)', robots['body'], re.I|re.M)]
        interval = config['request_interval_seconds']
        required(type(interval) in (int,float) and 1 <= interval <= 3600 and interval >= max(delays,default=0)
                 and robots['crawl_delay_seconds'] >= max(delays,default=0) and robots['allowed_source'] is True
                 and robot.can_fetch(USER_AGENT,source['url']), 'Source interval or robots snapshot disallows activation')
        provenance = config['provenance']; timestamp(provenance['live_validated_at'])
        if source['adapter'] == 'rss':
            required(config.get('official_feed_verified') is True, 'Official RSS proof flag required')
            feed = config['http_observation']; observation(feed)
            required(canonical(feed['requested_url']) == canonical(source['url']) and public_url(feed['resolved_url']).hostname in hosts,
                     'Feed observation differs from the endpoint')
            required(feed['format'] in ('rss','atom') and 0 < feed['bytes'] <= MAX_BYTES and 1 <= feed['item_count'] <= 40,
                     'Official RSS is empty or exceeds the runtime contract')
            required(timestamp(feed['latest_article_published_at']) == parsedate_to_datetime(feed['latest_article_date_raw']), 'RSS date differs from its original pubDate')
            required(public_url(feed['latest_article_url']).hostname in hosts, 'Latest RSS article is not allowlisted')
            chain = provenance['chain']; required(chain, 'Official RSS backlink proof required')
            for i, step in enumerate(chain):
                observation(step)
                required(on_company_domain(step['page_url'],identity['official_website']), 'RSS backlink page is outside the company domain')
                target = canonical(urljoin(step['page_url'],step['href']))
                expected = chain[i+1]['page_url'] if i+1 < len(chain) else source['url']
                required(target == canonical(step['target_url']) == canonical(expected), 'Official RSS discovery chain is broken')
        else:
            required(config.get('official_html_verified') is True, 'Verified official HTML contract required')
            index = provenance['index_observation']; observation(index)
            required(canonical(index['requested_url']) == canonical(source['url']) and public_url(index['resolved_url']).hostname in hosts
                     and 0 < index['bytes'] <= MAX_BYTES, 'Newsroom index observation differs from the endpoint')
            required(type(config.get('index_max_articles')) is int and 1 <= config['index_max_articles'] <= 8,
                     'Official HTML poll must retain at most eight index articles')
            prefixes = config.get('article_path_prefixes')
            required(isinstance(prefixes,list) and prefixes and all(isinstance(v,str) and v.startswith('/') and v != '/' and '..' not in v for v in prefixes),
                     'Bounded official article paths required')
            required(re.fullmatch(r'(?:[a-z][a-z0-9-]*|[.#][a-zA-Z_][\w-]*)',config['article_selector']), 'Unsupported HTML article selector')
            required(config['parse_validation'], 'Dated real article parser validation required')
            for parsed in config['parse_validation']:
                observation(parsed)
                required(public_url(parsed['url']).hostname in hosts and any(urlsplit(parsed['url']).path.startswith(v) for v in prefixes)
                         and parsed['title'] and parsed['published_at'], 'Parsed article identity/date is incomplete')
                timestamp(parsed['published_at'])
    keys = set()
    sources_by_key = {s['registry_key']:s for s in sources}
    for candidate in candidates:
        required(candidate['candidate_key'] not in keys, 'Duplicate industry event candidate')
        keys.add(candidate['candidate_key'])
        required(candidate['source_registry_key'] in sources_by_key and candidate['review_status'] == 'pending', 'Curated evidence must stay pending')
        required(candidate['event_type'] in EVENT_TYPES, 'Unsupported event candidate type')
        source = sources_by_key[candidate['source_registry_key']]
        required(public_url(candidate['canonical_url']).hostname in source['config']['allowed_hosts'], 'Candidate article host is outside its official source')
        evidence = candidate['evidence']; observation(evidence['observation'])
        required(public_url(evidence['observation']['url']).hostname in source['config']['allowed_hosts'], 'Candidate observation is outside the official source')
        dt.date.fromisoformat(candidate['published_on']); dt.date.fromisoformat(candidate['occurred_on'])
        quote, content = evidence['text'], evidence['retained_content_text']
        required(quote and content == candidate['title_original'] + '\n' + quote
                 and evidence['start'] >= 0 and evidence['end'] > evidence['start']
                 and content[evidence['start']:evidence['end']] == quote, 'Candidate evidence span does not match retained source text')
        required(len(quote.split()) <= 25 and len(quote) <= 400, 'Candidate excerpt exceeds the short evidence contract')
        required(candidate['participants'] and all(p.get('name') and (p['canonical_slug'] is None or p['canonical_slug'] in identities) for p in candidate['participants']),
                 'Candidate participants must use known canonical slugs or explicit unresolved names')
        required(candidate['details']['claim_status'] == 'official_announcement' and candidate['details']['not_independent_validation'] is True,
                 'Publisher announcement boundary required')
    return data, hashlib.sha256(payload).hexdigest()


def plan(data, checksum):
    return {'status':'dry_run','checksum':checksum,'companies':[c['slug'] for c in data['companies']],
            'sources':[{'registry_key':s['registry_key'],'adapter':s['adapter'],'url':s['url'],
                        'request_interval_seconds':s['config']['request_interval_seconds']} for s in data['sources']],
            'candidate_count':len(data['event_candidates']),'candidate_status':'pending',
            'writes_events':False,'writes_relationships':False,'writes_raw_records':False,
            'default_dry_run_loads_credentials':False}


def configure_sources(conn, data, checksum, filename):
    conn.execute('SELECT pg_advisory_xact_lock(724091436)')
    if conn.execute('SELECT 1 FROM seed_imports WHERE filename=%s AND checksum=%s',(filename,checksum)).fetchone():
        return {'status':'already_imported','companies_created':0,'sources_created':0,'sources_activated':0}
    gate = conn.execute("SELECT pg_get_functiondef(to_regprocedure('ingestion_claim(uuid,text)')) AS body").fetchone()
    required(gate and 'request_interval_seconds' in (gate['body'] or '') and 'official_html' in (gate['body'] or ''),
             'Install the official_html and request_interval_seconds runtime migrations before activation')
    runtime = (ROOT / 'cloudflare/site/ingestion.js').read_text()
    required('officialHTML' in runtime and 'official_html' in runtime, 'The deployed Worker source must integrate the official HTML adapter')
    profile = conn.execute("SELECT ttl_hours FROM polling_profiles WHERE id='P0'").fetchone()
    required(profile and profile['ttl_hours'] == 1, 'Configure P0 as hourly before industry activation')
    summary = {'status':'imported','companies_created':0,'sources_created':0,'sources_activated':0,'enabled_cloud_sources':[]}
    for company in data['companies']:
        existing = conn.execute('SELECT * FROM companies WHERE slug=%s FOR UPDATE',(company['slug'],)).fetchone()
        if existing:
            required(canonical(existing['official_website']) == canonical(company['official_website']), 'Existing new-company identity was edited; preserve the operator decision')
            continue
        cid = uuid.uuid5(NS,'company:' + company['slug'])
        names = [company['name_en'],company['name_zh'],*company['aliases']]
        collisions = conn.execute('SELECT company_id FROM company_aliases WHERE normalized=ANY(%s)',([normalize(v) for v in names if v],)).fetchall()
        required(not collisions, 'New company aliases collide with an existing identity')
        conn.execute('''INSERT INTO companies(id,slug,name_zh,name_en,aliases,track,region,focus,official_website,status,priority,include_in_company_wall,notes,seed_payload)
          VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
          (cid,company['slug'],company['name_zh'],company['name_en'],Jsonb(company['aliases']),{'AI科技':'AI与模型数据'}.get(company['track'],company['track']),company['region'],Jsonb(company['focus']),
           company['official_website'],company['status'],company['priority'],company['include_in_company_wall'],company['notes'],Jsonb(company)))
        for name,kind in [(company['name_en'],'name_en'),(company['name_zh'],'name_zh'),*[(v,'alias') for v in company['aliases']]]:
            if name:
                conn.execute("INSERT INTO company_aliases(company_id,alias,normalized,alias_type,verification_status) VALUES(%s,%s,%s,%s,'manual_reviewed')",(cid,name,normalize(name),kind))
        audit(conn,ACTOR,'import_official_industry_company','company',cid,after=company)
        summary['companies_created'] += 1
    for source in data['sources']:
        company = conn.execute('SELECT id,official_website FROM companies WHERE slug=%s',(source['company_slug'],)).fetchone()
        required(company and canonical(company['official_website']) == canonical(source['config']['company_identity']['official_website']),
                 'Runtime company identity differs from the evidence manifest')
        old = conn.execute('SELECT * FROM sources WHERE registry_key=%s OR (company_id=%s AND url=%s) FOR UPDATE',
                           (source['registry_key'],company['id'],source['url'])).fetchall()
        required(len(old) <= 1, 'Source key and official URL identify different rows; resolve before activation')
        old = old[0] if old else None
        required(not old or old['verification_status'] != 'rejected', 'Preserve the operator source rejection')
        required(not old or old['registry_key'] in (None,source['registry_key']), 'Official URL belongs to another registry key')
        required(not old or (old['company_id'] == company['id'] and canonical(old['url']) == canonical(source['url'])), 'Industry source identity was edited; preserve the operator decision')
        sid = old['id'] if old else uuid.uuid5(NS,'industry:source:' + source['registry_key'])
        active = conn.execute("SELECT id FROM ingestion_jobs WHERE source_id=%s AND status='running' AND lease_expires_at>now()",(sid,)).fetchone()
        required(not active, 'Industry source currently has a live ingestion lease; retry activation after it completes')
        config = {**(old['config'] if old else {}),**source['config']}
        if old:
            conn.execute('''UPDATE sources SET registry_key=%s,name=%s,source_type=%s,adapter=%s,poll_profile='P0',config=%s,
              enabled=true,verified=true,verification_status='verified',verified_at=COALESCE(verified_at,now()),next_poll_at=now() WHERE id=%s''',
              (source['registry_key'],source['name'],source['source_type'],source['adapter'],Jsonb(config),sid))
        else:
            conn.execute('''INSERT INTO sources(id,company_id,registry_key,name,source_type,url,adapter,poll_profile,config,enabled,verified,verification_status,verified_at)
              VALUES(%s,%s,%s,%s,%s,%s,%s,'P0',%s,true,true,'verified',now())''',
              (sid,company['id'],source['registry_key'],source['name'],source['source_type'],source['url'],source['adapter'],Jsonb(config)))
            summary['sources_created'] += 1
        method = 'official_backlink' if source['adapter'] == 'rss' else 'manual_review'
        conn.execute('''INSERT INTO verification_reviews(id,source_id,decision,method,evidence_url,evidence_text,reviewer)
          VALUES(%s,%s,'verified',%s,%s,%s,%s)''',
          (uuid.uuid4(),sid,method,config['provenance']['discovered_on'],json.dumps({'company_identity':config['company_identity'],
           'provenance':config['provenance'],'http_observation':config.get('http_observation'),'parse_validation':config.get('parse_validation')},ensure_ascii=False),ACTOR))
        audit(conn,ACTOR,'activate_official_industry_source','source',sid,before=old,after=source)
        summary['sources_activated'] += 1; summary['enabled_cloud_sources'].append(source['registry_key'])
    conn.execute('INSERT INTO seed_imports(filename,checksum,metadata) VALUES(%s,%s,%s)',(filename,checksum,Jsonb(data['metadata'])))
    return summary


def import_candidate_records(conn, data, checksum, filename):
    # Same transaction/lock as source import, with a separate once-only marker so
    # an operator can first configure feeds and later explicitly import candidates.
    filename += ':pending-candidates'
    if conn.execute('SELECT 1 FROM seed_imports WHERE filename=%s AND checksum=%s',(filename,checksum)).fetchone():
        return {'status':'already_imported','raw_records_created':0,'candidates_created':0}
    required(conn.execute("SELECT to_regclass('industry_candidates') AS name").fetchone()['name'], 'Install the private industry candidate queue migration')
    result = {'status':'imported','raw_records_created':0,'candidates_created':0,'candidate_status':'pending'}
    for candidate in data['event_candidates']:
        source = conn.execute('SELECT * FROM sources WHERE registry_key=%s FOR UPDATE',(candidate['source_registry_key'],)).fetchone()
        required(source and source['verified'] and source['enabled'], 'A curated candidate requires its current enabled verified official source')
        evidence = candidate['evidence']; content = evidence['retained_content_text']
        date_raw = evidence['observation'].get('publication_date_raw')
        published_at = parsedate_to_datetime(date_raw) if date_raw else dt.datetime.fromisoformat(candidate['published_on']).replace(tzinfo=dt.timezone.utc)
        stable = json.dumps([candidate['canonical_url'],candidate['title_original'],content,published_at.isoformat()],ensure_ascii=False)
        content_hash = hashlib.sha256(stable.encode()).hexdigest()
        rid = uuid.uuid5(NS,'industry:raw:' + candidate['candidate_key'] + ':' + content_hash)
        hint = TYPE_HINT.get(candidate['event_type'],candidate['event_type'])
        payload = {'format':evidence['observation'].get('evidence_transport','official_html'),
                   'http_status':200,'fetched_url':evidence['observation']['url'],'parser_version':'curated-official-short-excerpt-v2',
                   'source_company_id':str(source['company_id']),'content_is_full_text':False,'content_limit':{'kind':'title_plus_exact_short_excerpt','max_excerpt_words':25,
                    'actual_excerpt_words':len(evidence['text'].split()),'entire_article_retained':False},
                   'original_http_observation':evidence['observation'],'retained_evidence_span':{'start':evidence['start'],'end':evidence['end']},
                   'industry_classification':{'relevant':True,'ai_related':True,'event_types':[hint],'method':'dated-official-curated-candidate',
                    'version':data['metadata']['version'],'review_status':'unreviewed'},
                   'curated_event_candidate':{k:v for k,v in candidate.items() if k != 'evidence'},
                   'classification':{'topic_ids':[],'labels':[],'version':data['metadata']['version']}}
        inserted = conn.execute('''INSERT INTO raw_items(id,source_id,external_id,canonical_url,published_at,fetched_at,title,raw_payload,content_text,content_hash)
          VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(source_id,content_hash) DO NOTHING RETURNING id''',
          (rid,source['id'],'curated:' + candidate['candidate_key'],candidate['canonical_url'],published_at,timestamp(evidence['observation']['observed_at']),
           candidate['title_original'],Jsonb(payload),content,content_hash)).fetchone()
        if not inserted:
            rid = conn.execute('SELECT id FROM raw_items WHERE source_id=%s AND content_hash=%s',(source['id'],content_hash)).fetchone()['id']
        else:
            result['raw_records_created'] += 1
        cid = uuid.uuid5(NS,'industry:candidate:' + candidate['candidate_key'])
        queued = conn.execute('''INSERT INTO industry_candidates(id,raw_item_id,canonical_url,suggested_type,status)
          VALUES(%s,%s,%s,%s,'pending') ON CONFLICT(canonical_url) DO NOTHING RETURNING id''',(cid,rid,candidate['canonical_url'],hint)).fetchone()
        if queued:
            result['candidates_created'] += 1
            audit(conn,ACTOR,'import_pending_industry_candidate','candidate',cid,after={'candidate_key':candidate['candidate_key'],'raw_item_id':rid,
                  'content_is_full_text':False,'evidence_text':evidence['text'],'body_sha256':evidence['observation']['body_sha256'],'review_status':'pending'})
    conn.execute('INSERT INTO seed_imports(filename,checksum,metadata) VALUES(%s,%s,%s)',(filename,checksum,Jsonb({'candidate_count':len(data['event_candidates']),
                 'events_written':0,'relationships_written':0,'retained_content_kind':'title_plus_short_exact_excerpt'})))
    return result


def import_industry(path=DEFAULT_MANIFEST, include_candidates=False, conn=None):
    data, checksum = load_manifest(path)
    if conn is None:
        with connection() as opened:
            return import_industry(path,include_candidates,opened)
    result = configure_sources(conn,data,checksum,Path(path).name)
    result['checksum'] = checksum
    if include_candidates:
        result['pending_review_queue'] = import_candidate_records(conn,data,checksum,Path(path).name)
    result.update(events_written=0,relationships_written=0)
    return result


def verify_live(data):
    import httpx
    def probe(source):
        url = source['url']; config = source['config']; response = None
        try:
            # Only one endpoint per distinct host appears in this manifest. The
            # shared runtime host gate enforces its interval during actual polls.
            with httpx.Client(trust_env=False,headers={'User-Agent':USER_AGENT},timeout=20,follow_redirects=False) as client:
                current = url
                for _ in range(4):
                    with client.stream('GET',current) as response:
                        if response.status_code in (301,302,303,307,308):
                            current = urljoin(current,response.headers.get('location',''))
                            required(public_url(current).hostname in config['allowed_hosts'],'Verification redirect leaves the official host allowlist')
                            continue
                        if response.status_code != 200:
                            return {'registry_key':source['registry_key'],'http_status':response.status_code,'retry_after':response.headers.get('retry-after'),
                                    'status':'unavailable','retried':False}
                        body = bytearray()
                        for chunk in response.iter_bytes():
                            body.extend(chunk); required(len(body) <= MAX_BYTES,'Verification response exceeds bounded byte contract')
                        break
                else:
                    raise ValueError('Verification redirect bound exceeded')
            result = {'registry_key':source['registry_key'],'http_status':200,'observed_at':dt.datetime.now(dt.timezone.utc).isoformat(),
                      'body_sha256':hashlib.sha256(body).hexdigest(),'bytes':len(body),'status':'parsed'}
            if source['adapter'] == 'rss':
                from defusedxml import ElementTree
                tree = ElementTree.fromstring(body)
                items = tree.findall('.//item') or tree.findall('.//{http://www.w3.org/2005/Atom}entry')
                required(1 <= len(items) <= 40,'Live official RSS is empty or exceeds the supported item bound')
                result['item_count'] = len(items)
            else:
                code = "import fs from 'node:fs';import {indexArticles} from './cloudflare/site/official-html.js';const input=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(indexArticles(input.body,input.source)));"
                parsed = subprocess.run(['node','--input-type=module','-e',code],cwd=ROOT,input=json.dumps({'source':source,'body':body.decode('utf-8')}),
                                        text=True,capture_output=True,check=True)
                result['bounded_index_articles'] = json.loads(parsed.stdout)
            return result
        except Exception as error:
            return {'registry_key':source['registry_key'],'status':'failed','error':str(error)[:250],'retried':False}
    required(len({public_url(s['url']).hostname for s in data['sources']}) == len(data['sources']), 'Live verifier requires one source per host; use runtime host gates for shared hosts')
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        return {'status':'read_only_live_verification','sources':list(pool.map(probe,data['sources'])),'mutates_manifest':False,'mutates_database':False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest',type=Path,default=DEFAULT_MANIFEST)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--import-candidates',action='store_true')
    parser.add_argument('--verify-live',action='store_true')
    parser.add_argument('--allow-remote',action='store_true',help='Explicitly permit writes to the configured remote DB; omitted by default')
    args = parser.parse_args()
    required(not args.import_candidates or args.apply,'--import-candidates requires an explicit --apply')
    required(not args.verify_live or not args.apply,'Live verification and database mutation are separate invocations')
    data, checksum = load_manifest(args.manifest)
    if args.verify_live:
        result = verify_live(data)
    elif not args.apply:
        result = plan(data,checksum)
    else:
        load_env()
        host = urlsplit(os.environ.get('DATABASE_URL','')).hostname
        required(args.allow_remote or host in ('localhost','127.0.0.1'),'Remote writes require explicit --allow-remote; default apply is local only')
        result = import_industry(args.manifest,args.import_candidates)
    print(json.dumps(result,ensure_ascii=False,indent=2,default=str))


if __name__ == '__main__':
    main()
