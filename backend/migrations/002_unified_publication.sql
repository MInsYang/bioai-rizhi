ALTER TABLE events ADD COLUMN track text NOT NULL DEFAULT '测序与多组学';
ALTER TABLE events ADD COLUMN details jsonb NOT NULL DEFAULT '{}';
ALTER TABLE events ADD COLUMN request_id uuid UNIQUE;
CREATE INDEX events_public_date ON events(COALESCE(occurred_at,published_at) DESC) WHERE review_status='approved';
CREATE INDEX evidence_raw ON event_evidence(raw_item_id);
CREATE INDEX entity_events ON event_entities(entity_id,event_id);
-- All public surfaces share this gate; revoking a source immediately hides its evidence.
CREATE VIEW public_evidence AS
 SELECT v.*,r.title AS source_title,r.canonical_url,r.published_at AS source_published_at,
 r.content_hash,s.name AS source_name,s.source_type,s.id AS source_id
 FROM event_evidence v JOIN raw_items r ON r.id=v.raw_item_id JOIN sources s ON s.id=r.source_id
 WHERE s.verified AND length(v.evidence_text)>0 AND position(v.evidence_text in r.content_text)>0;
CREATE VIEW public_events AS
 SELECT e.*,(SELECT count(*) FROM public_evidence v WHERE v.event_id=e.id) AS evidence_count
 FROM events e WHERE e.review_status='approved' AND EXISTS(SELECT 1 FROM public_evidence v WHERE v.event_id=e.id);
CREATE VIEW public_records AS
 SELECT DISTINCT ON (r.source_id,COALESCE(NULLIF(r.external_id,''),r.canonical_url,r.id::text))
 r.*,s.name AS source_name,s.source_type,s.registry_key,s.company_id,
 c.slug AS company_slug,c.name_zh AS company_name,c.name_en AS company_name_en,c.track,c.region
 FROM raw_items r JOIN sources s ON s.id=r.source_id LEFT JOIN companies c ON c.id=s.company_id
 WHERE s.verified
 ORDER BY r.source_id,COALESCE(NULLIF(r.external_id,''),r.canonical_url,r.id::text),r.fetched_at DESC,r.id DESC;
ALTER TABLE event_evidence ADD CONSTRAINT evidence_span_pair CHECK (
 (evidence_start IS NULL AND evidence_end IS NULL) OR
 (evidence_start IS NOT NULL AND evidence_end IS NOT NULL AND evidence_end>evidence_start));
