-- Executed only in the disposable transaction from index-metadata-sql.test.mjs.
DO $$
DECLARE
 sid uuid:='20000000-0000-4000-8000-000000000001';
 ordinary uuid:='20000000-0000-4000-8000-000000000002';
 other_sid uuid:='20000000-0000-4000-8000-000000000003';
 body_id uuid:='10000000-0000-4000-8000-000000000001';
 ordinary_id uuid:='10000000-0000-4000-8000-000000000002';
 metadata_id uuid; v jsonb; bad jsonb; before_value jsonb; generated jsonb;
 inserted integer; rejected integer:=0;
BEGIN
 PERFORM pg_temp.index_metadata_assert((SELECT to_jsonb(r)=(SELECT value FROM index_metadata_snapshots WHERE kind='body') FROM raw_items r WHERE id=body_id),'migration preserves historical body row byte-for-byte');
 PERFORM pg_temp.index_metadata_assert((SELECT to_jsonb(d)=(SELECT value FROM index_metadata_snapshots WHERE kind='digest') FROM daily_digests d WHERE digest_date='2029-12-31'),'migration preserves frozen digest');

 v:=pg_temp.index_metadata_record('https://iambic.example/news/shared','legacy-shared',repeat('b',64));
 inserted:=ingestion_store_records(sid,NULL,jsonb_build_array(v));
 PERFORM pg_temp.index_metadata_assert(inserted=0,'existing body skips same-URL metadata');
 PERFORM pg_temp.index_metadata_assert((SELECT count(*)=1 FROM raw_items WHERE source_id=sid),'skip adds no raw revision');
 PERFORM pg_temp.index_metadata_assert((SELECT to_jsonb(r)=(SELECT value FROM index_metadata_snapshots WHERE kind='body') FROM raw_items r WHERE id=body_id),'skip changes no historical field');

 v:=pg_temp.index_metadata_record('https://iambic.example/news/metadata-only','metadata-only',repeat('c',64));
 inserted:=ingestion_store_records(sid,NULL,jsonb_build_array(v));
 SELECT id INTO metadata_id FROM raw_items WHERE source_id=sid AND content_hash=repeat('c',64);
 PERFORM pg_temp.index_metadata_assert(inserted=1 AND metadata_id IS NOT NULL,'new directory URL enters raw storage');
 PERFORM pg_temp.index_metadata_assert((SELECT content_text='' AND raw_payload->>'content_level'='index_metadata' AND raw_payload->>'fulltext_status'='not_fetched' AND raw_payload->>'format'='official_index' FROM raw_items WHERE id=metadata_id),'directory has empty body and explicit status');
 PERFORM pg_temp.index_metadata_assert((SELECT NOT(raw_payload ?| ARRAY['summary','excerpt','abstract']) FROM raw_items WHERE id=metadata_id),'directory stores no summary or abstract');
 PERFORM pg_temp.index_metadata_assert((SELECT count(*)=1 FROM public_resources WHERE id=metadata_id),'directory-only URL remains a public resource');
 PERFORM pg_temp.index_metadata_assert(ingestion_store_records(sid,NULL,jsonb_build_array(v))=0,'same hash remains idempotent');

 -- A metadata hash collision must not rewrite even the classification of a body.
 v:=pg_temp.index_metadata_record('https://iambic.example/news/hash-collision','different-url',repeat('a',64));
 v:=jsonb_set(v,'{raw_payload,classification,topic_ids}','["virtual-cell"]');
 PERFORM pg_temp.index_metadata_assert(ingestion_store_records(sid,NULL,jsonb_build_array(v))=0,'metadata hash collision does not insert');
 PERFORM pg_temp.index_metadata_assert((SELECT to_jsonb(r)=(SELECT value FROM index_metadata_snapshots WHERE kind='body') FROM raw_items r WHERE id=body_id),'metadata collision leaves body and provenance untouched');

 -- Missing content is normalized to an explicit empty string, never the title.
 v:=pg_temp.index_metadata_record('https://iambic.example/news/null-body','null-body',repeat('d',64))-'content_text';
 PERFORM pg_temp.index_metadata_assert(ingestion_store_records(sid,NULL,jsonb_build_array(v))=1,'missing metadata body is accepted as empty');
 PERFORM pg_temp.index_metadata_assert((SELECT content_text='' FROM raw_items WHERE source_id=sid AND content_hash=repeat('d',64)),'missing body never falls back to title');

 -- Reject inconsistent declarations, fetched prose, and invented excerpts.
 v:=pg_temp.index_metadata_record('https://iambic.example/news/invalid','invalid',repeat('f',64));
 FOR bad IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
   jsonb_set(v,'{raw_payload,content_level}','"fulltext"'),
   v#-'{raw_payload,fulltext_status}',
   jsonb_set(v,'{raw_payload,fulltext_status}','"fetched"'),
   v#-'{raw_payload,format}',
   jsonb_set(v,'{raw_payload,format}','"html"'),
   jsonb_set(v,'{content_text}','"Prose must not be stored for an index item"'),
   jsonb_set(v,'{content_text}','" "'),
   jsonb_set(v,'{raw_payload,summary}','"Invented summary"'),
   jsonb_set(v,'{raw_payload,excerpt}','"Copied excerpt"'),
   jsonb_set(v,'{raw_payload,abstract}','"Unfetched abstract"')))
 LOOP
  BEGIN
   PERFORM ingestion_store_records(sid,NULL,jsonb_build_array(bad));
   RAISE EXCEPTION 'Invalid metadata was accepted';
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM<>'Invalid index metadata record' THEN RAISE; END IF;
  END;
  rejected:=rejected+1;
  PERFORM pg_temp.index_metadata_assert(true,'invalid metadata case '||rejected);
 END LOOP;
 PERFORM pg_temp.index_metadata_assert((SELECT count(*)=0 FROM raw_items WHERE canonical_url='https://iambic.example/news/invalid'),'rejected metadata leaves no rows');
 BEGIN
  PERFORM ingestion_store_records(ordinary,NULL,jsonb_build_array(v));
  RAISE EXCEPTION 'Metadata was accepted for a non-directory source';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'Invalid index metadata record' THEN RAISE; END IF;
 END;
 PERFORM pg_temp.index_metadata_assert(true,'metadata requires matching source collection mode');

 -- Retain the established classification-only upsert for every ordinary source.
 v:=jsonb_build_object('external_id','changed','canonical_url','https://legacy.example/news/classification',
  'title','Changed title must not replace the saved title','content_text','Changed body must not replace the saved body',
  'content_hash',repeat('e',64),'raw_payload',jsonb_build_object('classification',jsonb_build_object('in_scope',true,'ai_related',true,'topic_ids',jsonb_build_array('virtual-cell'))));
 PERFORM pg_temp.index_metadata_assert(ingestion_store_records(ordinary,NULL,jsonb_build_array(v))=0,'classification refresh is not counted as insertion');
 PERFORM pg_temp.index_metadata_assert((SELECT title='Legacy classification row' AND content_text='Retained complete source content for classification refresh.' AND raw_payload->'original'->>'retained'='original payload' FROM raw_items WHERE id=ordinary_id),'ordinary conflict preserves body title and provenance');
 PERFORM pg_temp.index_metadata_assert((SELECT raw_payload->'classification'->'topic_ids'='["virtual-cell"]'::jsonb FROM raw_items WHERE id=ordinary_id),'ordinary conflict still refreshes classification');

 -- Simulate an earlier/direct/concurrent metadata insert: both revision gates
 -- must prefer the saved body, including different external IDs and sources.
 v:=pg_temp.index_metadata_record('https://iambic.example/news/shared','legacy-shared',repeat('1',64));
 INSERT INTO raw_items(id,source_id,external_id,canonical_url,published_at,fetched_at,title,content_text,content_hash,raw_payload)
 VALUES(gen_random_uuid(),sid,v->>'external_id',v->>'canonical_url','2030-01-01','2030-01-01T13:00:00Z',v->>'title','',v->>'content_hash',v->'raw_payload');
 PERFORM pg_temp.index_metadata_assert((SELECT id=body_id FROM public_records WHERE source_id=sid AND external_id='legacy-shared'),'first revision gate prefers old body');
 v:=pg_temp.index_metadata_record('https://iambic.example/news/shared','different-external',repeat('2',64));
 INSERT INTO raw_items(id,source_id,external_id,canonical_url,published_at,fetched_at,title,content_text,content_hash,raw_payload)
 VALUES(gen_random_uuid(),sid,v->>'external_id',v->>'canonical_url','2030-01-01','2030-01-01T14:00:00Z',v->>'title','',v->>'content_hash',v->'raw_payload');
 PERFORM pg_temp.index_metadata_assert((SELECT id=body_id FROM public_resources WHERE canonical_url='https://iambic.example/news/shared'),'URL gate prefers body across external IDs');
 v:=pg_temp.index_metadata_record('https://iambic.example/news/shared','other-source-external',repeat('3',64));
 INSERT INTO raw_items(id,source_id,external_id,canonical_url,published_at,fetched_at,title,content_text,content_hash,raw_payload)
 VALUES(gen_random_uuid(),other_sid,v->>'external_id',v->>'canonical_url','2030-01-01','2030-01-01T15:00:00Z',v->>'title','',v->>'content_hash',v->'raw_payload');
 PERFORM pg_temp.index_metadata_assert((SELECT id=body_id FROM public_resources WHERE canonical_url='https://iambic.example/news/shared'),'URL gate prefers body across sources');
 PERFORM pg_temp.index_metadata_assert((SELECT to_jsonb(r)=(SELECT value FROM index_metadata_snapshots WHERE kind='body') FROM raw_items r WHERE id=body_id),'all dedup paths retain historical raw row');

 -- A legacy unmarked empty row is not evidence either. It may remain a resource
 -- under the existing public view contract, but must not enter facts or digests.
 INSERT INTO raw_items(id,source_id,external_id,canonical_url,published_at,fetched_at,title,content_text,content_hash,raw_payload)
 VALUES('10000000-0000-4000-8000-000000000003',ordinary,'legacy-empty','https://legacy.example/news/empty','2030-01-01','2030-01-01T11:00:00Z','Legacy empty-content fixture','',repeat('4',64),
   '{"classification":{"in_scope":true,"ai_related":true,"topic_ids":["drug-discovery"]},"industry_classification":{"relevant":true,"event_types":["partnership"]}}');
 UPDATE raw_items SET fetched_at='2030-01-01T12:00:00Z' WHERE id=metadata_id;
 PERFORM propose_industry_candidates();
 PERFORM pg_temp.index_metadata_assert(NOT EXISTS(SELECT 1 FROM industry_candidates c JOIN raw_items r ON r.id=c.raw_item_id WHERE r.raw_payload->>'content_level'='index_metadata'),'title-only metadata never becomes editorial candidate');
 PERFORM pg_temp.index_metadata_assert(NOT EXISTS(SELECT 1 FROM industry_candidates WHERE canonical_url='https://legacy.example/news/empty'),'unmarked empty record never becomes editorial candidate');
 PERFORM pg_temp.index_metadata_assert((SELECT to_jsonb(c)=(SELECT value FROM index_metadata_snapshots WHERE kind='candidate') FROM industry_candidates c WHERE id='30000000-0000-4000-8000-000000000001'),'metadata never retargets existing pending candidate');
 PERFORM pg_temp.index_metadata_assert(EXISTS(SELECT 1 FROM audit_log WHERE action='propose_candidates' AND actor='system:hourly-candidates' AND (after_value->>'count')::integer>0),'ordinary candidate audit remains intact');

 -- Even a manually inserted approved event cannot publish a title as evidence
 -- when the referenced source body was never fetched.
 INSERT INTO events(id,event_type,title,summary,confidence,review_status)
 VALUES('40000000-0000-4000-8000-000000000001','partnership','Synthetic event must remain invisible','Unsupported synthetic summary',0.9,'approved');
 INSERT INTO event_evidence(event_id,raw_item_id,evidence_text)
 VALUES('40000000-0000-4000-8000-000000000001',metadata_id,'Iambic title-only directory announcement');
 PERFORM pg_temp.index_metadata_assert(NOT EXISTS(SELECT 1 FROM public_evidence WHERE raw_item_id=metadata_id),'empty source body fails exact-evidence publication gate');
 PERFORM pg_temp.index_metadata_assert(NOT EXISTS(SELECT 1 FROM public_events WHERE id='40000000-0000-4000-8000-000000000001'),'metadata cannot expose an approved factual event');

 generated:=generate_daily_digest('2030-01-02T01:00:00Z');
 PERFORM pg_temp.index_metadata_assert((generated->>'total_records')::integer=2,'digest selects the two historical body records');
 PERFORM pg_temp.index_metadata_assert(NOT EXISTS(SELECT 1 FROM raw_items r WHERE r.id IN (SELECT unnest(record_ids) FROM daily_digests WHERE digest_date='2030-01-02') AND r.raw_payload->>'content_level'='index_metadata'),'digest excludes all directory records');
 PERFORM pg_temp.index_metadata_assert(NOT EXISTS(SELECT 1 FROM daily_digests WHERE digest_date='2030-01-02' AND '10000000-0000-4000-8000-000000000003'::uuid=ANY(record_ids)),'digest excludes unmarked empty record');
 PERFORM pg_temp.index_metadata_assert((SELECT to_jsonb(d)=(SELECT value FROM index_metadata_snapshots WHERE kind='digest') FROM daily_digests d WHERE digest_date='2029-12-31'),'future generation leaves old frozen digest unchanged');
 before_value:=generated;
 PERFORM pg_temp.index_metadata_assert(generate_daily_digest('2030-01-02T02:00:00Z')=before_value,'digest remains immutable and idempotent');
 PERFORM pg_temp.index_metadata_assert(generate_daily_digest('2030-01-03T00:00:00Z'::timestamptz-interval '1 second')->>'status'='not_due','Shanghai daily schedule remains intact');
END $$;
