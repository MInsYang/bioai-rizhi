-- Database scheduling and queue delivery are separate stages.
-- Only the Worker can confirm delivery; a terminated invocation stays running.
CREATE OR REPLACE FUNCTION ingestion_dispatch_hourly(p_scheduled_at timestamptz DEFAULT now(),p_trigger_kind text DEFAULT 'cron')
RETURNS TABLE(job_id uuid,source_id uuid) LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_slot timestamptz:=date_trunc('hour',p_scheduled_at); v_job ingestion_jobs; v_source sources; v_count integer;
BEGIN
 PERFORM pg_advisory_xact_lock(724091410);
 INSERT INTO scheduler_runs(scheduled_at,trigger_kind,status) VALUES(v_slot,p_trigger_kind,'running')
 ON CONFLICT(scheduled_at,trigger_kind) DO UPDATE SET status='running',finished_at=NULL,error=NULL,dispatch_attempts=scheduler_runs.dispatch_attempts+1;
 FOR v_job IN SELECT j.* FROM ingestion_jobs j JOIN sources s ON s.id=j.source_id
   WHERE j.status='running' AND j.lease_expires_at<now() AND s.config->>'cloud_runtime_enabled'='true'
   FOR UPDATE OF j SKIP LOCKED LOOP
  UPDATE ingestion_attempts SET finished_at=now(),result='lease_expired',error_stack='Cloud consumer lease expired'
   WHERE ingestion_attempts.job_id=v_job.id AND attempt=v_job.attempts AND finished_at IS NULL;
  UPDATE ingestion_jobs SET failure_count=failure_count+1,status=CASE WHEN failure_count+1>=max_attempts THEN 'dead' ELSE 'retry' END,
   available_at=now(),lease_token=NULL,lease_expires_at=NULL,last_error='Cloud consumer lease expired',
   finished_at=CASE WHEN failure_count+1>=max_attempts THEN now() END WHERE id=v_job.id;
  UPDATE sources SET consecutive_failures=consecutive_failures+1,last_error='Cloud consumer lease expired' WHERE id=v_job.source_id;
 END LOOP;
 FOR v_source IN SELECT s.* FROM sources s WHERE s.enabled AND s.verified
   AND s.config->>'cloud_runtime_enabled'='true' AND s.adapter IN ('europepmc','pubmed','biorxiv','rss')
   AND s.next_poll_at<=now() AND NOT EXISTS(SELECT 1 FROM ingestion_jobs j WHERE j.source_id=s.id AND j.status IN ('queued','retry','running'))
   ORDER BY s.next_poll_at LIMIT 100 FOR UPDATE OF s SKIP LOCKED LOOP
  INSERT INTO ingestion_jobs(id,source_id,window_start,max_attempts) VALUES(gen_random_uuid(),v_source.id,v_slot,5) ON CONFLICT DO NOTHING;
 END LOOP;
 SELECT count(*) INTO v_count FROM ingestion_jobs j JOIN sources s ON s.id=j.source_id
  WHERE j.status IN ('queued','retry') AND j.available_at<=now() AND s.enabled AND s.verified
   AND s.config->>'cloud_runtime_enabled'='true' AND s.adapter IN ('europepmc','pubmed','biorxiv','rss');
 UPDATE scheduler_runs SET finished_at=NULL,status='running',dispatched_count=0 WHERE scheduled_at=v_slot AND trigger_kind=p_trigger_kind;
 RETURN QUERY SELECT j.id,j.source_id FROM ingestion_jobs j JOIN sources s ON s.id=j.source_id
  WHERE j.status IN ('queued','retry') AND j.available_at<=now() AND s.enabled AND s.verified
   AND s.config->>'cloud_runtime_enabled'='true' AND s.adapter IN ('europepmc','pubmed','biorxiv','rss')
  ORDER BY j.available_at,j.created_at LIMIT 100;
END $$;

