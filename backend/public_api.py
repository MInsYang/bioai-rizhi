"""The single read model for the website: source records and reviewed facts stay separate."""
import datetime as dt
import uuid
from fastapi import APIRouter, HTTPException, Query
from .db import connection

router = APIRouter(prefix='/api')
# Expressions used with psycopg parameters must escape literal percent signs.
def region_clause(region, alias='c'):
    expressions = {
        'cn': f"{alias}.region LIKE '中国%%' AND {alias}.region NOT LIKE '%%/%%' AND {alias}.region NOT LIKE '%%香港%%'",
        'hk': f"{alias}.region LIKE '%%香港%%' AND {alias}.region NOT LIKE '%%/%%'",
        'global': f"{alias}.region NOT LIKE '中国%%' AND {alias}.region NOT LIKE '%%/%%'",
        'cross': f"{alias}.region LIKE '%%/%%'",
    }
    return expressions.get(region)


def dates(days, start, end, field):
    if start and end and start > end:
        raise HTTPException(422, '开始日期不能晚于结束日期')
    where, args = [], []
    if start:
        where.append(field + ' >= %s'); args.append(start)
    elif days:
        where.append(field + " >= now()-make_interval(days=>%s)"); args.append(days)
    if end:
        where.append(field + ' < %s'); args.append(end + dt.timedelta(days=1))
    return where, args


def event_query(q='', track='', region='', event_type='', days=30, start=None, end=None, company='', picked=False):
    clauses, args = dates(days, start, end, 'COALESCE(e.occurred_at,e.published_at)')
    if q:
        clauses.append('(e.title ILIKE %s OR e.summary ILIKE %s)'); args += ['%'+q+'%'] * 2
    for key, val in [('track', track), ('event_type', event_type)]:
        if val: clauses.append('e.'+key+'=%s'); args.append(val)
    if picked: clauses.append('e.editor_pick')
    if region or company:
        sub = "ee.event_id=e.id AND ee.entity_type='company'"
        if company: sub += ' AND c.slug=%s'; args.append(company)
        if region:
            rc = region_clause(region)
            if not rc: raise HTTPException(422, '未知地区分类')
            sub += ' AND ('+rc+')'
        clauses.append('EXISTS(SELECT 1 FROM event_entities ee JOIN companies c ON c.id=ee.entity_id WHERE '+sub+')')
    return ' AND '.join(clauses) or 'true', args


EVENT_FIELDS = '''e.*,COALESCE(e.occurred_at,e.published_at) AS display_date,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'slug',c.slug,'track',c.track,'name',COALESCE(NULLIF(c.name_zh,''),c.name_en)))
 FROM event_entities ee JOIN companies c ON c.id=ee.entity_id WHERE ee.event_id=e.id AND ee.entity_type='company'),'[]') AS companies,
 COALESCE((SELECT jsonb_agg(DISTINCT v.academic) FROM public_evidence v WHERE v.event_id=e.id AND v.academic IS NOT NULL),'[]') AS academic'''

@router.get('/overview')
def overview():
    with connection() as c:
        counts = c.execute('''SELECT
         (SELECT count(*) FROM companies WHERE status='active' AND include_in_company_wall) AS companies,
         (SELECT count(*) FROM public_events) AS events,
         (SELECT count(*) FROM public_records) AS records,
         (SELECT count(*) FROM sources WHERE verified AND enabled AND adapter<>'unsupported') AS connected_sources,
         (SELECT count(*) FROM sources) AS sources,
         (SELECT max(last_success_at) FROM sources WHERE verified) AS last_success_at,
         (SELECT count(*) FROM relations r JOIN public_events e ON e.id=r.event_id) AS relations''').fetchone()
        counts['cadence_hours'] = 1
        counts['scheduler_last_dispatch_at'] = c.execute("SELECT max(created_at) AS value FROM ingestion_jobs").fetchone()['value']
        counts['tracks'] = c.execute('SELECT track,count(*) AS count FROM companies WHERE status=\'active\' AND include_in_company_wall GROUP BY track ORDER BY track').fetchall()
        return counts

@router.get('/events')
def events(q: str='', track: str='', region: str='', event_type: str='', days: int=Query(30,ge=0,le=3660),
           start: dt.date|None=None, end: dt.date|None=None, company: str='', picked: bool=False,
           limit: int=Query(60,ge=1,le=200), offset: int=Query(0,ge=0)):
    where, args = event_query(q,track,region,event_type,days,start,end,company,picked)
    with connection() as c:
        total=c.execute('SELECT count(*) n FROM public_events e WHERE '+where,args).fetchone()['n']
        items=c.execute('SELECT '+EVENT_FIELDS+' FROM public_events e WHERE '+where+' ORDER BY display_date DESC NULLS LAST,e.id LIMIT %s OFFSET %s',args+[limit,offset]).fetchall()
    return dict(total=total,items=items,limit=limit,offset=offset)

