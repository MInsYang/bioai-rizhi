-- Respect verified source request intervals while retaining shared-host fencing.
-- Source configuration stores request_interval_seconds (for example, 10).
CREATE OR REPLACE FUNCTION ingestion_claim(p_job_id uuid,p_worker_id text) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE j ingestion_jobs; s sources; v_host text; v_gate timestamptz; v_token uuid:=gen_random_uuid(); v_interval integer:=1; v_interval_text text;
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
 -- A source's declared robots/API interval applies to every claimant of its host.
 -- Ceil fractional seconds so parsing cannot shorten the requested interval.
 v_interval_text:=btrim(s.config->>'request_interval_seconds');
 IF v_interval_text ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$' THEN
  BEGIN
   v_interval:=LEAST(3600,GREATEST(1,ceil(v_interval_text::numeric)))::integer;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
   v_interval:=1;
  END;
 END IF;
 UPDATE ingestion_host_gates SET next_request_at=now()+make_interval(secs=>v_interval) WHERE host=v_host;
 UPDATE ingestion_jobs SET status='running',attempts=attempts+1,worker_id=left(p_worker_id,100),lease_token=v_token,
  lease_expires_at=now()+interval '2 minutes' WHERE id=j.id RETURNING * INTO j;
 INSERT INTO ingestion_attempts(job_id,attempt,lease_token,parser_version) VALUES(j.id,j.attempts,v_token,'cloud-ingestion-v1');
 RETURN jsonb_build_object('status','claimed','job',to_jsonb(j),'source',to_jsonb(s));
END $$;

