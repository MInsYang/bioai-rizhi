-- Expand only the bounded official adapter set; preserve queue confirmation and leases.
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
  OR s.adapter NOT IN ('europepmc','pubmed','biorxiv','rss','crossref','official_html') THEN
  UPDATE ingestion_jobs SET status='dead',finished_at=now(),last_error='Cloud source disabled, unverified or unsupported' WHERE id=j.id;
  RETURN jsonb_build_object('status','disabled');
 END IF;
 v_host:=CASE s.adapter WHEN 'pubmed' THEN 'eutils.ncbi.nlm.nih.gov' WHEN 'europepmc' THEN 'www.ebi.ac.uk' WHEN 'biorxiv' THEN 'api.biorxiv.org' WHEN 'crossref' THEN 'api.crossref.org' ELSE split_part(split_part(s.url,'://',2),'/',1) END;
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
   AND s.config->>'cloud_runtime_enabled'='true' AND s.adapter IN ('europepmc','pubmed','biorxiv','rss','crossref','official_html')
   AND s.next_poll_at<=now() AND NOT EXISTS(SELECT 1 FROM ingestion_jobs j WHERE j.source_id=s.id AND j.status IN ('queued','retry','running'))
   ORDER BY s.next_poll_at LIMIT 100 FOR UPDATE OF s SKIP LOCKED LOOP
  INSERT INTO ingestion_jobs(id,source_id,window_start,max_attempts) VALUES(gen_random_uuid(),v_source.id,v_slot,5) ON CONFLICT DO NOTHING;
 END LOOP;
 SELECT count(*) INTO v_count FROM ingestion_jobs j JOIN sources s ON s.id=j.source_id
  WHERE j.status IN ('queued','retry') AND j.available_at<=now() AND s.enabled AND s.verified
   AND s.config->>'cloud_runtime_enabled'='true' AND s.adapter IN ('europepmc','pubmed','biorxiv','rss','crossref','official_html');
 UPDATE scheduler_runs SET finished_at=NULL,status='running',dispatched_count=0 WHERE scheduled_at=v_slot AND trigger_kind=p_trigger_kind;
 RETURN QUERY SELECT j.id,j.source_id FROM ingestion_jobs j JOIN sources s ON s.id=j.source_id
  WHERE j.status IN ('queued','retry') AND j.available_at<=now() AND s.enabled AND s.verified
   AND s.config->>'cloud_runtime_enabled'='true' AND s.adapter IN ('europepmc','pubmed','biorxiv','rss','crossref','official_html')
  ORDER BY j.available_at,j.created_at LIMIT 100;
END $$;


-- A DOI joins Crossref to PubMed/Europe PMC; preprint versions remain separate.
-- Preserve every source copy in raw_items/public_records. Public listing coalesces
-- indexed papers only by explicit identifiers, never by fuzzy title similarity.
CREATE OR REPLACE VIEW public_resources AS
SELECT DISTINCT ON (
 CASE WHEN r.raw_payload->'academic'->>'status'='indexed'
 THEN COALESCE('doi:'||lower(NULLIF(r.raw_payload->'academic'->>'doi','')),
               'pmid:'||NULLIF(r.raw_payload->'academic'->>'pmid',''),'record:'||r.id::text)
 ELSE 'record:'||r.id::text END
) r.* FROM public_records r
ORDER BY
 CASE WHEN r.raw_payload->'academic'->>'status'='indexed'
 THEN COALESCE('doi:'||lower(NULLIF(r.raw_payload->'academic'->>'doi','')),
               'pmid:'||NULLIF(r.raw_payload->'academic'->>'pmid',''),'record:'||r.id::text)
 ELSE 'record:'||r.id::text END,
 CASE WHEN r.registry_key='pubmed-eutils' THEN 0 ELSE 1 END,
 r.fetched_at DESC,r.id;
