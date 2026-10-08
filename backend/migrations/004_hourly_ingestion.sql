-- Atomic RPCs for a stateless hourly dispatcher and one-page queue consumers.
UPDATE polling_profiles SET ttl_hours=1 WHERE id='P0';
ALTER TABLE ingestion_jobs ADD COLUMN checkpoint jsonb NOT NULL DEFAULT '{}';
ALTER TABLE ingestion_jobs ADD COLUMN failure_count integer NOT NULL DEFAULT 0 CHECK(failure_count>=0);
ALTER TABLE ingestion_attempts ADD COLUMN metrics jsonb NOT NULL DEFAULT '{}';
CREATE INDEX raw_topic_ids ON raw_items USING gin ((raw_payload->'classification'->'topic_ids'));
CREATE TABLE scheduler_runs (
 scheduled_at timestamptz NOT NULL, trigger_kind text NOT NULL DEFAULT 'cron' CHECK(trigger_kind IN ('cron','manual')),
 started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz, status text NOT NULL CHECK(status IN ('running','succeeded','failed')),
 dispatched_count integer NOT NULL DEFAULT 0, error text, dispatch_attempts integer NOT NULL DEFAULT 1,
 PRIMARY KEY(scheduled_at,trigger_kind)
);
CREATE TABLE ingestion_host_gates (host text PRIMARY KEY, next_request_at timestamptz NOT NULL DEFAULT now());

CREATE FUNCTION ingestion_dispatch_hourly(p_scheduled_at timestamptz DEFAULT now(),p_trigger_kind text DEFAULT 'cron')
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
 UPDATE scheduler_runs SET finished_at=now(),status='succeeded',dispatched_count=LEAST(v_count,100) WHERE scheduled_at=v_slot AND trigger_kind=p_trigger_kind;
 RETURN QUERY SELECT j.id,j.source_id FROM ingestion_jobs j JOIN sources s ON s.id=j.source_id
  WHERE j.status IN ('queued','retry') AND j.available_at<=now() AND s.enabled AND s.verified
   AND s.config->>'cloud_runtime_enabled'='true' AND s.adapter IN ('europepmc','pubmed','biorxiv','rss')
  ORDER BY j.available_at,j.created_at LIMIT 100;
END $$;

CREATE FUNCTION ingestion_claim(p_job_id uuid,p_worker_id text) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE j ingestion_jobs; s sources; v_host text; v_gate timestamptz; v_token uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO j FROM ingestion_jobs WHERE id=p_job_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','missing'); END IF;
 IF j.status='running' AND j.lease_expires_at>now() THEN
  RETURN jsonb_build_object('status','running','retry_after',GREATEST(1,ceil(extract(epoch FROM j.lease_expires_at-now()))));
 END IF;
 IF j.status='running' THEN
  UPDATE ingestion_attempts SET finished_at=now(),result='lease_expired',error_stack='Cloud consumer lease expired'
   WHERE job_id=j.id AND attempt=j.attempts AND finished_at IS NULL;
  UPDATE ingestion_jobs SET failure_count=failure_count+1,status=CASE WHEN failure_count+1>=max_attempts THEN 'dead' ELSE 'retry' END,
   available_at=now(),lease_token=NULL,lease_expires_at=NULL,last_error='Cloud consumer lease expired',
   finished_at=CASE WHEN failure_count+1>=max_attempts THEN now() END WHERE id=j.id RETURNING * INTO j;
  UPDATE sources SET consecutive_failures=consecutive_failures+1,last_error='Cloud consumer lease expired' WHERE id=j.source_id;
 END IF;
 IF j.status NOT IN ('queued','retry') OR j.failure_count>=j.max_attempts THEN RETURN jsonb_build_object('status',j.status); END IF;
 IF j.available_at>now() THEN RETURN jsonb_build_object('status','not_due','retry_after',GREATEST(1,ceil(extract(epoch FROM j.available_at-now())))); END IF;
 SELECT * INTO s FROM sources WHERE id=j.source_id FOR UPDATE;
 IF NOT s.enabled OR NOT s.verified OR s.config->>'cloud_runtime_enabled' IS DISTINCT FROM 'true'
  OR s.adapter NOT IN ('europepmc','pubmed','biorxiv','rss') THEN
  UPDATE ingestion_jobs SET status='dead',finished_at=now(),last_error='Cloud source disabled, unverified or unsupported' WHERE id=j.id;
  RETURN jsonb_build_object('status','disabled');
 END IF;
 v_host:=CASE s.adapter WHEN 'pubmed' THEN 'eutils.ncbi.nlm.nih.gov' WHEN 'europepmc' THEN 'www.ebi.ac.uk' WHEN 'biorxiv' THEN 'api.biorxiv.org' ELSE split_part(split_part(s.url,'://',2),'/',1) END;
 INSERT INTO ingestion_host_gates(host) VALUES(v_host) ON CONFLICT DO NOTHING;
 SELECT next_request_at INTO v_gate FROM ingestion_host_gates WHERE host=v_host FOR UPDATE;
 IF v_gate>now() THEN RETURN jsonb_build_object('status','rate_limited','retry_after',GREATEST(1,ceil(extract(epoch FROM v_gate-now())))); END IF;
 UPDATE ingestion_host_gates SET next_request_at=now()+interval '1 second' WHERE host=v_host;
 UPDATE ingestion_jobs SET status='running',attempts=attempts+1,worker_id=left(p_worker_id,100),lease_token=v_token,
  lease_expires_at=now()+interval '2 minutes' WHERE id=j.id RETURNING * INTO j;
 INSERT INTO ingestion_attempts(job_id,attempt,lease_token,parser_version) VALUES(j.id,j.attempts,v_token,'cloud-ingestion-v1');
 RETURN jsonb_build_object('status','claimed','job',to_jsonb(j),'source',to_jsonb(s));
