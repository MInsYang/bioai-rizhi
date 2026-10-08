import datetime as dt,hashlib,hmac,json,os,time,uuid
from pathlib import Path
from typing import Literal
from fastapi import FastAPI,Depends,HTTPException,Request,Query
from fastapi.responses import FileResponse,RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel,Field
from .db import connection,Jsonb,audit
from .identity import resolve,sync_aliases
from .fetching import canonical
from .jobs import dispatch
ROOT=Path(__file__).resolve().parents[1]
app=FastAPI(title='BioAI 日知 · 实体与来源 API',version='2.0.0')

def admin(request:Request):
    expected=os.environ.get('ADMIN_TOKEN','');actual=request.headers.get('authorization','').removeprefix('Bearer ')
    if len(expected)<32:raise HTTPException(503,'Admin authentication is not configured')
    if not hmac.compare_digest(actual,expected):raise HTTPException(401,'Admin token required')
    return 'admin:'+hashlib.sha256(expected.encode()).hexdigest()[:12]

@app.get('/health')
def health():
    with connection() as conn:return {'database':conn.execute('SELECT 1 AS ok').fetchone()['ok'],'version':'2.0.0'}

@app.get('/api/companies')
def companies(q:str='',track:str='',region:str='',region_group:str='',history:bool=False,limit:int=Query(150,ge=1,le=200),offset:int=Query(0,ge=0)):
    conditions=[];params=[]
    if not history:conditions.append("c.include_in_company_wall AND c.status='active'")
    if q:
        conditions.append('(c.name_zh ILIKE %s OR c.name_en ILIKE %s OR EXISTS(SELECT 1 FROM company_aliases a WHERE a.company_id=c.id AND a.alias ILIKE %s))');params.extend(['%'+q+'%']*3)
    if track:conditions.append('c.track=%s');params.append(track)
    if region_group:
        from .public_api import region_clause
        clause=region_clause(region_group)
        if not clause:raise HTTPException(422,'未知地区分类')
        conditions.append('('+clause+')')
    if region:conditions.append('c.region ILIKE %s');params.append('%'+region+'%')
    where=' AND '.join(conditions) or 'true'
    with connection() as conn:
        total=conn.execute('SELECT count(*) n FROM companies c WHERE '+where,params).fetchone()['n']
        rows=conn.execute('''SELECT c.id,c.slug,c.name_zh,c.name_en,c.track,c.region,c.focus,c.official_website,c.status,c.priority,
          (SELECT count(DISTINCT e.id) FROM public_events e JOIN event_entities ee ON ee.event_id=e.id WHERE ee.entity_id=c.id AND ee.entity_type='company' AND e.review_status='approved' AND COALESCE(e.occurred_at,e.published_at)>=now()-interval '30 days') AS events_30d,
          (SELECT e.title FROM public_events e JOIN event_entities ee ON ee.event_id=e.id WHERE ee.entity_id=c.id AND ee.entity_type='company' AND e.review_status='approved' ORDER BY COALESCE(e.occurred_at,e.published_at) DESC NULLS LAST LIMIT 1) AS latest_event
          FROM companies c WHERE '''+where+' ORDER BY CASE WHEN c.region LIKE %s THEN 0 ELSE 1 END,c.name_en LIMIT %s OFFSET %s',params+['中国%',limit,offset]).fetchall()
    return {'total':total,'items':rows,'offset':offset,'limit':limit}

@app.get('/api/identity/resolve')
def identity(name:str=Query(min_length=1,max_length=200)):
    with connection() as conn:return resolve(conn,name)

@app.get('/api/companies/{slug}')
def company(slug:str):
    with connection() as conn:
        c=conn.execute('SELECT * FROM companies WHERE slug=%s',(slug,)).fetchone()
        if not c:raise HTTPException(404,'Company not found')
        c.pop('seed_payload',None)
        c['alias_records']=conn.execute('SELECT alias,alias_type,verification_status,valid_from,valid_to FROM company_aliases WHERE company_id=%s',(c['id'],)).fetchall()
        c['identity_links']=conn.execute('SELECT * FROM company_identity_links WHERE company_id=%s',(c['id'],)).fetchall()
        c['sources']=conn.execute('''SELECT id,name,source_type,url,platform,verified,verification_status,enabled,adapter,last_success_at,next_poll_at,consecutive_failures,config->>'integration_status' AS integration_status FROM sources WHERE company_id=%s AND (source_type<>'social' OR verified) ORDER BY source_type,url''',(c['id'],)).fetchall()
        c['events']=conn.execute("SELECT DISTINCT e.* FROM public_events e JOIN event_entities ee ON ee.event_id=e.id WHERE ee.entity_id=%s AND ee.entity_type='company' AND e.review_status='approved' ORDER BY e.published_at DESC NULLS LAST LIMIT 100",(c['id'],)).fetchall()
        c['relations']=conn.execute("SELECT r.* FROM relations r JOIN public_events e ON e.id=r.event_id WHERE (r.subject_id=%s OR r.object_id=%s) AND e.review_status='approved' AND EXISTS(SELECT 1 FROM event_evidence v WHERE v.event_id=e.id)",(c['id'],c['id'])).fetchall()
    return c

