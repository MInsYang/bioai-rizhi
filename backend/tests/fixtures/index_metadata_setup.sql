-- Synthetic rows only. Run after 001..016 and before 017 in one rollback-only transaction.
INSERT INTO polling_profiles(id,ttl_hours) VALUES ('INDEX_METADATA_TEST',1);
INSERT INTO sources(id,registry_key,name,source_type,url,poll_profile,enabled,verified,verification_status,adapter,config)
VALUES
 ('20000000-0000-4000-8000-000000000001','index-metadata-test','Directory fixture','official_website','https://iambic.example/news','INDEX_METADATA_TEST',true,true,'verified','official_html','{"collection_mode":"index_metadata"}'),
 ('20000000-0000-4000-8000-000000000002','legacy-body-test','Legacy fixture','official_website','https://legacy.example/news','INDEX_METADATA_TEST',true,true,'verified','official_html','{}'),
 ('20000000-0000-4000-8000-000000000003','other-directory-test','Other directory fixture','official_website','https://other.example/news','INDEX_METADATA_TEST',true,true,'verified','official_html','{"collection_mode":"index_metadata"}');

INSERT INTO raw_items(id,source_id,external_id,canonical_url,published_at,fetched_at,title,content_text,content_hash,raw_payload)
VALUES
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','legacy-shared','https://iambic.example/news/shared','2030-01-01','2030-01-01T10:00:00Z','Historical full source body',
  'Historical complete source body documents an explicit synthetic partnership.',repeat('a',64),
  '{"format":"html","original":{"retained":"historical body provenance"},"classification":{"in_scope":true,"ai_related":true,"topic_ids":["drug-discovery"]},"industry_classification":{"relevant":true,"event_types":["partnership"]}}'),
 ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','legacy-classification','https://legacy.example/news/classification','2030-01-01','2030-01-01T09:00:00Z','Legacy classification row',
  'Retained complete source content for classification refresh.',repeat('e',64),
  '{"format":"html","original":{"retained":"original payload"},"classification":{"in_scope":true,"ai_related":true,"topic_ids":["drug-discovery"]},"industry_classification":{"relevant":true,"event_types":["product"]}}');

INSERT INTO industry_candidates(id,raw_item_id,canonical_url,suggested_type,status)
VALUES ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','https://iambic.example/news/shared','partnership','pending');
INSERT INTO daily_digests(digest_date,window_start,window_end,record_ids,total_records)
VALUES ('2029-12-31','2029-12-30','2029-12-31',ARRAY['10000000-0000-4000-8000-000000000001']::uuid[],1);

CREATE TEMP TABLE index_metadata_snapshots(kind text PRIMARY KEY,value jsonb);
INSERT INTO index_metadata_snapshots VALUES
 ('body',(SELECT to_jsonb(r) FROM raw_items r WHERE id='10000000-0000-4000-8000-000000000001')),
 ('candidate',(SELECT to_jsonb(c) FROM industry_candidates c WHERE id='30000000-0000-4000-8000-000000000001')),
 ('digest',(SELECT to_jsonb(d) FROM daily_digests d WHERE digest_date='2029-12-31'));
CREATE TEMP TABLE index_metadata_checks(label text PRIMARY KEY);
CREATE FUNCTION pg_temp.index_metadata_assert(condition boolean,label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
 IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Index metadata assertion failed: %',label; END IF;
 INSERT INTO index_metadata_checks VALUES(label);
END $$;
CREATE FUNCTION pg_temp.index_metadata_record(p_url text,p_external text,p_hash text) RETURNS jsonb
LANGUAGE sql AS $$
 SELECT jsonb_build_object('external_id',p_external,'canonical_url',p_url,'published_at','2030-01-01',
  'title','Iambic title-only directory announcement','content_text','','content_hash',p_hash,
  'raw_payload',jsonb_build_object('content_level','index_metadata','fulltext_status','not_fetched','format','official_index',
    'classification_scope','title_only','classification',jsonb_build_object('in_scope',true,'ai_related',true,'topic_ids',jsonb_build_array('drug-discovery')),
    'industry_classification',jsonb_build_object('relevant',true,'event_types',jsonb_build_array('partnership'))))
$$;
