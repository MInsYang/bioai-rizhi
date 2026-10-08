"""Publication boundaries tested with fixtures only in an isolated, disposable database."""
import datetime as dt
import json
import uuid
import pytest
from fastapi.testclient import TestClient
from backend.app import app
from backend.db import connection, Jsonb
from backend.academic import collect, parse_pubmed
from backend.fetching import Response
client=TestClient(app)
auth={'Authorization':'Bearer '+'a'*40}


def fixture_raw():
    sid,rid=uuid.uuid4(),uuid.uuid4()
    with connection() as c:
        company=c.execute("SELECT id FROM companies WHERE slug='seekgene'").fetchone()['id']
        other=c.execute("SELECT id FROM companies WHERE slug='novogene'").fetchone()['id']
        c.execute("INSERT INTO sources(id,company_id,name,source_type,url,poll_profile,verified,verification_status) VALUES (%s,%s,'UNIT TEST SOURCE','rss','https://example.org/feed','P0',true,'verified')",(sid,company))
        c.execute("INSERT INTO raw_items(id,source_id,title,canonical_url,published_at,content_text,content_hash) VALUES (%s,%s,'UNIT TEST ONLY','https://example.org/a',now(),'This fixture explicitly states two companies collaborate on a test project.','fixture')",(rid,sid))
    return sid,rid,company,other


def payload(rid,a,b):
    quote='This fixture explicitly states two companies collaborate on a test project.'
    return dict(request_id=str(uuid.uuid4()),raw_item_id=str(rid),title='UNIT TEST: collaboration',summary='UNIT TEST ONLY: two companies collaborate.',evidence_text=quote,track='测序与多组学',event_type='partnership',company_ids=[str(a),str(b)],relations=[dict(subject_id=str(a),object_id=str(b),predicate='collaborates_with',evidence_text=quote)])


def test_empty_database_does_not_load_static_snapshots():
    assert client.get('/api/events?days=0').json()['total']==0
    assert client.get('/api/graph?days=0').json()=={'nodes':[],'edges':[],'limit':300}
    assert client.get('/api/overview').json()['records']==0
    for q,slug in [('寻因','seekgene'),('新格元','singleron-biotechnologies'),('诺禾','novogene')]:
        assert client.get('/api/companies',params={'q':q}).json()['items'][0]['slug']==slug
    for region in ['cn','global','cross']:
        response=client.get('/api/companies',params={'region_group':region})
        assert response.status_code==200 and response.json()['total']>0
    assert client.get('/api/events?start=2026-10-10&end=2026-10-01').status_code==422


def test_event_publication_is_audited_idempotent_and_revocable():
    sid,rid,a,b=fixture_raw();body=payload(rid,a,b)
    assert client.post('/api/admin/events',json=body).status_code==401
    bad={**body,'evidence_text':'This sentence does not exist in the original saved source.'}
    assert client.post('/api/admin/events',json=bad,headers=auth).status_code==422
    r=client.post('/api/admin/events',json=body,headers=auth)
    assert r.status_code==200,r.text
    eid=r.json()['id']
    assert client.post('/api/admin/events',json=body,headers=auth).json()['id']==eid
    assert client.get('/api/events?days=0').json()['total']==1
    detail=client.get('/api/events/'+eid).json()
    assert detail['evidence_count']==1 and len(detail['companies'])==2
    assert len(client.get('/api/graph?days=0').json()['edges'])==1
    assert client.get('/api/companies/seekgene').json()['events'][0]['id']==eid
    company_list=client.get('/api/companies?q=寻因').json()['items'][0]
    assert company_list['events_30d']==1 and company_list['latest_event']==body['title']
    with connection() as c:
        assert c.execute("SELECT count(*) n FROM audit_log WHERE action='publish_event'").fetchone()['n']==1
        c.execute("UPDATE sources SET verified=false,verification_status='rejected' WHERE id=%s",(sid,))
    assert client.get('/api/events?days=0').json()['total']==0
    assert client.get('/api/graph?days=0').json()['edges']==[]
    assert client.get('/api/events/'+eid).status_code==404
    assert client.get('/api/records/'+str(rid)).status_code==404
    assert client.get('/api/companies/seekgene').json()['events']==[]
    assert client.get('/api/companies?q=寻因').json()['items'][0]['events_30d']==0


def test_graph_requires_explicit_relationship_and_valid_participants():
    sid,rid,a,b=fixture_raw();body=payload(rid,a,b)
    body['relations'][0]['object_id']=str(uuid.uuid4())
    assert client.post('/api/admin/events',json=body,headers=auth).status_code==422
    body['relations']=[]
    eid=client.post('/api/admin/events',json=body,headers=auth).json()['id']
    assert client.get('/api/graph?days=0').json()['edges']==[]
    assert client.post('/api/admin/events/'+eid+'/unpublish',headers=auth).status_code==200
    assert client.get('/api/events?days=0').json()['total']==0


