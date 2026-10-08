"""Supplement imports use the existing disposable PostgreSQL test fixture only."""
import concurrent.futures
import copy
import json
import uuid

from fastapi.testclient import TestClient
import pytest

from backend.app import app
from backend.db import connection, Jsonb
from backend.identity import resolve
import scripts.import_focus_supplement as supplement

client = TestClient(app)


def write_manifest(tmp_path, data):
    path = tmp_path / 'focus-supplement.json'
    path.write_text(json.dumps(data, ensure_ascii=False))
    return path


def table_counts(conn):
    names = ['companies', 'company_aliases', 'company_identity_links', 'sources', 'verification_reviews',
             'audit_log', 'seed_imports', 'raw_items', 'events', 'ingestion_jobs']
    return {name: conn.execute('SELECT count(*) AS n FROM ' + name).fetchone()['n'] for name in names}


def test_manifest_preserves_dated_identity_and_transport_evidence():
    data, checksum = supplement.load_manifest()
    assert len(checksum) == 64
    assert len(data['companies']) == len(data['sources']) == 3
    tahoe = data['companies'][0]
    assert tahoe['aliases'][0]['alias_type'] == 'historical_brand'
    assert tahoe['aliases'][0]['evidence']['published_on'] == '2025-04-23'
    assert tahoe['aliases'][0]['valid_to'] is None
    assert data['companies'][1]['track'] == data['companies'][2]['track'] == '生物医药'
    hub = data['sources'][1]['config']
    assert hub['http_observation']['http_date'].endswith('2026 06:48:48 GMT')
    assert hub['http_observation']['latest_article_published_at'].startswith('2025-01-06')
    assert hub['request_interval_seconds'] == hub['robots']['crawl_delay_seconds'] == 10
    assert data['sources'][2]['config']['request_interval_seconds'] == 10


@pytest.mark.parametrize('change,error', [
    (lambda d: d['sources'][0]['config']['provenance']['chain'][0].update(target_url='https://unrelated.example/'), 'href'),
    (lambda d: d['sources'][1]['config'].update(request_interval_seconds=1), 'Crawl-delay'),
    (lambda d: d['sources'][2]['config'].update(allowed_hosts=['*.emulatebio.com']), 'host'),
    (lambda d: d['sources'][0]['config']['http_observation'].update(latest_article_published_at='2026-10-08T06:48:48Z'), 'Article date'),
])
def test_invalid_evidence_cannot_reach_database(tmp_path, monkeypatch, change, error):
    data, _ = supplement.load_manifest()
    change(data)
    def forbidden_connection():
        pytest.fail('Invalid manifest reached the database')
    monkeypatch.setattr(supplement, 'connection', forbidden_connection)
    with pytest.raises(ValueError, match=error):
        supplement.import_supplement(write_manifest(tmp_path, data))


def test_default_cli_is_json_only_and_never_loads_database_credentials(monkeypatch, capsys):
    monkeypatch.setattr('sys.argv', ['import_focus_supplement.py'])
    monkeypatch.setattr(supplement, 'load_env', lambda: pytest.fail('Dry run loaded credentials'))
    monkeypatch.setattr(supplement, 'connection', lambda: pytest.fail('Dry run connected to database'))
    supplement.main()
    result = json.loads(capsys.readouterr().out)
    assert result['status'] == 'dry_run'
    assert not result['writes_events'] and not result['writes_raw_records']


