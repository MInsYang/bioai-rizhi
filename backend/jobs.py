import datetime as dt,uuid,traceback
from .db import connection
UTC=dt.timezone.utc

def dispatch(scheduled_at=None,source_id=None):
    when=scheduled_at or dt.datetime.now(UTC)
    window=when.replace(minute=0,second=0,microsecond=0)
    created=[]
    with connection() as conn:
        rows=conn.execute('''SELECT s.id,p.ttl_hours FROM sources s JOIN polling_profiles p ON p.id=s.poll_profile
          WHERE (%s::uuid IS NULL OR s.id=%s::uuid) AND s.enabled AND s.adapter<>'unsupported' AND (s.verified OR s.adapter='discover') AND s.next_poll_at<=now()
          AND NOT EXISTS(SELECT 1 FROM ingestion_jobs j WHERE j.source_id=s.id AND j.status IN ('queued','retry','running'))
          ORDER BY s.next_poll_at LIMIT 500 FOR UPDATE OF s SKIP LOCKED''',(source_id,source_id)).fetchall()
        for s in rows:
            job=conn.execute('''INSERT INTO ingestion_jobs(id,source_id,window_start) VALUES (%s,%s,%s)
              ON CONFLICT DO NOTHING RETURNING id''',(uuid.uuid4(),s['id'],window)).fetchone()
            if job:
                created.append(job['id'])
                conn.execute("UPDATE sources SET next_poll_at=now()+make_interval(hours=>%s) WHERE id=%s",(s['ttl_hours'],s['id']))
    return created

def claim(worker_id,source_id=None):
    with connection() as conn:
        expired=conn.execute("SELECT * FROM ingestion_jobs WHERE status='running' AND lease_expires_at<now() FOR UPDATE SKIP LOCKED").fetchall()
        for j in expired:
            dead=j['attempts']>=j['max_attempts']
            conn.execute("UPDATE ingestion_attempts SET finished_at=now(),result='lease_expired',error_stack='Worker lease expired' WHERE job_id=%s AND attempt=%s AND finished_at IS NULL",(j['id'],j['attempts']))
            conn.execute("UPDATE ingestion_jobs SET status=%s,available_at=now(),lease_token=NULL,lease_expires_at=NULL,last_error='Worker lease expired',finished_at=CASE WHEN %s THEN now() END WHERE id=%s",('dead' if dead else 'retry',dead,j['id']))
            conn.execute("UPDATE sources SET consecutive_failures=consecutive_failures+1,last_error='Worker lease expired' WHERE id=%s",(j['source_id'],))
        j=conn.execute('''SELECT j.* FROM ingestion_jobs j JOIN sources s ON s.id=j.source_id
          WHERE (%s::uuid IS NULL OR j.source_id=%s::uuid) AND j.status IN ('queued','retry') AND j.available_at<=now() AND j.attempts<j.max_attempts
          AND s.enabled AND (s.verified OR s.adapter='discover') AND s.adapter<>'unsupported'
          ORDER BY j.available_at,j.created_at LIMIT 1 FOR UPDATE OF j SKIP LOCKED''',(source_id,source_id)).fetchone()
        if not j:return None
        token=uuid.uuid4()
        j=conn.execute("UPDATE ingestion_jobs SET status='running',attempts=attempts+1,lease_token=%s,lease_expires_at=now()+interval '15 minutes',worker_id=%s WHERE id=%s RETURNING *",(token,worker_id,j['id'])).fetchone()
        conn.execute('INSERT INTO ingestion_attempts(job_id,attempt,lease_token) VALUES (%s,%s,%s)',(j['id'],j['attempts'],token))
        return j

def owned(conn,job):
    j=conn.execute("SELECT * FROM ingestion_jobs WHERE id=%s AND lease_token=%s AND status='running' AND lease_expires_at>now() FOR UPDATE",(job['id'],job['lease_token'])).fetchone()
    if not j:raise RuntimeError('Job lease lost; results discarded')
    return j

def fail(job,error,metrics=None):
    metrics=metrics or {}
    with connection() as conn:
        j=owned(conn,job);dead=j['attempts']>=j['max_attempts'];delay=min(3600,60*2**(j['attempts']-1))
        conn.execute("UPDATE ingestion_jobs SET status=%s,available_at=now()+make_interval(secs=>%s),last_error=%s,lease_token=NULL,lease_expires_at=NULL,finished_at=CASE WHEN %s THEN now() END WHERE id=%s",('dead' if dead else 'retry',delay,str(error)[:1000],dead,j['id']))
        conn.execute("UPDATE sources SET consecutive_failures=consecutive_failures+1,last_error=%s WHERE id=%s",(str(error)[:1000],j['source_id']))
        conn.execute('''UPDATE ingestion_attempts SET finished_at=now(),result=%s,error_stack=%s,http_status=%s,duration_ms=%s,bytes_fetched=%s WHERE job_id=%s AND attempt=%s''',('dead' if dead else 'retry',''.join(traceback.format_exception(error))[-12000:],metrics.get('http_status'),metrics.get('duration_ms'),metrics.get('bytes_fetched'),j['id'],j['attempts']))
