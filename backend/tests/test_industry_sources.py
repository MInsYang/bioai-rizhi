"""Official source activation and private candidate import use disposable PG only."""
import concurrent.futures
import copy
import json
import uuid

import pytest

from backend.db import Jsonb, connection
import scripts.configure_industry as industry


def counts(conn):
    return {name:conn.execute('SELECT count(*) AS n FROM ' + name).fetchone()['n'] for name in
            ['companies','company_aliases','sources','verification_reviews','audit_log','seed_imports',
             'raw_items','events','relations','industry_candidates']}


def write_manifest(tmp_path,data):
    path = tmp_path / 'industry.json'
    path.write_text(json.dumps(data,ensure_ascii=False))
    return path


def test_manifest_preserves_live_official_identity_dates_and_bounds():
    data, checksum = industry.load_manifest()
    assert len(checksum) == 64
    assert len(data['sources']) == 9 and len(data['event_candidates']) == 12
    assert [c['slug'] for c in data['companies']] == ['nvidia']
    assert sum(s['adapter']=='rss' for s in data['sources']) == 5
    assert sum(s['adapter']=='official_html' for s in data['sources']) == 4
    generate = next(s for s in data['sources'] if s['company_slug']=='generate-biomedicines')
    assert generate['url'].endswith('/news-releases/feed/')
    assert generate['config']['request_interval_seconds'] == 10
    assert generate['config']['http_observation']['item_count'] == 10
    latest = next(c for c in data['event_candidates'] if c['candidate_key']=='iambic-iam217-ind-20261005')
    assert latest['details']['milestone']=='IND_submission'
    assert not latest['details']['clinical_benefit_demonstrated']
    absci = next(c for c in data['event_candidates'] if c['candidate_key'].startswith('absci-abs201'))
    assert not absci['details']['trial_started'] and absci['details']['planned_initiation']=='mid-2027'


def test_iambic_index_mode_keeps_historical_provenance_and_separate_dated_approval():
    data, checksum = industry.load_manifest()
    source = next(s for s in data['sources'] if s['registry_key'] == 'iambic-official-newsroom')
    config = source['config']
    assert config['collection_mode'] == 'index_metadata' and config['official_index_verified'] is True
    assert config['query_version'] == 'official-index-2026-11-v1'
    assert config['collection_mode_review']['reviewed_on'] == '2026-11-22'
    assert config['collection_mode_review']['fulltext_status'] == 'not_fetched'
    assert set(config['allowed_hosts']) == {'www.iambic.ai', 'ir.iambic.ai'}
    assert config['provenance']['live_validated_at'].startswith('2026-10-08')
    assert all(p['observed_at'].startswith('2026-10-08') for p in config['parse_validation'])
    assert all('collection_mode' not in s['config'] for s in data['sources'] if s is not source)
    planned = next(s for s in industry.plan(data, checksum)['sources'] if s['registry_key'] == source['registry_key'])
    assert planned['collection_mode'] == 'index_metadata'


@pytest.mark.parametrize('change', [
    lambda c:c.update(collection_mode='automatic_metadata_fallback'),
    lambda c:c.update(query_version='industry-2026-10-v2'),
    lambda c:c.update(official_index_verified=False),
    lambda c:c.update(allowed_hosts=['www.iambic.ai', 'ir.iambic.ai', 'evil.example']),
    lambda c:c.update(article_path_prefixes=['/post/', '/']),
    lambda c:c.pop('collection_mode_review'),
    lambda c:c['collection_mode_review'].update(fulltext_status='fetched'),
    lambda c:c['collection_mode_review'].update(reviewed_on='2026-02-30'),
])
def test_iambic_metadata_contract_fails_before_credentials_or_database(tmp_path, monkeypatch, change):
    data, _ = industry.load_manifest()
    change(next(s for s in data['sources'] if s['registry_key'] == 'iambic-official-newsroom')['config'])
    monkeypatch.setattr(industry, 'connection', lambda:pytest.fail('Invalid index mode reached database'))
    monkeypatch.setattr(industry, 'load_env', lambda:pytest.fail('Invalid index mode loaded credentials'))
    with pytest.raises(ValueError):
        industry.import_industry(write_manifest(tmp_path, data))


def test_generic_manifest_reimport_cannot_revert_approved_index_mode(tmp_path):
    industry.import_industry()
    data, _ = industry.load_manifest()
    source = next(s for s in data['sources'] if s['registry_key'] == 'iambic-official-newsroom')
    source['config'].pop('collection_mode')
    source['config'].pop('official_index_verified')
    source['config'].pop('collection_mode_review')
    source['config']['query_version'] = data['metadata']['version']
    with connection() as conn:
        before = counts(conn)
    with pytest.raises(ValueError, match='Preserve the approved index metadata mode'):
        industry.import_industry(write_manifest(tmp_path, data))
    with connection() as conn:
        assert counts(conn) == before
        assert conn.execute("SELECT config->>'collection_mode' AS mode FROM sources WHERE registry_key='iambic-official-newsroom'").fetchone()['mode'] == 'index_metadata'


