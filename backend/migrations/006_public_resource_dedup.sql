-- Preserve every source copy in raw_items/public_records. Public listing coalesces
-- indexed papers only by explicit identifiers, never by fuzzy title similarity.
CREATE VIEW public_resources AS
SELECT DISTINCT ON (
 CASE WHEN r.raw_payload->'academic'->>'status'='indexed'
 THEN COALESCE('pmid:'||NULLIF(r.raw_payload->'academic'->>'pmid',''),
               'doi:'||lower(NULLIF(r.raw_payload->'academic'->>'doi','')),'record:'||r.id::text)
 ELSE 'record:'||r.id::text END
) r.* FROM public_records r
ORDER BY
 CASE WHEN r.raw_payload->'academic'->>'status'='indexed'
 THEN COALESCE('pmid:'||NULLIF(r.raw_payload->'academic'->>'pmid',''),
               'doi:'||lower(NULLIF(r.raw_payload->'academic'->>'doi','')),'record:'||r.id::text)
 ELSE 'record:'||r.id::text END,
 CASE WHEN r.registry_key='pubmed-eutils' THEN 0 ELSE 1 END,
 r.fetched_at DESC,r.id;
