CREATE TABLE daily_digests (
 digest_date date PRIMARY KEY,
 window_start timestamptz NOT NULL,
 window_end timestamptz NOT NULL,
 generated_at timestamptz NOT NULL DEFAULT now(),
 record_ids uuid[] NOT NULL DEFAULT '{}',
 total_records integer NOT NULL,
 CHECK(window_end > window_start)
);

-- A digest is an immutable selection of newly collected records, not generated news.
-- Read-time publication gates still apply if a source is subsequently revoked.
CREATE FUNCTION generate_daily_digest(at_time timestamptz DEFAULT now()) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE d date; finish timestamptz; result jsonb;
BEGIN
 d := (at_time AT TIME ZONE 'Asia/Shanghai')::date;
 finish := (d::timestamp + interval '8 hours') AT TIME ZONE 'Asia/Shanghai';
 IF at_time < finish THEN RETURN jsonb_build_object('status','not_due'); END IF;
 INSERT INTO daily_digests(digest_date,window_start,window_end,record_ids,total_records)
 SELECT d,finish-interval '24 hours',finish,
 COALESCE(array_agg(id ORDER BY fetched_at DESC,id),'{}'::uuid[]),count(*)
 FROM (SELECT r.id,r.fetched_at FROM public_resources r
   WHERE r.fetched_at >= finish-interval '24 hours' AND r.fetched_at < finish
   AND jsonb_array_length(COALESCE(r.raw_payload->'classification'->'topic_ids','[]'))>0
   ORDER BY r.fetched_at DESC,r.id LIMIT 100) selected
 ON CONFLICT(digest_date) DO NOTHING;
 SELECT to_jsonb(x) INTO result FROM daily_digests x WHERE digest_date=d;
 RETURN result;
END $$;
