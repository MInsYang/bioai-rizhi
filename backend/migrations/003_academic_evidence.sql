-- Preserve publication status through review; verifying an event is not peer review.
CREATE OR REPLACE VIEW public_evidence AS
 SELECT v.*,r.title AS source_title,r.canonical_url,r.published_at AS source_published_at,
 r.content_hash,s.name AS source_name,s.source_type,s.id AS source_id,
 r.raw_payload->'academic' AS academic
 FROM event_evidence v JOIN raw_items r ON r.id=v.raw_item_id JOIN sources s ON s.id=r.source_id
 WHERE s.verified AND length(v.evidence_text)>0 AND position(v.evidence_text in r.content_text)>0;