@app.get('/api/admin/sources',dependencies=[Depends(admin)])
def sources(status:str='',social:bool=False):
    with connection() as conn:
        return conn.execute('''SELECT s.*,c.name_zh,c.name_en FROM sources s LEFT JOIN companies c ON c.id=s.company_id
          WHERE (%s='' OR s.verification_status=%s) AND (NOT %s OR s.source_type='social') ORDER BY s.consecutive_failures DESC,s.created_at DESC LIMIT 1000''',(status,status,social)).fetchall()

class SourceInput(BaseModel):
    company_id:uuid.UUID|None=None
    name:str=Field(min_length=1,max_length=200)
    url:str=Field(max_length=2000)
    source_type:Literal['homepage','newsroom','investor_relations','blog','rss','sitemap','social','publications']
    platform:str|None=None
    poll_profile:Literal['P0','P1','P2']='P1'

@app.post('/api/admin/sources')
def add_source(body:SourceInput,actor=Depends(admin)):
    try:url=canonical(body.url)
    except ValueError as e:raise HTTPException(422,str(e))
    adapter='unsupported' if body.source_type=='social' else 'discover' if body.source_type=='homepage' else 'rss' if body.source_type=='rss' else 'sitemap' if body.source_type=='sitemap' else 'html'
    with connection() as conn:
        if body.company_id and not conn.execute('SELECT id FROM companies WHERE id=%s',(body.company_id,)).fetchone():raise HTTPException(404,'Company not found')
        result=conn.execute('''INSERT INTO sources(id,company_id,name,url,source_type,platform,poll_profile,adapter) VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(company_id,url) DO UPDATE SET url=EXCLUDED.url RETURNING *''',(uuid.uuid4(),body.company_id,body.name,url,body.source_type,body.platform,body.poll_profile,adapter)).fetchone()
        audit(conn,actor,'source_candidate','source',result['id'],after=body.model_dump(mode='json'))
    return result

class Review(BaseModel):
    decision:Literal['verified','rejected','pending']
    method:Literal['official_backlink','platform_badge','manual_review']
    evidence_url:str=Field(min_length=8,max_length=2000)
    evidence_text:str=Field(min_length=10,max_length=5000)
    enable_ingestion:bool=False

@app.post('/api/admin/sources/{source_id}/review')
def review(source_id:uuid.UUID,body:Review,actor=Depends(admin)):
    try:canonical(body.evidence_url)
    except ValueError as e:raise HTTPException(422,str(e))
    with connection() as conn:
        source=conn.execute('SELECT * FROM sources WHERE id=%s FOR UPDATE',(source_id,)).fetchone()
        if not source:raise HTTPException(404,'Source not found')
        if body.enable_ingestion and (body.decision!='verified' or source['adapter']=='unsupported'):raise HTTPException(422,'Verification and a supported adapter are required to enable ingestion')
        if body.method=='official_backlink':
            provenance=source['config'].get('provenance',{})
            if provenance.get('discovered_on')!=body.evidence_url:raise HTTPException(422,'Evidence URL must match the stored official backlink provenance; otherwise use manual review')
        conn.execute('''INSERT INTO verification_reviews(id,source_id,decision,method,evidence_url,evidence_text,reviewer) VALUES (%s,%s,%s,%s,%s,%s,%s)''',(uuid.uuid4(),source_id,body.decision,body.method,body.evidence_url,body.evidence_text,actor))
        conn.execute('''UPDATE sources SET verified=%s,verification_status=%s,verified_at=CASE WHEN %s THEN now() END,enabled=%s,next_poll_at=now() WHERE id=%s''',(body.decision=='verified',body.decision,body.decision=='verified',body.enable_ingestion,source_id))
        if not body.enable_ingestion:
            conn.execute("UPDATE ingestion_jobs SET status='dead',finished_at=now(),last_error='Source disabled by reviewer' WHERE source_id=%s AND status IN ('queued','retry')",(source_id,))
        audit(conn,actor,'review','source',source_id,source,body.model_dump())
    return {'status':body.decision,'enabled':body.enable_ingestion}

class CompanyEdit(BaseModel):
    name_zh:str=Field(max_length=200)
    name_en:str=Field(min_length=1,max_length=200)
    aliases:list[str]=Field(max_length=100)
    official_website:str
    priority:Literal['P0','P1','P2']
    notes:str=Field(max_length=10000)