def test_latest_raw_revision_and_academic_filter():
    with connection() as c:
        s=c.execute("UPDATE sources SET verified=true,verification_status='verified' WHERE registry_key='pubmed-eutils' RETURNING id").fetchone()['id']
        for i in range(2):
            c.execute("INSERT INTO raw_items(id,source_id,external_id,title,content_hash,fetched_at,raw_payload) VALUES (%s,%s,'PMID:123',%s,%s,now()+make_interval(secs=>%s),%s)",(uuid.uuid4(),s,'revision '+str(i),str(i),i,Jsonb({'academic':{'pmid':'123','status':'indexed'}})))
    data=client.get('/api/records?academic=true&source=pubmed&days=0').json()
    assert data['total']==1 and data['items'][0]['title']=='revision 1'
    assert client.get('/api/records?academic=false&days=0').json()['total']==0


def test_pubmed_parser_does_not_infer_peer_review():
    xml='<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>123</PMID><Article><ArticleTitle>Test paper</ArticleTitle><Abstract><AbstractText>Test abstract</AbstractText></Abstract><ArticleDate><Year>2026</Year><Month>10</Month><Day>01</Day></ArticleDate><PublicationTypeList><PublicationType>Preprint</PublicationType></PublicationTypeList></Article></MedlineCitation></PubmedArticle></PubmedArticleSet>'
    r=parse_pubmed(xml)[0]
    assert r['external_id']=='PMID:123' and r['raw_payload']['academic']['status']=='preprint'
    assert r['published_at'].date()==dt.date(2026,10,1)
    with pytest.raises(ValueError):parse_pubmed('<html/>')


def test_biorxiv_pagination_preserves_versions(monkeypatch):
    urls=[]
    def get(url):
        urls.append(url);cursor=int(url.split('/')[-2]);item={'doi':'10.1101/test','version':str(cursor+1),'title':'Foundation model fixture','abstract':'Test only','date':'2026-10-01','published':'10.1000/journal'}
        data={'messages':[{'status':'ok','total':2}],'collection':[item]}
        return Response(url,200,{},json.dumps(data),100,1)
    monkeypatch.setattr('backend.academic.fetch',get)
    monkeypatch.setattr('backend.academic.time.sleep',lambda x:None)
    rows,metrics,cursor=collect({'adapter':'biorxiv','config':{}})
    assert len(urls)==2 and len(rows)==2
    assert rows[0]['external_id']!=rows[1]['external_id']
    assert rows[0]['raw_payload']['academic']['journal_doi']=='10.1000/journal'
    assert metrics['bytes_fetched']==200


def test_pubmed_partial_response_never_advances_cursor(monkeypatch):
    def get(url):
        text=json.dumps({'esearchresult':{'count':'1','idlist':['123']}}) if 'esearch' in url else '<PubmedArticleSet/>'
        return Response(url,200,{},text,len(text),1)
    monkeypatch.setattr('backend.academic.fetch',get)
    monkeypatch.setattr('backend.academic.time.sleep',lambda x:None)
    with pytest.raises(ValueError,match='batch incomplete'):
        collect({'adapter':'pubmed','config':{}})


def test_academic_version_and_metadata_updates_have_distinct_hashes():
    from backend.academic import academic_record
    args=('https://doi.org/10.1101/test','Same title','Same abstract',None)
    a=academic_record(*args,'doi:v1',{'academic':{'version':'1','journal_doi':None}})
    b=academic_record(*args,'doi:v2',{'academic':{'version':'2','journal_doi':None}})
    correction=academic_record(*args,'doi:v2',{'academic':{'version':'2','journal_doi':'10.1000/published'}})
    assert len({x['content_hash'] for x in [a,b,correction]})==3


def test_preprint_status_survives_review_and_raw_queue_paginates():
    sid,rid,a,b=fixture_raw()
    with connection() as c:
        c.execute('UPDATE raw_items SET raw_payload=%s WHERE id=%s',(Jsonb({'academic':{'status':'preprint','version':'2','doi':'10.1101/unit-test'}}),rid))
        extra=uuid.uuid4()
        c.execute("INSERT INTO raw_items(id,source_id,title,content_hash,content_text,fetched_at) VALUES (%s,%s,'OLDER UNIT TEST','older','Unit test only',now()-interval '1 day')",(extra,sid))
    body=payload(rid,a,b);body['track']='学术进展';body['event_type']='paper';body['editor_pick']=True
    eid=client.post('/api/admin/events',headers=auth,json=body).json()['id']
    result=client.get('/api/events?days=0&picked=true').json()['items'][0]
    assert result['academic'][0]['status']=='preprint' and result['academic'][0]['version']=='2'
    assert client.get('/api/events/'+eid).json()['evidence'][0]['academic']['doi']=='10.1101/unit-test'
    first=client.get('/api/admin/records?limit=1&offset=0',headers=auth).json()
    second=client.get('/api/admin/records?limit=1&offset=1',headers=auth).json()
    assert first[0]['id']==str(rid) and second[0]['id']==str(extra)
