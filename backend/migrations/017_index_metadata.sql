-- Official directory metadata is a resource index, never source-body evidence.
-- Preserve historical raw rows and all non-metadata publication/dedup contracts.
-- Source configuration is changed separately by the authorized source update.

CREATE OR REPLACE FUNCTION ingestion_store_records(p_source_id uuid,p_job_id uuid,p_records jsonb) RETURNS integer
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE r jsonb; v_inserted integer:=0; v_new boolean; v_metadata boolean; v_collection_mode text;
BEGIN
 IF jsonb_typeof(p_records)<>'array' OR jsonb_array_length(p_records)>40 THEN RAISE EXCEPTION 'Bounded record array required'; END IF;
 -- Callers retain their existing job -> source row-lock order. This read adds no lock.
 SELECT config->>'collection_mode' INTO v_collection_mode FROM sources WHERE id=p_source_id;
 FOR r IN SELECT value FROM jsonb_array_elements(p_records) LOOP
  IF COALESCE(r->>'content_hash','') !~ '^[0-9a-f]{64}$' OR length(COALESCE(r->>'title',''))=0
    OR COALESCE(r->>'canonical_url','') !~ '^https://' OR jsonb_typeof(r->'raw_payload'->'classification'->'topic_ids') IS DISTINCT FROM 'array'
    THEN RAISE EXCEPTION 'Invalid ingestion record'; END IF;
  v_metadata:=COALESCE(r->'raw_payload'->>'content_level'='index_metadata',false);
  IF v_collection_mode='index_metadata' OR v_metadata THEN
   IF NOT v_metadata OR v_collection_mode IS DISTINCT FROM 'index_metadata'
     OR r->'raw_payload'->>'fulltext_status' IS DISTINCT FROM 'not_fetched'
     OR r->'raw_payload'->>'format' IS DISTINCT FROM 'official_index'
     OR COALESCE(r->>'content_text','')<>''
     OR length(btrim(COALESCE(r->'raw_payload'->>'summary','')))>0
     OR length(btrim(COALESCE(r->'raw_payload'->>'excerpt','')))>0
     OR length(btrim(COALESCE(r->'raw_payload'->>'abstract','')))>0
     THEN RAISE EXCEPTION 'Invalid index metadata record'; END IF;
   -- Never add a directory revision over a saved source body. The view ordering
   -- below also protects concurrent/direct imports and distinct external IDs.
   IF EXISTS(SELECT 1 FROM raw_items old WHERE old.source_id=p_source_id
      AND old.canonical_url=r->>'canonical_url'
      AND old.raw_payload->>'content_level' IS DISTINCT FROM 'index_metadata'
      AND length(btrim(COALESCE(old.content_text,'')))>0) THEN CONTINUE; END IF;
  END IF;
  v_new:=NULL;
  INSERT INTO raw_items(id,source_id,job_id,external_id,canonical_url,published_at,title,raw_payload,content_text,content_hash)
   VALUES(gen_random_uuid(),p_source_id,p_job_id,r->>'external_id',r->>'canonical_url',NULLIF(r->>'published_at','')::timestamptz,
    left(r->>'title',1000),r->'raw_payload',CASE WHEN v_metadata THEN '' ELSE left(r->>'content_text',200000) END,r->>'content_hash')
   ON CONFLICT(source_id,content_hash) DO UPDATE SET raw_payload=jsonb_set(raw_items.raw_payload,'{classification}',EXCLUDED.raw_payload->'classification')
    WHERE raw_items.raw_payload->'classification' IS DISTINCT FROM EXCLUDED.raw_payload->'classification'
      AND (NOT v_metadata OR raw_items.raw_payload->>'content_level'='index_metadata')
   RETURNING (xmax=0) INTO v_new;
  IF v_new THEN v_inserted:=v_inserted+1; END IF;
 END LOOP;
 RETURN v_inserted;
END $$;

-- Keep full source bodies ahead of metadata even within the first revision gate.
CREATE OR REPLACE VIEW public_records AS
 SELECT DISTINCT ON (r.source_id,COALESCE(NULLIF(r.external_id,''),r.canonical_url,r.id::text))
 r.*,s.name AS source_name,s.source_type,s.registry_key,s.company_id,
 c.slug AS company_slug,c.name_zh AS company_name,c.name_en AS company_name_en,c.track,c.region
 FROM raw_items r JOIN sources s ON s.id=r.source_id LEFT JOIN companies c ON c.id=s.company_id
 WHERE s.verified
 ORDER BY r.source_id,COALESCE(NULLIF(r.external_id,''),r.canonical_url,r.id::text),
 CASE WHEN r.raw_payload->>'content_level'='index_metadata' THEN 1 ELSE 0 END,
 r.fetched_at DESC,r.id DESC;

