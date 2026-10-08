CREATE TABLE polling_profiles (id text PRIMARY KEY, ttl_hours integer NOT NULL CHECK(ttl_hours>0));
CREATE TABLE seed_imports (filename text NOT NULL, checksum text NOT NULL, metadata jsonb NOT NULL, imported_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(filename,checksum));
CREATE TABLE companies (
 id uuid PRIMARY KEY, slug text UNIQUE NOT NULL, name_zh text, name_en text NOT NULL,
 aliases jsonb NOT NULL DEFAULT '[]', track text NOT NULL, region text,
 focus jsonb NOT NULL DEFAULT '[]', official_website text,
 status text NOT NULL DEFAULT 'active', parent_company_id uuid REFERENCES companies(id),
 priority text NOT NULL REFERENCES polling_profiles(id), include_in_company_wall boolean NOT NULL DEFAULT true,
 notes text NOT NULL DEFAULT '', seed_payload jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE company_aliases (
 company_id uuid NOT NULL REFERENCES companies(id), alias text NOT NULL, normalized text NOT NULL,
 alias_type text NOT NULL CHECK(alias_type IN ('name_zh','name_en','alias','historical_brand')),
 verification_status text NOT NULL DEFAULT 'seed_unverified', valid_from date, valid_to date,
 PRIMARY KEY(company_id, normalized), CHECK(valid_to IS NULL OR valid_from IS NULL OR valid_to>=valid_from)
);
CREATE INDEX company_alias_lookup ON company_aliases(normalized);
CREATE TABLE company_identity_links (
 id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id), related_company_id uuid REFERENCES companies(id),
 related_name text NOT NULL, link_type text NOT NULL, verification_status text NOT NULL DEFAULT 'pending',
 evidence_url text, notes text NOT NULL DEFAULT '', UNIQUE(company_id,link_type,related_name)
);
CREATE TABLE sources (
 id uuid PRIMARY KEY, company_id uuid REFERENCES companies(id), registry_key text UNIQUE,
 name text NOT NULL, source_type text NOT NULL, url text NOT NULL, platform text, account_id text,
 verified boolean NOT NULL DEFAULT false, verification_status text NOT NULL DEFAULT 'pending'
 CHECK(verification_status IN ('pending','verified','rejected')),
 verified_at timestamptz, poll_profile text NOT NULL REFERENCES polling_profiles(id),
 enabled boolean NOT NULL DEFAULT false, adapter text NOT NULL DEFAULT 'unsupported',
 etag text, last_modified text, last_success_at timestamptz, next_poll_at timestamptz DEFAULT now(),
 consecutive_failures integer NOT NULL DEFAULT 0, last_error text,
 config jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,url), CHECK(verified=(verification_status='verified'))
);
CREATE INDEX sources_due ON sources(next_poll_at) WHERE enabled;
CREATE TABLE ingestion_jobs (
 id uuid PRIMARY KEY, source_id uuid NOT NULL REFERENCES sources(id), window_start timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','retry','succeeded','dead')),
 attempts integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL DEFAULT 3,
 available_at timestamptz NOT NULL DEFAULT now(), lease_token uuid, lease_expires_at timestamptz,
 worker_id text, last_error text, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 UNIQUE(source_id,window_start), CHECK(attempts>=0 AND max_attempts>0)
);
CREATE UNIQUE INDEX one_active_job_per_source ON ingestion_jobs(source_id) WHERE status IN ('queued','running','retry');
CREATE INDEX jobs_claim ON ingestion_jobs(available_at,created_at) WHERE status IN ('queued','retry');
CREATE TABLE ingestion_attempts (
 id bigserial PRIMARY KEY, job_id uuid NOT NULL REFERENCES ingestion_jobs(id), attempt integer NOT NULL,
 lease_token uuid NOT NULL, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 http_status integer, duration_ms integer, bytes_fetched integer, parsed_count integer,
 parser_version text NOT NULL DEFAULT 'foundation-v1', model_version text, prompt_version text,
 result text, error_stack text, UNIQUE(job_id,attempt)
);
CREATE TABLE raw_items (
 id uuid PRIMARY KEY, source_id uuid NOT NULL REFERENCES sources(id), job_id uuid REFERENCES ingestion_jobs(id),
 external_id text, canonical_url text, published_at timestamptz, fetched_at timestamptz NOT NULL DEFAULT now(),
 title text, raw_payload jsonb NOT NULL DEFAULT '{}', content_text text, content_hash text NOT NULL,
 UNIQUE(source_id,content_hash)
);
CREATE INDEX raw_identifiers ON raw_items(source_id,external_id);
CREATE INDEX raw_urls ON raw_items(canonical_url);
CREATE TABLE events (
 id uuid PRIMARY KEY, event_type text NOT NULL, title text NOT NULL, summary text,
 occurred_at timestamptz, published_at timestamptz, confidence numeric(4,3) NOT NULL CHECK(confidence BETWEEN 0 AND 1),
 review_status text NOT NULL CHECK(review_status IN ('pending','approved','rejected')),
 duplicate_group_id uuid, editor_pick boolean NOT NULL DEFAULT false, extraction_version text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE event_evidence (
 event_id uuid REFERENCES events(id), raw_item_id uuid REFERENCES raw_items(id), evidence_text text NOT NULL,
 evidence_start integer, evidence_end integer, PRIMARY KEY(event_id,raw_item_id),
 CHECK(evidence_start IS NULL OR (evidence_start>=0 AND evidence_end>=evidence_start))
);
CREATE TABLE event_entities (
 event_id uuid REFERENCES events(id), entity_type text NOT NULL, entity_id uuid NOT NULL, role text NOT NULL,
 PRIMARY KEY(event_id,entity_type,entity_id,role)
);
CREATE TABLE relations (
 id uuid PRIMARY KEY, subject_type text NOT NULL, subject_id uuid NOT NULL, predicate text NOT NULL,
 object_type text NOT NULL, object_id uuid NOT NULL, event_id uuid NOT NULL REFERENCES events(id),
 confidence numeric(4,3) NOT NULL CHECK(confidence BETWEEN 0 AND 1), valid_from timestamptz, valid_to timestamptz,
 UNIQUE(subject_type,subject_id,predicate,object_type,object_id,event_id), CHECK(valid_to IS NULL OR valid_from IS NULL OR valid_to>=valid_from)
);
CREATE TABLE verification_reviews (
 id uuid PRIMARY KEY, source_id uuid NOT NULL REFERENCES sources(id), decision text NOT NULL CHECK(decision IN ('verified','rejected','pending')),
 method text NOT NULL CHECK(method IN ('official_backlink','platform_badge','manual_review')),
 evidence_url text NOT NULL, evidence_text text NOT NULL, reviewer text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_log (
 id bigserial PRIMARY KEY, actor text NOT NULL, action text NOT NULL, entity_type text NOT NULL,
 entity_id uuid, before_value jsonb, after_value jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