END $$;

CREATE FUNCTION ingestion_store_records(p_source_id uuid,p_job_id uuid,p_records jsonb) RETURNS integer
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE r jsonb; v_inserted integer:=0; v_new boolean;
BEGIN
 IF jsonb_typeof(p_records)<>'array' OR jsonb_array_length(p_records)>40 THEN RAISE EXCEPTION 'Bounded record array required'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_records) LOOP
  IF COALESCE(r->>'content_hash','') !~ '^[0-9a-f]{64}$' OR length(COALESCE(r->>'title',''))=0
    OR COALESCE(r->>'canonical_url','') !~ '^https://' OR jsonb_typeof(r->'raw_payload'->'classification'->'topic_ids') IS DISTINCT FROM 'array'
    THEN RAISE EXCEPTION 'Invalid ingestion record'; END IF;
  v_new:=NULL;
  INSERT INTO raw_items(id,source_id,job_id,external_id,canonical_url,published_at,title,raw_payload,content_text,content_hash)
   VALUES(gen_random_uuid(),p_source_id,p_job_id,r->>'external_id',r->>'canonical_url',NULLIF(r->>'published_at','')::timestamptz,
    left(r->>'title',1000),r->'raw_payload',left(r->>'content_text',200000),r->>'content_hash')
   ON CONFLICT(source_id,content_hash) DO UPDATE SET raw_payload=jsonb_set(raw_items.raw_payload,'{classification}',EXCLUDED.raw_payload->'classification')
    WHERE raw_items.raw_payload->'classification' IS DISTINCT FROM EXCLUDED.raw_payload->'classification'
   RETURNING (xmax=0) INTO v_new;
  IF v_new THEN v_inserted:=v_inserted+1; END IF;
 END LOOP;
 RETURN v_inserted;
END $$;