-- The URL coalescing gate also prefers saved bodies across external IDs/sources.
CREATE OR REPLACE VIEW public_resources AS
SELECT DISTINCT ON (
 CASE WHEN r.raw_payload->'academic'->>'status'='indexed'
 THEN COALESCE('doi:'||lower(NULLIF(r.raw_payload->'academic'->>'doi','')),
               'pmid:'||NULLIF(r.raw_payload->'academic'->>'pmid',''),'record:'||r.id::text)
 WHEN jsonb_typeof(r.raw_payload->'academic')='object' THEN 'record:'||r.id::text
 ELSE COALESCE('url:'||NULLIF(r.canonical_url,''),'record:'||r.id::text) END
) r.* FROM public_records r
ORDER BY
 CASE WHEN r.raw_payload->'academic'->>'status'='indexed'
 THEN COALESCE('doi:'||lower(NULLIF(r.raw_payload->'academic'->>'doi','')),
               'pmid:'||NULLIF(r.raw_payload->'academic'->>'pmid',''),'record:'||r.id::text)
 WHEN jsonb_typeof(r.raw_payload->'academic')='object' THEN 'record:'||r.id::text
 ELSE COALESCE('url:'||NULLIF(r.canonical_url,''),'record:'||r.id::text) END,
 CASE WHEN r.raw_payload->>'content_level'='index_metadata' THEN 1 ELSE 0 END,
 CASE WHEN r.registry_key='pubmed-eutils' THEN 0 ELSE 1 END,
 r.fetched_at DESC,r.id;

-- Title-only classification may aid directory discovery, never editorial facts.
CREATE OR REPLACE FUNCTION propose_industry_candidates() RETURNS integer
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
 INSERT INTO industry_candidates(raw_item_id,canonical_url,suggested_type)
 SELECT r.id,r.canonical_url,
   COALESCE(r.raw_payload->'industry_classification'->'event_types'->>0,'other')
 FROM public_records r
 WHERE r.raw_payload->'industry_classification'->>'relevant'='true'
   AND r.raw_payload->>'content_level' IS DISTINCT FROM 'index_metadata'
   AND length(btrim(COALESCE(r.content_text,'')))>0
   AND EXISTS(SELECT 1 FROM sources s WHERE s.id=r.source_id AND s.enabled)
   AND r.canonical_url IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM event_evidence e WHERE e.raw_item_id=r.id)
 ORDER BY r.fetched_at DESC,r.id LIMIT 500
 ON CONFLICT(canonical_url) DO UPDATE SET raw_item_id=EXCLUDED.raw_item_id,
   suggested_type=EXCLUDED.suggested_type,updated_at=now()
 WHERE industry_candidates.status='pending' AND industry_candidates.raw_item_id<>EXCLUDED.raw_item_id;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n>0 THEN
  INSERT INTO audit_log(actor,action,entity_type,after_value) VALUES('system:hourly-candidates','propose_candidates','candidate_batch',jsonb_build_object('count',n));
 END IF;
 RETURN n;
END $$;

-- Existing immutable digests remain untouched; future selections require a body.
CREATE OR REPLACE FUNCTION generate_daily_digest(at_time timestamptz DEFAULT now()) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE d date; finish timestamptz; result jsonb;
BEGIN
 d := (at_time AT TIME ZONE 'Asia/Shanghai')::date;
 finish := (d::timestamp + interval '8 hours') AT TIME ZONE 'Asia/Shanghai';
 IF at_time < finish THEN RETURN jsonb_build_object('status','not_due'); END IF;
 INSERT INTO daily_digests(digest_date,window_start,window_end,record_ids,total_records)
 SELECT d,finish-interval '24 hours',finish,
 COALESCE(array_agg(id ORDER BY fetched_at DESC,id),'{}'::uuid[]),count(*)
 FROM (SELECT r.id,r.fetched_at,(r.raw_payload->'academic' IS NOT NULL) AS academic FROM public_resources r
   WHERE r.fetched_at >= finish-interval '24 hours' AND r.fetched_at < finish
   AND r.raw_payload->>'content_level' IS DISTINCT FROM 'index_metadata'
   AND length(btrim(COALESCE(r.content_text,'')))>0
   AND r.raw_payload->'classification'->>'in_scope' IS DISTINCT FROM 'false'
   AND r.raw_payload->'industry_classification'->>'relevant' IS DISTINCT FROM 'false'
   AND jsonb_array_length(COALESCE(r.raw_payload->'classification'->'topic_ids','[]'))>0
   AND (r.raw_payload->'academic' IS NULL OR (r.raw_payload->'academic'->'journal_selection'->>'tier'='selected' AND r.raw_payload->'classification'->>'ai_related'='true'))
   ORDER BY (r.raw_payload->'academic' IS NOT NULL),r.fetched_at DESC,r.id LIMIT 100) selected
 ON CONFLICT(digest_date) DO NOTHING;
 SELECT to_jsonb(x) INTO result FROM daily_digests x WHERE digest_date=d;
 RETURN result;
END $$;
