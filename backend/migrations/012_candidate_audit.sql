-- Audit every nonempty automatic proposal batch; no candidate becomes public here.
CREATE OR REPLACE FUNCTION propose_industry_candidates() RETURNS integer
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
 INSERT INTO industry_candidates(raw_item_id,canonical_url,suggested_type)
 SELECT r.id,r.canonical_url,
   COALESCE(r.raw_payload->'industry_classification'->'event_types'->>0,'other')
 FROM public_records r
 WHERE r.raw_payload->'industry_classification'->>'relevant'='true'
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
