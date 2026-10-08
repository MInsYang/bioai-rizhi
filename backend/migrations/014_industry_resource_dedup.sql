-- Dated short review excerpts and later feed copies of the same industry URL are one public listing.
-- Academic preprint versions remain distinct. Raw source copies and evidence are preserved.
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
 CASE WHEN r.registry_key='pubmed-eutils' THEN 0 ELSE 1 END,
 r.fetched_at DESC,r.id;
