#!/usr/bin/env python3
"""Configure the bounded cloud source set; keep all 130 seed companies and original provenance.

Run after migrations/seed. This is the deliberate activation step for public metadata feeds.
--dry-run prints the source plan. --backfill updates classification only, never content hashes.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.manage import load_env
from backend.db import connection, Jsonb, audit

NS = uuid.UUID('b5b62e53-9a2a-4dbf-9c95-e3366b875730')


def topic_contract():
    code = "import {FOCUSED_QUERY,PUBMED_QUERY,QUERY_VERSION,TOPICS} from './cloudflare/site/topics.js'; console.log(JSON.stringify({FOCUSED_QUERY,PUBMED_QUERY,QUERY_VERSION,TOPICS}));"
    result = subprocess.run(['node', '--input-type=module', '-e', code], cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def source_query_version(base_version, adapter, query):
    """A cursor belongs to the exact query, rather than only the shared taxonomy version."""
    stable = json.dumps({'base_version': base_version, 'adapter': adapter, 'query': query}, sort_keys=True, ensure_ascii=False)
    return base_version + '-' + hashlib.sha256(stable.encode()).hexdigest()[:12]


def backfill(conn):
    code = "import fs from 'node:fs'; import {classify} from './cloudflare/site/topics.js'; const rows=JSON.parse(fs.readFileSync(0,'utf8')); console.log(JSON.stringify(rows.map(r=>({id:r.id,classification:classify(r.title,r.content_text)}))));"
    changed = 0
    after = '00000000-0000-0000-0000-000000000000'
    while True:
        rows = conn.execute('SELECT id,title,content_text FROM raw_items WHERE id>%s::uuid ORDER BY id LIMIT 100', (after,)).fetchall()
        if not rows:
            break
        payload = json.dumps(rows, default=str, ensure_ascii=False)
        result = subprocess.run(['node', '--input-type=module', '-e', code], cwd=ROOT, input=payload, capture_output=True, text=True, check=True)
        for row in json.loads(result.stdout):
            changed += conn.execute("UPDATE raw_items SET raw_payload=jsonb_set(raw_payload,'{classification}',%s) WHERE id=%s AND raw_payload->'classification' IS DISTINCT FROM %s RETURNING id",
                                    (Jsonb(row['classification']), row['id'], Jsonb(row['classification']))).rowcount
        after = str(rows[-1]['id'])
    return changed


def configure(do_backfill=False):
    contract = topic_contract()
    version = contract['QUERY_VERSION']
    public = [
        ('europe-pmc', 'Europe PMC', 'academic_api', 'europepmc', 'https://www.ebi.ac.uk/europepmc/webservices/rest/',
         'https://europepmc.org/RestfulWebService', contract['FOCUSED_QUERY'], True),
        ('pubmed-eutils', 'PubMed / NCBI E-utilities', 'academic_api', 'pubmed', 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/',
         'https://www.ncbi.nlm.nih.gov/books/NBK25501/', contract['PUBMED_QUERY'], True),
        ('biorxiv', 'bioRxiv API', 'preprint_api', 'biorxiv', 'https://api.biorxiv.org/details/biorxiv/',
         'https://api.biorxiv.org/', 'Shared automated topic filter; see topics.js', False),
    ]
    summary = {'query_version': version, 'source_query_versions': {}, 'enabled_cloud_sources': [], 'degraded_sources': ['biorxiv'], 'backfilled_records': 0}
    with connection() as conn:
        conn.execute('SELECT pg_advisory_xact_lock(724091410)')
        conn.execute("UPDATE polling_profiles SET ttl_hours=1 WHERE id='P0'")
        # Only sources owned by this configuration are changed. Independent verified
        # company-feed imports and operator decisions on other sources are preserved.
        for key, name, kind, adapter, url, documentation, query, enabled in public:
            old = conn.execute('SELECT * FROM sources WHERE registry_key=%s FOR UPDATE', (key,)).fetchone()
            sid = old['id'] if old else uuid.uuid5(NS, 'public:' + key)
            config = dict(old['config']) if old else {}
            query_version = source_query_version(version, adapter, query)
            legacy_same_query = config.get('query_version') == version and config.get('query') == query
            if not legacy_same_query and (config.get('query_version') != query_version or config.get('query') != query):
                config.pop('cursor_date', None)
            config.update(cloud_runtime_enabled=enabled, integration_status='implemented', query=query, query_version=query_version,
                          api_documentation=documentation, bootstrap_days=30, lookback_days=3, window_days=7,
                          scope='Five focused topics; automated keyword classification, original metadata retained')
            if adapter == 'biorxiv':
                config.update(operational_status='degraded', fallback_registry_key='europe-pmc',
                              operational_note='Direct API returned HTTP 500 during dated live validation; Europe PMC PPR records are the alternate discovery source.',
                              upstream_validation_report='docs/academic-e2e-result.json')
            else:
                config.update(operational_status='configured')
            conn.execute('''INSERT INTO sources(id,registry_key,name,source_type,url,poll_profile,adapter,config,enabled,verified,verification_status,verified_at)
                VALUES (%s,%s,%s,%s,%s,'P0',%s,%s,%s,true,'verified',now())
                ON CONFLICT(registry_key) DO UPDATE SET adapter=EXCLUDED.adapter,config=EXCLUDED.config,poll_profile='P0',
                 enabled=EXCLUDED.enabled,verified=true,verification_status='verified',verified_at=COALESCE(sources.verified_at,now()),next_poll_at=now()''',
                         (sid, key, name, kind, url, adapter, Jsonb(config), enabled))
            if not old or not old['verified']:
                conn.execute("INSERT INTO verification_reviews(id,source_id,decision,method,evidence_url,evidence_text,reviewer) VALUES (%s,%s,'verified','manual_review',%s,%s,'operator:focus-config')",
                             (uuid.uuid4(), sid, documentation, 'Official public API documentation identifies this endpoint. Source identity verification does not claim uptime, completeness or peer review.'))
            audit(conn, 'operator:focus-config', 'configure_focused_public_api', 'source', sid,
                  after={'adapter': adapter, 'cloud_runtime_enabled': enabled, 'query_version': query_version, 'query': query})
            summary['source_query_versions'][key] = query_version
            if enabled:
                summary['enabled_cloud_sources'].append(key)

        # Reuse the audited homepage -> RSS lineage. No other company source is guessed.
        proof_path = ROOT / 'docs/e2e-result.json'
        proof = json.loads(proof_path.read_text()) if proof_path.exists() else {}
        homepage, feed_url = 'https://www.xtalpi.com/', 'https://www.xtalpi.com/feed/'
        if proof.get('status') == 'passed' and proof.get('homepage') == homepage and proof.get('feed') == feed_url:
            company = conn.execute("SELECT id FROM companies WHERE slug='xtalpi'").fetchone()
            if company:
                old = conn.execute('SELECT * FROM sources WHERE company_id=%s AND url=%s FOR UPDATE', (company['id'], feed_url)).fetchone()
                sid = old['id'] if old else uuid.uuid5(NS, 'source:xtalpi:' + feed_url)
                prior_config = old['config'] if old else {}
                config = {**prior_config, 'cloud_runtime_enabled': True, 'official_feed_verified': True,
                          'allowed_hosts': ['www.xtalpi.com', 'xtalpi.com'], 'query_version': version,
                          'integration_status': 'implemented', 'verification_report': str(proof_path.relative_to(ROOT)),
                          'provenance': prior_config.get('provenance') or {'discovered_on': homepage, 'method': 'official_homepage_backlink',
                                         'live_validated_at': proof.get('finished_at')},
                          'scope': 'Only feed items matching the five article topics; no company capability assertions'}
                conn.execute('''INSERT INTO sources(id,company_id,name,source_type,url,poll_profile,enabled,adapter,verified,verification_status,verified_at,config)
                  VALUES(%s,%s,'XtalPi official RSS','rss',%s,'P0',true,'rss',true,'verified',now(),%s)
                  ON CONFLICT(company_id,url) DO UPDATE SET poll_profile='P0',enabled=true,adapter='rss',verified=true,
                   verification_status='verified',verified_at=COALESCE(sources.verified_at,now()),config=EXCLUDED.config,next_poll_at=now()''',
                             (sid, company['id'], feed_url, Jsonb(config)))
                if not old or not old['verified']:
                    conn.execute("INSERT INTO verification_reviews(id,source_id,decision,method,evidence_url,evidence_text,reviewer) VALUES(%s,%s,'verified','official_backlink',%s,%s,'operator:focus-config')",
                                 (uuid.uuid4(), sid, homepage, 'Reused the successful dated official homepage -> RSS live-validation report, with its original timestamp.'))
                audit(conn, 'operator:focus-config', 'configure_verified_company_feed', 'source', sid, after=config)
                summary['enabled_cloud_sources'].append('xtalpi-official-rss')
        if do_backfill:
            summary['backfilled_records'] = backfill(conn)
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--backfill', action='store_true')
    args = parser.parse_args()
    if args.dry_run:
        print(json.dumps({'contract': topic_contract(), 'cloud_adapters': ['europepmc','pubmed','verified-official-rss'],
                          'biorxiv': 'degraded; Europe PMC alternate', 'keeps_existing_company_registry': True}, ensure_ascii=False, indent=2))
        return
    load_env()
    print(json.dumps(configure(args.backfill), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
