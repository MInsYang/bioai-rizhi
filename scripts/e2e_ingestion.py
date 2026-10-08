"""Live E2E: real official homepage -> discovery -> reviewed RSS -> PG job -> raw records.
Requires local API server; never fabricates a successful source or event.
"""
import datetime as dt,hashlib,hmac,json,os,sys,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts.manage import load_env
load_env()
import httpx
from backend.db import connection
from backend.jobs import claim
from backend.worker import run_job
BASE='http://127.0.0.1:8000'

def dispatch():
    body=json.dumps({'scheduledAt':int(time.time()*1000),'windowHours':2});stamp=str(int(time.time()))
    signature=hmac.new(os.environ['INGEST_SECRET'].encode(),(stamp+'.'+body).encode(),hashlib.sha256).hexdigest()
    r=httpx.post(BASE+'/internal/ingestion/dispatch',content=body,headers={'X-BioAI-Timestamp':stamp,'X-BioAI-Signature':signature},timeout=30,trust_env=False);r.raise_for_status();return r.json()

def main():
    report={'started_at':dt.datetime.now(dt.timezone.utc).isoformat(),'real_network':True,'steps':[]}
    try:
        with connection() as conn:
            s=conn.execute("SELECT s.* FROM sources s JOIN companies c ON c.id=s.company_id WHERE c.slug='xtalpi' AND s.source_type='homepage'").fetchone()
            if not s:raise RuntimeError('XtalPi homepage missing from supplied seed')
        report['homepage']=s['url'];report['steps'].append({'dispatch':dispatch()})
        job=claim('live-e2e-homepage',s['id'])
        if not job:raise RuntimeError('No due homepage job; inspect previous run instead of fabricating a result')
        result=run_job(job);report['steps'].append({'homepage_job':str(job['id']),**result})
        if result['status']!='succeeded':raise RuntimeError(result.get('error','Homepage discovery failed'))
        with connection() as conn:
            candidates=conn.execute("SELECT * FROM sources WHERE company_id=%s AND source_type='rss' AND config->'provenance'->>'discovered_on' IS NOT NULL ORDER BY url",(s['company_id'],)).fetchall()
        if not candidates:raise RuntimeError('Official homepage did not expose an RSS candidate')
        feed=next((c for c in candidates if 'comments' not in c['url']),candidates[0]);report['feed']=feed['url']
        response=httpx.post(BASE+f"/api/admin/sources/{feed['id']}/review",headers={'Authorization':'Bearer '+os.environ['ADMIN_TOKEN']},json={'decision':'verified','method':'official_backlink','evidence_url':feed['config']['provenance']['discovered_on'],'evidence_text':'E2E verified RSS link directly present in fetched official XtalPi homepage HTML; article facts remain unreviewed.','enable_ingestion':True},timeout=30,trust_env=False);response.raise_for_status()
        report['steps'].append({'verification':response.json()});dispatch();job=claim('live-e2e-rss',feed['id'])
        if not job:raise RuntimeError('No RSS job was dispatched')
        result=run_job(job);report['steps'].append({'rss_job':str(job['id']),**result})
        if result['status']!='succeeded':raise RuntimeError(result.get('error','RSS ingestion failed'))
        with connection() as conn:
            rows=conn.execute('SELECT id,title,canonical_url,published_at,content_hash FROM raw_items WHERE source_id=%s ORDER BY fetched_at DESC LIMIT 5',(feed['id'],)).fetchall()
            total=conn.execute('SELECT count(*) n FROM raw_items WHERE source_id=%s',(feed['id'],)).fetchone()['n']
            report['audit']=conn.execute('SELECT http_status,duration_ms,bytes_fetched,parsed_count,result FROM ingestion_attempts WHERE job_id=%s',(job['id'],)).fetchone()
        if not rows:raise RuntimeError('Feed request succeeded but no raw record was persisted')
        report.update(status='passed',raw_count=total,samples=rows,events_created=0)
    except Exception as e:
        report.update(status='failed',error=str(e));raise
    finally:
        report['finished_at']=dt.datetime.now(dt.timezone.utc).isoformat();path=Path(__file__).resolve().parents[1]/'docs/e2e-result.json';path.write_text(json.dumps(report,ensure_ascii=False,indent=2,default=str));print(json.dumps({k:report[k] for k in ['status','homepage','feed','raw_count','error'] if k in report},ensure_ascii=False))
if __name__=='__main__':main()