@pytest.mark.parametrize('redirect', [False, True])
def test_live_verifier_uses_index_mode_and_never_follows_a_detail_redirect(monkeypatch, redirect):
    import contextlib
    import httpx
    from types import SimpleNamespace
    data, _ = industry.load_manifest()
    source = next(s for s in data['sources'] if s['registry_key'] == 'iambic-official-newsroom')
    calls = []
    card = ('<div data-news-primary="">Press</div><div data-news-date="">November 18, 2026</div>'
            '<div data-news-title="">Iambic clinical drug development update</div>'
            '<a class="link-w-arrow" href="/post/{slug}">Read more</a>')
    body = ('<div data-news-featured="">' + card.format(slug='featured') + '</div>'
            '<div data-news-archive=""><div role="list"><div role="listitem">'
            + card.format(slug='archived') + '</div></div></div>').encode()

    class Client:
        def __init__(self, **options):
            assert options['follow_redirects'] is False and options['trust_env'] is False
        def __enter__(self):
            return self
        def __exit__(self, *args):
            return False
        def stream(self, method, url):
            calls.append((method, url))
            return contextlib.nullcontext(SimpleNamespace(status_code=302 if redirect else 200,
                headers={'location':'https://www.iambic.ai/post/forbidden-detail'}, iter_bytes=lambda:iter([body])))

    monkeypatch.setattr(httpx, 'Client', Client)
    result = industry.verify_live({'sources':[source]})['sources'][0]
    assert calls == [('GET', source['url'])]
    if redirect:
        assert result['status'] == 'failed' and 'redirects are refused' in result['error']
    else:
        assert result['status'] == 'parsed' and result['collection_mode'] == 'index_metadata'
        assert result['fulltext_status'] == 'not_fetched' and result['excluded_pdf_count'] == 0
        assert len(result['bounded_index_articles']) == 2


@pytest.mark.parametrize('change,error',[
    (lambda d:d['sources'][0]['config'].update(allowed_hosts=['evil.example']), 'host|domain'),
    (lambda d:d['sources'][4]['config'].update(request_interval_seconds=1), 'robots'),
    (lambda d:d['sources'][1]['config']['http_observation'].update(item_count=0), 'empty'),
    (lambda d:d['sources'][5]['config'].update(index_max_articles=100), 'eight'),
    (lambda d:d['event_candidates'][0]['evidence'].update(text='This was not actually observed'), 'span'),
    (lambda d:d['event_candidates'][0].update(review_status='approved'), 'pending'),
    (lambda d:d['event_candidates'][0]['participants'][0].update(canonical_slug='invented-company'), 'canonical'),
])
def test_bad_manifest_never_loads_credentials_or_reaches_database(tmp_path,monkeypatch,change,error):
    data,_ = industry.load_manifest(); change(data)
    monkeypatch.setattr(industry,'connection',lambda:pytest.fail('Invalid evidence reached database'))
    monkeypatch.setattr(industry,'load_env',lambda:pytest.fail('Invalid evidence loaded credentials'))
    with pytest.raises(ValueError,match=error):
        industry.import_industry(write_manifest(tmp_path,data),True)


def test_default_cli_is_credential_free_read_only_dry_run(monkeypatch,capsys):
    monkeypatch.setattr('sys.argv',['configure_industry.py'])
    monkeypatch.setattr(industry,'load_env',lambda:pytest.fail('Dry run loaded credentials'))
    monkeypatch.setattr(industry,'connection',lambda:pytest.fail('Dry run connected'))
    industry.main()
    result=json.loads(capsys.readouterr().out)
    assert result['status']=='dry_run'
    assert not result['writes_events'] and not result['writes_relationships'] and not result['writes_raw_records']


def test_atomic_idempotent_import_creates_private_candidates_with_exact_short_evidence():
    with connection() as conn: before=counts(conn)
    result=industry.import_industry(include_candidates=True)
    assert result['status']=='imported' and result['sources_created']==9
    assert result['companies_created']==1 and result['sources_activated']==9
    assert result['pending_review_queue']['raw_records_created']==12
    assert result['pending_review_queue']['candidates_created']==12
    with connection() as conn:
        after=counts(conn)
        assert conn.execute("SELECT track FROM companies WHERE slug='nvidia'").fetchone()['track']=='AI与模型数据'
        assert after['companies']==before['companies']+1
        assert after['sources']==before['sources']+9
        assert after['verification_reviews']==before['verification_reviews']+9
        assert after['events']==before['events']==0
        assert after['relations']==before['relations']==0
        assert after['industry_candidates']==after['raw_items']==12
        rows=conn.execute('''SELECT q.status,r.content_text,r.raw_payload FROM industry_candidates q JOIN raw_items r ON r.id=q.raw_item_id''').fetchall()
        for row in rows:
            assert row['status']=='pending'
            payload=row['raw_payload']; span=payload['retained_evidence_span']
            assert payload['content_is_full_text'] is False
            assert payload['content_limit']['entire_article_retained'] is False
            assert row['content_text'][span['start']:span['end']]
            assert len(row['content_text'][span['start']:span['end']].split())<=25
            assert payload['original_http_observation']['http_status']==200
        conn.execute("UPDATE sources SET enabled=false,verified=false,verification_status='rejected' WHERE registry_key='xtalpi-official-rss'")
        conn.execute("UPDATE companies SET notes='Operator updated notes' WHERE slug='nvidia'")
        conn.execute("UPDATE industry_candidates SET status='dismissed' WHERE canonical_url=(SELECT canonical_url FROM industry_candidates ORDER BY id LIMIT 1)")
        edited=counts(conn)
    again=industry.import_industry(include_candidates=True)
    assert again['status']=='already_imported' and again['pending_review_queue']['status']=='already_imported'
    with connection() as conn:
        assert counts(conn)==edited
        assert conn.execute("SELECT notes FROM companies WHERE slug='nvidia'").fetchone()['notes']=='Operator updated notes'
        assert not conn.execute("SELECT enabled FROM sources WHERE registry_key='xtalpi-official-rss'").fetchone()['enabled']


