import concurrent.futures,datetime as dt,json,time,uuid,hmac,hashlib
import pytest
from fastapi.testclient import TestClient
from backend.app import app
from backend.db import connection
from backend.seed import seed
from backend.identity import resolve,sync_aliases
from backend.jobs import dispatch,claim,fail,owned
from backend.discovery import discover
from backend.parsing import parse_feed
from backend.fetching import public_url,canonical
from backend.worker import run_job
from backend.fetching import Response
client=TestClient(app);auth={'Authorization':'Bearer '+'a'*40}

def source(adapter='rss',enabled=True):
    sid=uuid.uuid4()
    with connection() as c:c.execute("INSERT INTO sources(id,name,source_type,url,poll_profile,adapter,enabled,verified,verification_status) VALUES (%s,'test fixture','rss','https://example.org/feed','P0',%s,%s,true,'verified')",(sid,adapter,enabled))
    return sid

def test_seed_idempotence_and_alias_brand_resolution():
    seed()
    with connection() as c:
        assert c.execute('SELECT count(*) n FROM companies').fetchone()['n']==130
        assert c.execute('SELECT count(*) n FROM seed_imports').fetchone()['n']==2
        assert resolve(c,'新格元生物')['candidates'][0]['slug']=='singleron-biotechnologies'
        assert resolve(c,'ＰＡＣＢＩＯ')['candidates'][0]['slug']=='pacbio'
        assert resolve(c,'NanoString')['candidates'][0]['slug']=='bruker-spatial-biology'
        assert resolve(c,'EvolutionaryScale')['candidates'][0]['status']=='part_of_parent'
        assert c.execute('SELECT count(*) n FROM raw_items').fetchone()['n']==0
        assert c.execute('SELECT count(*) n FROM events').fetchone()['n']==0
        assert not c.execute('SELECT id FROM sources WHERE adapter=\'unsupported\' AND enabled').fetchone()

def test_ambiguous_aliases_are_not_merged():
    with connection() as c:
        rows=c.execute("SELECT * FROM companies WHERE slug IN ('pacbio','illumina')").fetchall()
        for r in rows:sync_aliases(c,r['id'],r['name_zh'],r['name_en'],['shared-brand'])
        assert resolve(c,'shared brand')['status']=='ambiguous'
        assert len(resolve(c,'shared brand')['candidates'])==2

def test_company_api_and_manual_edits_survive_import():
    assert client.get('/api/companies',params={'q':'寻因'}).json()['items'][0]['slug']=='seekgene'
    c=client.get('/api/companies/pacbio').json()
    body={k:c[k] for k in ['name_zh','name_en','aliases','official_website','priority','notes']};body['aliases'].append('PB verified alias')
    assert client.put('/api/admin/companies/pacbio',json=body).status_code==401
    assert client.put('/api/admin/companies/pacbio',json=body,headers=auth).status_code==200
    seed()
    assert client.get('/api/identity/resolve',params={'name':'PB verified alias'}).json()['status']=='matched'

def test_discovery_candidates_not_implicitly_verified():
    html='<a href="https://investors.example.org/news">Investors</a><link type="application/rss+xml" href="/feed"><a href="https://www.linkedin.com/company/example">LinkedIn</a><a href="https://x.com/intent/tweet">Share</a>'
    result=discover(html,'https://example.org/')
    assert {r['source_type'] for r in result}=={'investor_relations','rss','social'}
    assert not any('intent' in r['url'] for r in result)

def test_social_verification_does_not_enable_unsupported_scraper():
    r=client.post('/api/admin/sources',headers=auth,json={'name':'Social fixture','url':'https://x.com/example','source_type':'social'});assert r.status_code==200
    sid=r.json()['id'];body={'decision':'verified','method':'manual_review','evidence_url':'https://example.org/about','evidence_text':'Admin reviewed ownership against official company page.','enable_ingestion':True}
    assert client.post(f'/api/admin/sources/{sid}/review',headers=auth,json=body).status_code==422
    body['enable_ingestion']=False
    assert client.post(f'/api/admin/sources/{sid}/review',headers=auth,json=body).status_code==200
    with connection() as c:
        s=c.execute('SELECT * FROM sources WHERE id=%s',(sid,)).fetchone();assert s['verified'] and not s['enabled']
        assert c.execute('SELECT count(*) n FROM verification_reviews').fetchone()['n']==1

def test_concurrent_dispatch_and_claim_are_unique():
    sid=source()
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:results=list(pool.map(lambda _:dispatch(source_id=sid),range(6)))
    assert sum(map(len,results))==1
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:jobs=list(pool.map(lambda i:claim('w'+str(i),sid),range(6)))
    assert len([j for j in jobs if j])==1
    with connection() as c:assert c.execute('SELECT count(*) n FROM ingestion_attempts').fetchone()['n']==1

