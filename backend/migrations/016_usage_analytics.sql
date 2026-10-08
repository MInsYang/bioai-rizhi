-- First-party, bounded usage measurements. No raw IP, user agent, search term,
-- request body, tool argument or persistent person identifier is retained.
CREATE TABLE usage_analytics_state (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 collected_since timestamptz NOT NULL DEFAULT now()
);
INSERT INTO usage_analytics_state(singleton) VALUES (true);

CREATE TABLE usage_web_events (
 event_id uuid PRIMARY KEY,
 received_at timestamptz NOT NULL DEFAULT now(),
 event_type text NOT NULL CHECK (event_type IN
   ('page_view','outbound_click','company_open','resource_open','mcp_copy','rss_click')),
 session_hash text NOT NULL CHECK (session_hash ~ '^[a-f0-9]{64}$'),
 page_path text NOT NULL CHECK (length(page_path) BETWEEN 1 AND 200),
 target text CHECK (length(target) BETWEEN 1 AND 253),
 referrer_host text CHECK (length(referrer_host) BETWEEN 1 AND 253),
 traffic_class text NOT NULL CHECK (traffic_class IN ('browser','automated','unknown')),
 is_test boolean NOT NULL DEFAULT false,
 classification_version text NOT NULL DEFAULT 'user_agent_heuristic_v1'
   CHECK (classification_version = 'user_agent_heuristic_v1')
);
CREATE INDEX usage_web_events_received_idx ON usage_web_events(received_at);
CREATE INDEX usage_web_events_browser_idx ON usage_web_events(received_at,event_type)
 WHERE NOT is_test AND traffic_class='browser';

CREATE TABLE usage_mcp_calls (
 execution_id uuid PRIMARY KEY,
 started_at timestamptz NOT NULL,
 tool_name text NOT NULL CHECK (tool_name IN
   ('search_resources','get_resource','search_companies','get_company','get_source_status')),
 success boolean NOT NULL,
 duration_ms integer NOT NULL CHECK (duration_ms >= 0),
 traffic_class text NOT NULL CHECK (traffic_class IN ('browser','automated','unknown')),
 is_test boolean NOT NULL DEFAULT false
);
CREATE INDEX usage_mcp_calls_started_idx ON usage_mcp_calls(started_at);

CREATE FUNCTION cleanup_usage_analytics(at_time timestamptz DEFAULT now()) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE web_count integer; mcp_count integer;
BEGIN
 DELETE FROM usage_web_events WHERE received_at < at_time - interval '90 days';
 GET DIAGNOSTICS web_count = ROW_COUNT;
 DELETE FROM usage_mcp_calls WHERE started_at < at_time - interval '90 days';
 GET DIAGNOSTICS mcp_count = ROW_COUNT;
 RETURN jsonb_build_object('web_events_deleted',web_count,'mcp_calls_deleted',mcp_count);
END $$;