def test_candidates_can_be_imported_later_without_reactivating_sources():
    first=industry.import_industry()
    assert first['status']=='imported' and 'pending_review_queue' not in first
    with connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM raw_items').fetchone()['n']==0
    second=industry.import_industry(include_candidates=True)
    assert second['status']=='already_imported' and second['pending_review_queue']['candidates_created']==12
    with connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM events').fetchone()['n']==0


def test_existing_xtalpi_feed_is_reused_and_transport_metadata_preserved():
    old_id=uuid.uuid4()
    with connection() as conn:
        cid=conn.execute("SELECT id FROM companies WHERE slug='xtalpi'").fetchone()['id']
        conn.execute('''INSERT INTO sources(id,company_id,name,source_type,url,poll_profile,adapter,config,enabled,verified,verification_status,etag)
          VALUES(%s,%s,'Existing feed','rss','https://www.xtalpi.com/feed/','P0','rss',%s,true,true,'verified','preserved-etag')''',
          (old_id,cid,Jsonb({'operator_custom_setting':'preserve'})))
    result=industry.import_industry()
    assert result['sources_created']==8
    with connection() as conn:
        row=conn.execute("SELECT * FROM sources WHERE registry_key='xtalpi-official-rss'").fetchone()
        assert row['id']==old_id and row['etag']=='preserved-etag'
        assert row['config']['operator_custom_setting']=='preserve'
        assert conn.execute("SELECT count(*) AS n FROM sources WHERE url='https://www.xtalpi.com/feed/'").fetchone()['n']==1


def test_rejected_existing_source_rolls_back_the_whole_manifest():
    with connection() as conn:
        cid=conn.execute("SELECT id FROM companies WHERE slug='xtalpi'").fetchone()['id']
        conn.execute('''INSERT INTO sources(id,company_id,name,source_type,url,poll_profile,adapter,verification_status)
          VALUES(%s,%s,'Rejected source','rss','https://www.xtalpi.com/feed/','P0','rss','rejected')''',(uuid.uuid4(),cid))
        before=counts(conn)
    with pytest.raises(ValueError,match='source rejection'):
        industry.import_industry(include_candidates=True)
    with connection() as conn: assert counts(conn)==before


def test_missing_html_runtime_gate_prevents_any_registry_mutation():
    with connection() as conn:
        before=counts(conn)
        conn.execute("""CREATE OR REPLACE FUNCTION ingestion_claim(p_job_id uuid,p_worker_id text) RETURNS jsonb
          LANGUAGE plpgsql AS $$ BEGIN RETURN '{"status":"disabled"}'::jsonb; END $$""")
        with pytest.raises(ValueError,match='runtime migrations'):
            industry.import_industry(conn=conn)
        assert counts(conn)==before
        conn.rollback()


def test_concurrent_registry_import_applies_once():
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        results=list(pool.map(lambda _:industry.import_industry(include_candidates=True),range(3)))
    assert [r['status'] for r in results].count('imported')==1
    assert [r['status'] for r in results].count('already_imported')==2
    with connection() as conn:
        assert conn.execute("SELECT count(*) AS n FROM verification_reviews WHERE reviewer=%s",(industry.ACTOR,)).fetchone()['n']==9
        assert conn.execute('SELECT count(*) AS n FROM industry_candidates').fetchone()['n']==12


def test_audit_failure_rolls_back_sources_company_raw_records_and_queue(monkeypatch):
    with connection() as conn: before=counts(conn)
    original=industry.audit
    def failing(conn,actor,action,kind,entity_id,before=None,after=None):
        if action=='import_pending_industry_candidate': raise RuntimeError('Injected industry audit failure')
        return original(conn,actor,action,kind,entity_id,before=before,after=after)
    monkeypatch.setattr(industry,'audit',failing)
    with pytest.raises(RuntimeError,match='Injected industry'):
        industry.import_industry(include_candidates=True)
    with connection() as conn: assert counts(conn)==before