def test_atomic_idempotent_import_keeps_history_and_preserves_later_admin_edits():
    with connection() as conn:
        before = table_counts(conn)
    result = supplement.import_supplement()
    assert result['status'] == 'imported'
    assert result['companies_created'] == result['sources_created'] == 3
    with connection() as conn:
        after = table_counts(conn)
        assert after['companies'] == before['companies'] + 3
        assert after['sources'] == before['sources'] + 3
        assert after['verification_reviews'] == before['verification_reviews'] + 3
        assert after['seed_imports'] == before['seed_imports'] + 1
        assert after['raw_items'] == before['raw_items'] == 0
        assert after['events'] == before['events'] == 0
        assert after['ingestion_jobs'] == before['ingestion_jobs'] == 0
        vevo = resolve(conn, 'Ｖｅｖｏ Therapeutics')
        assert vevo['status'] == 'matched'
        assert vevo['candidates'][0]['slug'] == 'tahoe-therapeutics'
        assert vevo['candidates'][0]['alias_type'] == 'historical_brand'
        hub = conn.execute("SELECT * FROM companies WHERE slug='hub-organoids'").fetchone()
        assert hub['status'] == 'part_of_parent' and not hub['include_in_company_wall']
        assert hub['parent_company_id'] is None
        link = conn.execute("SELECT * FROM company_identity_links WHERE company_id=%s AND link_type='parent'", (hub['id'],)).fetchone()
        assert link['related_name'] == 'Merck KGaA, Darmstadt, Germany'
        assert link['related_company_id'] is None
        assert link['verification_status'] == 'verified'
        sources = conn.execute('SELECT * FROM sources WHERE registry_key=ANY(%s) ORDER BY registry_key', (result['enabled_cloud_sources'],)).fetchall()
        for source in sources:
            assert source['enabled'] and source['verified'] and source['verification_status'] == 'verified'
            assert source['config']['cloud_runtime_enabled'] is True
            assert source['config']['official_feed_verified'] is True
            assert source['last_success_at'] is source['etag'] is source['last_modified'] is None
            review = conn.execute('SELECT * FROM verification_reviews WHERE source_id=%s', (source['id'],)).fetchone()
            assert review['method'] == 'official_backlink'
            assert review['evidence_url'] == source['config']['provenance']['discovered_on']
            assert json.loads(review['evidence_text'])['http_observation'] == source['config']['http_observation']
        conn.execute("UPDATE sources SET enabled=false,verified=false,verification_status='rejected' WHERE registry_key='tahoe-official-rss'")
        conn.execute("UPDATE companies SET notes='Operator revised notes',aliases=aliases||'[\"Operator alias\"]'::jsonb WHERE slug='tahoe-therapeutics'")
        audit_count = conn.execute('SELECT count(*) AS n FROM audit_log').fetchone()['n']
    assert client.get('/api/companies', params={'q': 'HUB Organoids'}).json()['total'] == 0
    history = client.get('/api/companies', params={'q': 'HUB Organoids', 'history': 'true'}).json()
    assert history['total'] == 1 and history['items'][0]['status'] == 'part_of_parent'
    detail = client.get('/api/companies/hub-organoids').json()
    assert 'Merck KGaA' in detail['notes'] and '不是美国 Merck/MSD' in detail['notes']
    assert supplement.import_supplement()['status'] == 'already_imported'
    with connection() as conn:
        source = conn.execute("SELECT enabled,verification_status FROM sources WHERE registry_key='tahoe-official-rss'").fetchone()
        assert not source['enabled'] and source['verification_status'] == 'rejected'
        company = conn.execute("SELECT notes,aliases FROM companies WHERE slug='tahoe-therapeutics'").fetchone()
        assert company['notes'] == 'Operator revised notes' and 'Operator alias' in company['aliases']
        assert conn.execute('SELECT count(*) AS n FROM audit_log').fetchone()['n'] == audit_count


def test_concurrent_imports_do_not_duplicate_companies_reviews_or_feeds():
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda _: supplement.import_supplement(), range(3)))
    assert [r['status'] for r in results].count('imported') == 1
    assert [r['status'] for r in results].count('already_imported') == 2
    with connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM companies').fetchone()['n'] == 133
        assert conn.execute("SELECT count(*) AS n FROM verification_reviews WHERE reviewer='operator:focus-supplement'").fetchone()['n'] == 3


def test_failed_audit_rolls_back_the_entire_supplement(monkeypatch):
    with connection() as conn:
        before = table_counts(conn)
    original = supplement.audit
    def failing_audit(conn, actor, action, kind, entity_id, before=None, after=None):
        if action == 'import_verified_focus_feed' and after['registry_key'] == 'hub-organoids-official-rss':
            raise RuntimeError('Injected audit failure')
        return original(conn, actor, action, kind, entity_id, before=before, after=after)
    monkeypatch.setattr(supplement, 'audit', failing_audit)
    with pytest.raises(RuntimeError, match='Injected audit failure'):
        supplement.import_supplement()
    with connection() as conn:
        assert table_counts(conn) == before


def test_import_refuses_a_runtime_that_cannot_enforce_robots_spacing():
    with connection() as conn:
        before = table_counts(conn)
        conn.execute("""CREATE OR REPLACE FUNCTION ingestion_claim(p_job_id uuid,p_worker_id text) RETURNS jsonb
          LANGUAGE plpgsql AS $$ BEGIN RETURN '{"status":"disabled"}'::jsonb; END $$""")
        with pytest.raises(ValueError, match='request_interval_seconds'):
            supplement.import_supplement(conn=conn)
        assert table_counts(conn) == before
        conn.rollback()  # Restore the actual claim function for subsequent tests.


def test_imported_robots_delay_reaches_the_database_claim_gate():
    supplement.import_supplement()
    with connection() as conn:
        sid = conn.execute("SELECT id FROM sources WHERE registry_key='hub-organoids-official-rss'").fetchone()['id']
        conn.execute("DELETE FROM ingestion_host_gates WHERE host='www.huborganoids.nl'")
        jid = uuid.uuid4()
        conn.execute('INSERT INTO ingestion_jobs(id,source_id,window_start) VALUES(%s,%s,now())', (jid, sid))
        claim = conn.execute('SELECT ingestion_claim(%s,%s) AS result', (jid, 'supplement-unit-test')).fetchone()['result']
        assert claim['status'] == 'claimed'
        spacing = conn.execute("SELECT extract(epoch FROM next_request_at-now()) AS seconds FROM ingestion_host_gates WHERE host='www.huborganoids.nl'").fetchone()['seconds']
        assert 10 <= spacing <= 11
