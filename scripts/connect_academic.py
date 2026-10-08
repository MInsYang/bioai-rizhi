"""Register documented public APIs with an auditable verification; process only these sources."""
import datetime as dt,json,sys,uuid
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts.manage import load_env
load_env()
from backend.db import connection,Jsonb,audit
from backend.jobs import dispatch,claim
from backend.worker import run_job
from backend.academic import PUBMED_QUERY

def main():
    report={'started_at':dt.datetime.now(dt.timezone.utc).isoformat(),'real_network':True,'sources':[]}
    for key,adapter,doc in [('pubmed-eutils','pubmed','https://www.ncbi.nlm.nih.gov/books/NBK25501/'),('biorxiv','biorxiv','https://api.biorxiv.org/')]:
        with connection() as c:
            s=c.execute('SELECT * FROM sources WHERE registry_key=%s FOR UPDATE',(key,)).fetchone()
            if not s:raise RuntimeError('Seed source missing: '+key)
            config={**s['config'],'integration_status':'implemented','query':PUBMED_QUERY if adapter=='pubmed' else 'BioAI topic filter; see backend/academic.py','api_documentation':doc}
            c.execute("UPDATE sources SET adapter=%s,enabled=true,verified=true,verification_status='verified',verified_at=now(),poll_profile='P0',config=%s WHERE id=%s",(adapter,Jsonb(config),s['id']))
            if not s['verified']:
                c.execute("INSERT INTO verification_reviews(id,source_id,decision,method,evidence_url,evidence_text,reviewer) VALUES (%s,%s,'verified','manual_review',%s,%s,'operator:documented-public-api')",(uuid.uuid4(),s['id'],doc,'Official public API documentation identifies this endpoint; metadata indexing does not establish peer review.'))
                audit(c,'operator:documented-public-api','connect_public_api','source',s['id'],after={'adapter':adapter,'documentation':doc})
        dispatched=dispatch(source_id=s['id']);job=claim('academic-live-validation',s['id'])
        result=run_job(job) if job else {'status':'not_due','dispatched':len(dispatched)}
        with connection() as c:
            count=c.execute('SELECT count(*) n FROM raw_items WHERE source_id=%s',(s['id'],)).fetchone()['n']
            latest=c.execute('SELECT title,canonical_url,external_id FROM raw_items WHERE source_id=%s ORDER BY fetched_at DESC LIMIT 3',(s['id'],)).fetchall()
        with connection() as c:
            audit_row=c.execute('''SELECT a.http_status,a.duration_ms,a.bytes_fetched,a.parsed_count,a.result,a.finished_at,j.status AS job_status,j.attempts
              FROM ingestion_jobs j JOIN ingestion_attempts a ON a.job_id=j.id WHERE j.source_id=%s ORDER BY a.started_at DESC LIMIT 1''',(s['id'],)).fetchone()
            success=c.execute('SELECT last_success_at FROM sources WHERE id=%s',(s['id'],)).fetchone()['last_success_at']
        report['sources'].append({'registry_key':key,**result,'total_raw_records':count,'samples':latest,'last_attempt':audit_row,'last_success_at':success})
        print(key,result,flush=True)
    report['finished_at']=dt.datetime.now(dt.timezone.utc).isoformat()
    Path('docs/academic-e2e-result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2,default=str))
    if any(s['status']=='failed' for s in report['sources']):sys.exit(1)
if __name__=='__main__':main()
