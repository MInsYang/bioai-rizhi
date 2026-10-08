"""Manual, audited publication. Raw ingestion never silently becomes a factual event."""
import datetime as dt
import uuid
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from .db import connection, Jsonb, audit

class Edge(BaseModel):
    subject_id: uuid.UUID
    object_id: uuid.UUID
    predicate: Literal['collaborates_with','invests_in','acquires','licenses_from','co_develops','adopts_platform','co_publishes']
    evidence_text: str=Field(min_length=10,max_length=10000)

class Publication(BaseModel):
    request_id: uuid.UUID
    raw_item_id: uuid.UUID
    title: str=Field(min_length=5,max_length=500)
    summary: str=Field(min_length=10,max_length=2000)
    evidence_text: str=Field(min_length=20,max_length=10000)
    track: Literal['测序与多组学','生物医药','AI与模型数据','学术进展']
    event_type: Literal['funding','partnership','acquisition','licensing','product','clinical','regulatory','strategy','paper','model','dataset','other']
    occurred_at: dt.datetime|None=None
    company_ids: list[uuid.UUID]=Field(default_factory=list,max_length=20)
    relations: list[Edge]=Field(default_factory=list,max_length=20)
    editor_pick: bool=False
    amount: str=Field(default='',max_length=100)
    stage: str=Field(default='',max_length=100)


def build_router(admin):
    router=APIRouter(prefix='/api/admin',dependencies=[Depends(admin)])
    @router.get('/records')
    def queue(limit: int=Query(100,ge=1,le=200), offset: int=Query(0,ge=0)):
        with connection() as c:
            return c.execute('''SELECT r.*,s.name AS source_name,s.verified,s.company_id,
             (SELECT count(*) FROM event_evidence v WHERE v.raw_item_id=r.id) AS event_count
             FROM raw_items r JOIN sources s ON s.id=r.source_id
             ORDER BY r.fetched_at DESC,r.id LIMIT %s OFFSET %s''',(limit,offset)).fetchall()

    @router.post('/events')
    def publish(body: Publication, actor=Depends(admin)):
        with connection() as c:
            # Serialize repeated browser submissions, including concurrent requests.
            c.execute('SELECT pg_advisory_xact_lock(hashtext(%s))',(str(body.request_id),))
            existing=c.execute('SELECT id FROM events WHERE request_id=%s',(body.request_id,)).fetchone()
            if existing: return dict(id=existing['id'],status='already_published')
            raw=c.execute('''SELECT r.*,s.verified FROM raw_items r JOIN sources s ON s.id=r.source_id
             WHERE r.id=%s FOR SHARE OF s''',(body.raw_item_id,)).fetchone()
            if not raw: raise HTTPException(404,'找不到原始记录')
            if not raw['verified']: raise HTTPException(422,'请先验证来源归属')
            content=raw['content_text'] or ''
            start=content.find(body.evidence_text)
            if start<0: raise HTTPException(422,'证据句必须完整摘自已保存的原文正文')
            ids=set(body.company_ids)
            found=c.execute('SELECT id FROM companies WHERE id=ANY(%s)',(list(ids),)).fetchall() if ids else []
            if {x['id'] for x in found}!=ids: raise HTTPException(422,'公司实体不存在')
            for edge in body.relations:
                if edge.subject_id==edge.object_id or not {edge.subject_id,edge.object_id}<=ids:
                    raise HTTPException(422,'关系两端必须是本事件中不同的公司')
                if edge.evidence_text not in body.evidence_text:
                    raise HTTPException(422,'关系必须有属于该事件证据的原文句子')
            eid=uuid.uuid4()
            c.execute('''INSERT INTO events(id,request_id,event_type,title,summary,occurred_at,published_at,confidence,
             review_status,editor_pick,extraction_version,track,details)
             VALUES (%s,%s,%s,%s,%s,%s,%s,0.9,'approved',%s,'manual-review-v1',%s,%s)''',
             (eid,body.request_id,body.event_type,body.title,body.summary,body.occurred_at,raw['published_at'],
              body.editor_pick,body.track,Jsonb({'amount':body.amount,'stage':body.stage,'reviewed_by':actor})))
            c.execute('INSERT INTO event_evidence(event_id,raw_item_id,evidence_text,evidence_start,evidence_end) VALUES (%s,%s,%s,%s,%s)',
                      (eid,raw['id'],body.evidence_text,start,start+len(body.evidence_text)))
            for cid in ids:
                c.execute("INSERT INTO event_entities VALUES (%s,'company',%s,'participant')",(eid,cid))
            for edge in body.relations:
                c.execute('''INSERT INTO relations(id,subject_type,subject_id,predicate,object_type,object_id,event_id,confidence,valid_from)
                 VALUES (%s,'company',%s,%s,'company',%s,%s,0.9,%s) ON CONFLICT DO NOTHING''',
                 (uuid.uuid4(),edge.subject_id,edge.predicate,edge.object_id,eid,body.occurred_at))
            audit(c,actor,'publish_event','event',eid,after=body.model_dump(mode='json'))
        return dict(id=eid,status='published')

    @router.post('/events/{event_id}/unpublish')
    def unpublish(event_id: uuid.UUID,actor=Depends(admin)):
        with connection() as c:
            old=c.execute('UPDATE events SET review_status=\'pending\' WHERE id=%s RETURNING id',(event_id,)).fetchone()
            if not old: raise HTTPException(404,'找不到事件')
            audit(c,actor,'unpublish_event','event',event_id)
        return dict(status='unpublished')
    return router