@app.put('/api/admin/companies/{slug}')
def edit_company(slug:str,body:CompanyEdit,actor=Depends(admin)):
    try:url=canonical(body.official_website)
    except ValueError as e:raise HTTPException(422,str(e))
    if any(not a.strip() or len(a)>200 for a in body.aliases):raise HTTPException(422,'Invalid alias')
    with connection() as conn:
        before=conn.execute('SELECT * FROM companies WHERE slug=%s FOR UPDATE',(slug,)).fetchone()
        if not before:raise HTTPException(404,'Company not found')
        prior_names=[before[k] for k in ('name_zh','name_en') if before[k] and before[k]!=getattr(body,k)]
        applied_aliases=list(dict.fromkeys([*body.aliases,*prior_names]))
        conn.execute('UPDATE companies SET name_zh=%s,name_en=%s,aliases=%s,official_website=%s,priority=%s,notes=%s,updated_at=now() WHERE id=%s',(body.name_zh,body.name_en,Jsonb(applied_aliases),url,body.priority,body.notes,before['id']))
        conn.execute('UPDATE sources SET poll_profile=%s WHERE company_id=%s AND poll_profile=%s',(body.priority,before['id'],before['priority']))
        sync_aliases(conn,before['id'],body.name_zh,body.name_en,applied_aliases,'manual_reviewed')
        for old_name in prior_names:
            conn.execute("UPDATE company_aliases SET alias_type='historical_brand',verification_status='manual_reviewed' WHERE company_id=%s AND alias=%s",(before['id'],old_name))
        if canonical(before['official_website'])!=url:
            # A changed identity anchor requires fresh verification; old source assertions do not transfer.
            conn.execute("UPDATE sources SET enabled=false,verified=false,verification_status='pending',verified_at=NULL WHERE company_id=%s",(before['id'],))
            conn.execute("INSERT INTO sources(id,company_id,name,source_type,url,poll_profile,adapter) VALUES (%s,%s,%s,'homepage',%s,%s,'discover') ON CONFLICT DO NOTHING",(uuid.uuid4(),before['id'],body.name_en+' homepage',url,body.priority))
        audit(conn,actor,'edit','company',before['id'],before,{**body.model_dump(),'aliases':applied_aliases})
    return {'status':'updated'}

@app.get('/api/admin/jobs',dependencies=[Depends(admin)])
def jobs():
    with connection() as conn:return conn.execute('''SELECT j.*,s.name,(SELECT row_to_json(a) FROM ingestion_attempts a WHERE a.job_id=j.id ORDER BY attempt DESC LIMIT 1) AS last_attempt FROM ingestion_jobs j JOIN sources s ON s.id=j.source_id ORDER BY j.created_at DESC LIMIT 100''').fetchall()

@app.get('/api/admin/sources/{source_id}/reviews',dependencies=[Depends(admin)])
def reviews(source_id:uuid.UUID):
    with connection() as conn:return conn.execute('SELECT * FROM verification_reviews WHERE source_id=%s ORDER BY created_at DESC',(source_id,)).fetchall()

@app.post('/internal/ingestion/dispatch')
async def scheduled_dispatch(request:Request):
    secret=os.environ.get('INGEST_SECRET','');stamp=request.headers.get('x-bioai-timestamp','');signature=request.headers.get('x-bioai-signature','');body=await request.body()
    if len(secret)<32:raise HTTPException(503,'Dispatch authentication not configured')
    try:valid=abs(time.time()-int(stamp))<=300
    except ValueError:valid=False
    expected=hmac.new(secret.encode(),stamp.encode()+b'.'+body,hashlib.sha256).hexdigest()
    if not valid or not hmac.compare_digest(signature,expected):raise HTTPException(401,'Invalid dispatch signature or timestamp')
    try:
        payload=json.loads(body);when=dt.datetime.fromtimestamp(payload['scheduledAt']/1000,dt.timezone.utc)
        if abs(time.time()-when.timestamp())>86400:raise ValueError('Scheduled window out of range')
    except (ValueError,KeyError,TypeError,OverflowError):raise HTTPException(422,'Invalid scheduled payload')
    ids=dispatch(when)
    return {'dispatched':len(ids),'job_ids':ids}

from .public_api import router as public_router
from .editorial import build_router
app.include_router(public_router)
app.include_router(build_router(admin))

@app.get('/registry')
@app.get('/registry/companies/{slug}')
def registry(slug:str|None=None):return RedirectResponse('/#company/'+slug if slug else '/#directory',status_code=307)
@app.get('/admin')
def admin_page():return RedirectResponse('/#admin',status_code=307)
app.mount('/',StaticFiles(directory=ROOT/'dist',html=True),name='bioai-site')