def test_retry_backoff_dead_letter_and_stale_lease():
    sid=source();dispatch(source_id=sid);j=claim('first',sid);fail(j,RuntimeError('fixture failure'))
    assert claim('early',sid) is None
    with connection() as c:c.execute("UPDATE ingestion_jobs SET available_at=now()-interval '1 second' WHERE source_id=%s",(sid,))
    j2=claim('second',sid)
    with connection() as c:
        with pytest.raises(RuntimeError):owned(c,j)
        c.execute("UPDATE ingestion_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=%s",(j2['id'],))
    j3=claim('third',sid);assert j3['attempts']==3;fail(j3,RuntimeError('last failure'))
    with connection() as c:
        assert c.execute('SELECT status FROM ingestion_jobs WHERE id=%s',(j3['id'],)).fetchone()['status']=='dead'
        assert c.execute('SELECT consecutive_failures FROM sources WHERE id=%s',(sid,)).fetchone()['consecutive_failures']==3

def test_etag_304_and_raw_dedup(monkeypatch):
    sid=source();dispatch(source_id=sid);j=claim('w',sid)
    xml='<rss><channel><item><title>Unit test fixture</title><link>https://example.org/a?utm_source=x</link><pubDate>Mon, 14 Sep 2026 00:00:00 GMT</pubDate><description>Fixture content only</description></item></channel></rss>'
    monkeypatch.setattr('backend.worker.check_robots',lambda url:None)
    monkeypatch.setattr('backend.worker.fetch',lambda *a:Response('https://example.org/feed',200,{'etag':'v1'},xml,len(xml),1))
    assert run_job(j)['raw_inserted']==1
    with connection() as c:
        c.execute('UPDATE sources SET next_poll_at=now() WHERE id=%s',(sid,))
    future=dt.datetime.now(dt.timezone.utc)+dt.timedelta(hours=2);dispatch(future,sid);j=claim('w',sid)
    assert run_job(j)['raw_inserted']==0
    with connection() as c:c.execute('UPDATE sources SET next_poll_at=now() WHERE id=%s',(sid,))
    dispatch(future+dt.timedelta(hours=2),sid);j=claim('w',sid)
    def response(url,headers):
        assert headers['If-None-Match']=='v1';return Response(url,304,{},'',0,1)
    monkeypatch.setattr('backend.worker.fetch',response)
    assert run_job(j)['http_status']==304
    with connection() as c:assert c.execute('SELECT count(*) n FROM raw_items').fetchone()['n']==1

def test_failure_does_not_block_other_source(monkeypatch):
    a=source();b=source();dispatch(source_id=a);dispatch(source_id=b)
    monkeypatch.setattr('backend.worker.check_robots',lambda url:None)
    monkeypatch.setattr('backend.worker.fetch',lambda *a:Response('https://example.org/feed',503,{},'',0,1))
    assert run_job(claim('w',a))['status']=='failed'
    assert claim('other',b) is not None

def test_dispatch_signature_replay_and_unverified_source():
    sid=source(enabled=False);payload=json.dumps({'scheduledAt':int(time.time()*1000),'windowHours':2});stamp=str(int(time.time()))
    headers={'X-BioAI-Timestamp':stamp,'X-BioAI-Signature':hmac.new(b'b'*40,(stamp+'.'+payload).encode(),hashlib.sha256).hexdigest()}
    assert client.post('/internal/ingestion/dispatch',content=payload).status_code==401
    result=client.post('/internal/ingestion/dispatch',content=payload,headers=headers);assert result.status_code==200
    assert str(sid) not in result.json()['job_ids']
    again=client.post('/internal/ingestion/dispatch',content=payload,headers=headers);assert again.json()['dispatched']==0
    headers['X-BioAI-Timestamp']='1';assert client.post('/internal/ingestion/dispatch',content=payload,headers=headers).status_code==401

def test_unsafe_urls_and_bad_feeds_are_rejected():
    for url in ['http://example.org','https://127.0.0.1/','https://[::1]/','https://u:p@example.org/']:
        with pytest.raises(ValueError):public_url(url)
    with pytest.raises(ValueError):parse_feed('<html><body/></html>','https://example.org')
    assert canonical('https://example.org/news?utm_source=a&id=1#x')=='https://example.org/news?id=1'


def test_renaming_preserves_historical_identity():
    c=client.get('/api/companies/pacbio').json()
    body={k:c[k] for k in ['name_zh','name_en','aliases','official_website','priority','notes']}
    body['name_en']='New test brand'
    assert client.put('/api/admin/companies/pacbio',json=body,headers=auth).status_code==200
    old=client.get('/api/identity/resolve',params={'name':'PacBio'}).json()
    assert old['status']=='matched' and old['candidates'][0]['alias_type']=='historical_brand'
    assert client.get('/api/identity/resolve',params={'name':'New test brand'}).json()['candidates'][0]['slug']=='pacbio'


def test_registry_and_admin_share_original_shell():
    for path,target in [('/registry','/#directory'),('/registry/companies/seekgene','/#company/seekgene'),('/admin','/#admin')]:
        response=client.get(path,follow_redirects=False)
        assert response.status_code==307 and response.headers['location']==target
    page=client.get('/').text
    for marker in ['data-nav="timeline"','data-nav="directory"','data-nav="admin"','registry-panel.js','admin-panel.js']:assert marker in page
    assert 'data-registry' not in page
    assert client.get('/registry-panel.js').status_code==200