@router.get('/events/{event_id}')
def event_detail(event_id: uuid.UUID):
    with connection() as c:
        event=c.execute('SELECT '+EVENT_FIELDS+' FROM public_events e WHERE e.id=%s',(event_id,)).fetchone()
        if not event: raise HTTPException(404,'事件不存在或尚未发布')
        event['evidence']=c.execute('SELECT * FROM public_evidence WHERE event_id=%s',(event_id,)).fetchall()
        event['relations']=c.execute('SELECT * FROM relations WHERE event_id=%s',(event_id,)).fetchall()
    return event

@router.get('/graph')
def graph(q: str='', track: str='', region: str='', event_type: str='', days: int=Query(30,ge=0,le=3660), start: dt.date|None=None,end: dt.date|None=None):
    where,args=event_query(q,track,region,event_type,days,start,end)
    with connection() as c:
        edges=c.execute('''SELECT r.id,r.subject_id,r.object_id,r.predicate,r.event_id,e.title,e.evidence_count,
         COALESCE(e.occurred_at,e.published_at) AS display_date
         FROM relations r JOIN public_events e ON e.id=r.event_id
         JOIN companies s ON s.id=r.subject_id JOIN companies o ON o.id=r.object_id
         WHERE r.subject_type='company' AND r.object_type='company' AND '''+where+
         ' ORDER BY display_date DESC NULLS LAST,r.id LIMIT 300',args).fetchall()
        ids=list({e[k] for e in edges for k in ('subject_id','object_id')})
        nodes=c.execute('SELECT id,slug,name_zh,name_en,track,region FROM companies WHERE id=ANY(%s)',(ids,)).fetchall() if ids else []
    return dict(nodes=nodes,edges=edges,limit=300)

@router.get('/records')
def records(q: str='', academic: bool|None=None, company: str='', source: str='', days: int=Query(30,ge=0,le=3660),
            limit: int=Query(40,ge=1,le=100),offset: int=Query(0,ge=0)):
    clauses,args=dates(days,None,None,'COALESCE(r.published_at,r.fetched_at)')
    if academic is not None:
        clauses.append("(r.registry_key IN ('pubmed-eutils','biorxiv','medrxiv','europe-pmc','crossref')) IS "+('TRUE' if academic else 'NOT TRUE'))
    if q: clauses.append('(r.title ILIKE %s OR r.content_text ILIKE %s)'); args+=['%'+q+'%']*2
    if company: clauses.append('r.company_slug=%s');args.append(company)
    if source: clauses.append('r.registry_key=%s');args.append('pubmed-eutils' if source=='pubmed' else source)
    where=' AND '.join(clauses) or 'true'
    with connection() as c:
        total=c.execute('SELECT count(*) n FROM public_records r WHERE '+where,args).fetchone()['n']
        rows=c.execute('''SELECT r.id,r.title,left(r.content_text,400) AS excerpt,r.canonical_url,r.published_at,r.fetched_at,
         r.source_name,r.source_type,r.company_slug,r.company_name,r.company_name_en,r.registry_key,r.external_id,
         r.raw_payload->'academic' AS academic FROM public_records r WHERE '''+where+
         ' ORDER BY COALESCE(r.published_at,r.fetched_at) DESC,r.id LIMIT %s OFFSET %s',args+[limit,offset]).fetchall()
    return dict(total=total,items=rows,limit=limit,offset=offset)

@router.get('/records/{record_id}')
def record_detail(record_id: uuid.UUID):
    with connection() as c:
        row=c.execute('''SELECT r.id,r.title,r.content_text,r.canonical_url,r.published_at,r.fetched_at,r.source_name,r.source_type,
         r.company_slug,r.company_name,r.registry_key,r.external_id,r.content_hash,r.raw_payload->'academic' AS academic
         FROM public_records r WHERE r.id=%s''',(record_id,)).fetchone()
        if not row: raise HTTPException(404,'原文不存在或来源尚未验证')
        return row

@router.get('/sources')
def source_coverage():
    with connection() as c:
        return c.execute('''SELECT s.id,s.name,s.source_type,s.url,s.verified,s.verification_status,s.enabled,s.adapter,
         s.last_success_at,s.next_poll_at,s.consecutive_failures,c.slug AS company_slug,c.name_zh,c.name_en,p.ttl_hours,
         (SELECT count(*) FROM raw_items r WHERE r.source_id=s.id) AS raw_count
         FROM sources s LEFT JOIN companies c ON c.id=s.company_id JOIN polling_profiles p ON p.id=s.poll_profile
         WHERE s.source_type<>'social' OR s.verified ORDER BY s.last_success_at DESC NULLS LAST,s.name''').fetchall()
