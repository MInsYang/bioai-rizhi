CREATE TABLE industry_candidates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 raw_item_id uuid NOT NULL REFERENCES raw_items(id),
 canonical_url text UNIQUE NOT NULL,
 suggested_type text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','dismissed','published')),
 event_id uuid REFERENCES events(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

-- A machine suggestion stays private until an editor reads the source and
-- publishes through the existing exact-evidence/participant validation path.
CREATE FUNCTION propose_industry_candidates() RETURNS integer
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
 RETURN n;
END $$;