CREATE FUNCTION ingestion_checkpoint(p_job_id uuid,p_token uuid,p_records jsonb,p_checkpoint jsonb,p_metrics jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE j ingestion_jobs; s sources; v_inserted integer;
BEGIN
 SELECT * INTO j FROM ingestion_jobs WHERE id=p_job_id AND lease_token=p_token AND status='running' AND lease_expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','lease_lost'); END IF;
 SELECT * INTO s FROM sources WHERE id=j.source_id FOR UPDATE;
 IF NOT s.enabled OR NOT s.verified OR s.config->>'cloud_runtime_enabled' IS DISTINCT FROM 'true' THEN
  UPDATE ingestion_jobs SET status='dead',finished_at=now(),lease_token=NULL,lease_expires_at=NULL,last_error='Source verification revoked' WHERE id=j.id;
  UPDATE ingestion_attempts SET finished_at=now(),result='source_revoked',error_stack='Source verification revoked' WHERE job_id=j.id AND attempt=j.attempts;
  RETURN jsonb_build_object('status','source_revoked');
 END IF;
 IF jsonb_typeof(p_checkpoint)<>'object' OR p_checkpoint->>'query_version' IS DISTINCT FROM s.config->>'query_version' THEN RAISE EXCEPTION 'Query version changed; checkpoint refused'; END IF;
 v_inserted:=ingestion_store_records(j.source_id,j.id,p_records);
 UPDATE ingestion_attempts SET finished_at=now(),result='checkpoint',http_status=(p_metrics->>'http_status')::integer,
  duration_ms=(p_metrics->>'duration_ms')::integer,bytes_fetched=(p_metrics->>'bytes_fetched')::integer,
  parsed_count=jsonb_array_length(p_records),metrics=p_metrics WHERE job_id=j.id AND attempt=j.attempts;
 UPDATE ingestion_jobs SET status='queued',available_at=now(),checkpoint=p_checkpoint,failure_count=0,
  lease_token=NULL,lease_expires_at=NULL,last_error=NULL WHERE id=j.id;
 RETURN jsonb_build_object('status','checkpoint','inserted',v_inserted,'job_id',j.id);
END $$;

CREATE FUNCTION ingestion_finish(p_job_id uuid,p_token uuid,p_records jsonb,p_cursor jsonb,p_metrics jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE j ingestion_jobs; s sources; v_inserted integer; v_hours integer;
BEGIN
 SELECT * INTO j FROM ingestion_jobs WHERE id=p_job_id AND lease_token=p_token AND status='running' AND lease_expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','lease_lost'); END IF;
 SELECT * INTO s FROM sources WHERE id=j.source_id FOR UPDATE;
 IF NOT s.enabled OR NOT s.verified OR s.config->>'cloud_runtime_enabled' IS DISTINCT FROM 'true' THEN
  UPDATE ingestion_jobs SET status='dead',finished_at=now(),lease_token=NULL,lease_expires_at=NULL,last_error='Source verification revoked' WHERE id=j.id;
  UPDATE ingestion_attempts SET finished_at=now(),result='source_revoked',error_stack='Source verification revoked' WHERE job_id=j.id AND attempt=j.attempts;
  RETURN jsonb_build_object('status','source_revoked');
 END IF;
 IF p_cursor->>'query_version' IS DISTINCT FROM s.config->>'query_version' THEN RAISE EXCEPTION 'Query version changed; finish refused'; END IF;
 v_inserted:=ingestion_store_records(j.source_id,j.id,p_records);
 SELECT ttl_hours INTO v_hours FROM polling_profiles WHERE id=s.poll_profile;
 UPDATE sources SET last_success_at=now(),consecutive_failures=0,last_error=NULL,next_poll_at=date_trunc('hour',now())+make_interval(hours=>v_hours),
  etag=COALESCE(p_cursor->>'etag',etag),last_modified=COALESCE(p_cursor->>'last_modified',last_modified),
  config=config||CASE WHEN p_cursor ? 'cursor_date' THEN jsonb_build_object('cursor_date',p_cursor->'cursor_date') ELSE '{}'::jsonb END||jsonb_build_object('last_collection',p_metrics)
  WHERE id=s.id;
 UPDATE ingestion_attempts SET finished_at=now(),result=CASE WHEN p_metrics->>'http_status'='304' THEN 'not_modified' ELSE 'success' END,
  http_status=(p_metrics->>'http_status')::integer,duration_ms=(p_metrics->>'duration_ms')::integer,
  bytes_fetched=(p_metrics->>'bytes_fetched')::integer,parsed_count=jsonb_array_length(p_records),metrics=p_metrics WHERE job_id=j.id AND attempt=j.attempts;
 UPDATE ingestion_jobs SET status='succeeded',finished_at=now(),checkpoint='{}',failure_count=0,
  lease_token=NULL,lease_expires_at=NULL,last_error=NULL WHERE id=j.id;
 RETURN jsonb_build_object('status','succeeded','inserted',v_inserted,'job_id',j.id);
END $$;

CREATE FUNCTION ingestion_fail(p_job_id uuid,p_token uuid,p_error jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE j ingestion_jobs; v_dead boolean; v_delay integer;
BEGIN
 SELECT * INTO j FROM ingestion_jobs WHERE id=p_job_id AND lease_token=p_token AND status='running' AND lease_expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','lease_lost'); END IF;
 v_dead:=(p_error->>'permanent'='true') OR j.failure_count+1>=j.max_attempts;
 v_delay:=LEAST(3600,GREATEST(COALESCE((p_error->>'retry_after')::integer,0),ceil(60*power(2,LEAST(j.failure_count,6))*(0.75+random()*0.5))::integer));
 UPDATE ingestion_jobs SET status=CASE WHEN v_dead THEN 'dead' ELSE 'retry' END,failure_count=failure_count+1,
  available_at=now()+make_interval(secs=>v_delay),last_error=left(p_error->>'message',1000),lease_token=NULL,lease_expires_at=NULL,
  finished_at=CASE WHEN v_dead THEN now() END WHERE id=j.id;
 UPDATE sources SET consecutive_failures=consecutive_failures+1,last_error=left(p_error->>'message',1000),
  next_poll_at=CASE WHEN v_dead THEN date_trunc('hour',now())+interval '6 hours' ELSE next_poll_at END WHERE id=j.source_id;
 UPDATE ingestion_attempts SET finished_at=now(),result=CASE WHEN v_dead THEN 'dead' ELSE 'retry' END,
  error_stack=left(p_error->>'message',12000),http_status=(p_error->>'http_status')::integer,
  duration_ms=(p_error->>'duration_ms')::integer,bytes_fetched=(p_error->>'bytes_fetched')::integer,metrics=p_error WHERE job_id=j.id AND attempt=j.attempts;
 RETURN jsonb_build_object('status',CASE WHEN v_dead THEN 'dead' ELSE 'retry' END,'retry_after',v_delay,'job_id',j.id);
END $$;
