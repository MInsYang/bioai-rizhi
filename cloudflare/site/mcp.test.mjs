import assert from "node:assert/strict";
import test from "node:test";
import { handleMcp, MCP_LIMITS } from "./mcp.js";

const ORIGIN = "https://bioai.example.test";
const RECORD_ID = "a06d16e4-4dca-4f47-a0be-6158475f876b";
const EVENT_ID = "4ce21963-8723-4a17-b59f-42892e83de5b";
const environment = { SITE_ORIGIN: ORIGIN };
const context = { waitUntil() {} };

function request(body, options = {}) {
  const { headers = {}, ...other } = options;
  return new Request(`${ORIGIN}/mcp`, {
    method: "POST", headers: {
      Host: "bioai.example.test", "Content-Type": "application/json",
      Accept: "application/json, text/event-stream", ...headers,
    }, body: typeof body === "string" ? body : JSON.stringify(body), ...other,
  });
}
function legacy(method, params = {}, id = 1) {
  return { jsonrpc: "2.0", id, method, params };
}
async function payload(response) {
  const body = await response.text();
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const messages = body.split("\n").filter((line) => line.startsWith("data: ") && line.length > 6).map((line) => JSON.parse(line.slice(6)));
    const final = messages.findLast((message) => message.id !== undefined);
    assert.ok(final, body);
    return final;
  }
  return JSON.parse(body);
}
function sourceRecord() {
  return {
    id: RECORD_ID, title: "A virtual-cell preprint", canonical_url: "https://www.biorxiv.org/content/10.1234/example",
    excerpt: "Stored abstract.", content_text: "x".repeat(6500), source_name: "bioRxiv", source_type: "publications",
    registry_key: "biorxiv", published_at: "2026-10-05T00:00:00Z", fetched_at: "2026-10-06T00:00:00Z",
    academic: { status: "preprint", version: "3", doi: "10.1234/example", journal_doi: null },
    topics: ["virtual-cell"], classification: { topic_ids: ["virtual-cell"], model_form: "computational", biological_model: null, ai_related: true, method: "automated_keyword_v1", query_version: "focus-2026-10-v1" },
    raw_payload: { secret: "NOT_PUBLIC" }, config: { token: "NOT_PUBLIC" }, last_error: "NOT_PUBLIC",
  };
}

test("legacy initialize and tool discovery use the official handler without public API reads", async () => {
  let reads = 0;
  const apiRead = () => { reads++; throw new Error("Unexpected API read"); };
  const initialized = await handleMcp(request(legacy("initialize", {
    protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "acceptance-test", version: "1" },
  })), environment, context, apiRead);
  assert.equal(initialized.status, 200);
  const hello = await payload(initialized);
  assert.equal(hello.result.serverInfo.name, "bioai-rizhi");
  assert.equal(initialized.headers.get("mcp-session-id"), null);
  const listed = await handleMcp(request(legacy("tools/list")), environment, context, apiRead);
  const { result } = await payload(listed);
  assert.deepEqual(result.tools.map((tool) => tool.name).sort(), ["get_company", "get_resource", "get_source_status", "search_companies", "search_resources"]);
  for (const tool of result.tools) assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(reads, 0);
});

test("2026-07-28 discovery and calls work without initialization, with mirrored-header validation", async () => {
  const metadata = {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientInfo": { name: "modern-test", version: "1" },
    "io.modelcontextprotocol/clientCapabilities": {},
  };
  const discovered = await handleMcp(request(legacy("server/discover", { _meta: metadata }), {
    headers: { "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "server/discover" },
  }), environment, context, () => { throw new Error("Unexpected API read"); });
  assert.equal(discovered.status, 200);
  const info = await payload(discovered);
  assert.ok(info.result);
  let reads = 0;
  const body = legacy("tools/call", { name: "search_resources", arguments: { topic: "organoid" }, _meta: metadata });
  const headers = { "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "tools/call", "Mcp-Name": "search_resources" };
  const called = await handleMcp(request(body, { headers }), environment, context, async () => { reads++; return { total: 0, items: [] }; });
  assert.equal(called.status, 200);
  const value = await payload(called);
  assert.ok(value.result);
  const mismatched = await handleMcp(request(body, { headers: { ...headers, "Mcp-Name": "get_company" } }), environment, context, async () => { reads++; });
  assert.equal(mismatched.status, 400);
  assert.equal((await payload(mismatched)).error.code, -32020);
  assert.equal(reads, 1);
});

test("source search keeps preprint status and keyword provenance while using bounded API filters", async () => {
  const calls = [];
  const apiRead = async (path, params) => { calls.push({ path, params }); return { total: 1, items: [sourceRecord()] }; };
  const response = await handleMcp(request(legacy("tools/call", {
    name: "search_resources", arguments: { topic: "virtual-cell", academic: "academic", limit: 2 },
  })), environment, context, apiRead);
  const { result } = await payload(response);
  assert.equal(result.isError, undefined);
  const data = result.structuredContent ?? JSON.parse(result.content[0].text);
  assert.equal(data.items[0].academic.status, "preprint");
  assert.equal(data.items[0].academic.version, "3");
  assert.equal(data.items[0].classification.method, "automated_keyword_v1");
  assert.equal(data.items[0].classification.query_version, "focus-2026-10-v1");
  assert.equal(data.items[0].classification.ai_related, true);
  assert.equal(data.items[0].classification.biological_model, null);
  assert.equal(data.items[0].publication_status, "source_record");
  assert.equal(data.items[0].site_url, `${ORIGIN}/records/${RECORD_ID}`);
  assert.equal(calls[0].path, "/api/records");
  assert.equal(calls[0].params.academic, true);
  assert.equal(calls[0].params.limit, 2);
  assert.ok(!JSON.stringify(data).includes("NOT_PUBLIC"));
});

test("resource text is truncated explicitly and arbitrary URL arguments cannot reach apiRead", async () => {
  let reads = 0;
  const apiRead = async () => { reads++; return sourceRecord(); };
  const good = await payload(await handleMcp(request(legacy("tools/call", {
    name: "get_resource", arguments: { id: RECORD_ID },
  })), environment, context, apiRead));
  const data = good.result.structuredContent ?? JSON.parse(good.result.content[0].text);
  assert.equal(data.data.content_text.length, 6000);
  assert.equal(data.data.content_truncated, true);
  assert.equal(data.data.content_char_count, 6500);
  const invalid = await payload(await handleMcp(request(legacy("tools/call", {
    name: "get_resource", arguments: { id: "https://127.0.0.1/internal", url: "http://169.254.169.254/" },
  })), environment, context, apiRead));
  assert.ok(invalid.error || invalid.result?.isError);
  assert.equal(reads, 1);
});

test("oversized limits and unknown/admin tools never call the public read callback", async () => {
  let reads = 0;
  for (const params of [
    { name: "search_resources", arguments: { limit: 41 } },
    { name: "search_companies", arguments: { query: "x".repeat(201) } },
    { name: "publish_event", arguments: { id: EVENT_ID } },
  ]) {
    const message = await payload(await handleMcp(request(legacy("tools/call", params)), environment, context, async () => { reads++; }));
    assert.ok(message.error || message.result?.isError);
  }
  assert.equal(reads, 0);
});

test("missing evidence blocks an approved-looking event, and database errors are redacted", async () => {
  for (const event of [
    { id: EVENT_ID, review_status: "approved" },
    { id: EVENT_ID, review_status: "approved", evidence_count: 1, evidence: [] },
  ]) {
    const denied = await payload(await handleMcp(request(legacy("tools/call", {
      name: "get_resource", arguments: { id: EVENT_ID, kind: "event" },
    })), environment, context, async () => event));
    assert.equal(denied.result.isError, true);
  }
  const failed = await payload(await handleMcp(request(legacy("tools/call", {
    name: "get_company", arguments: { slug: "example" },
  })), environment, context, async () => { throw new Error("postgresql://admin:NOT_PUBLIC@host/database"); }));
  assert.equal(failed.result.isError, true);
  assert.ok(!JSON.stringify(failed).includes("NOT_PUBLIC"));
});

test("source coverage omits unverified social accounts and internal configuration/errors", async () => {
  const sourceRows = [
    { id: "source-1", name: "Public feed", url: "https://example.test/rss", verified: true, enabled: false, verification_status: "verified", source_type: "rss", adapter: "rss", cloud_runtime_enabled: false, ttl_hours: 6, consecutive_failures: 2, next_poll_at: "2026-10-08T01:00:00Z", config: { key: "NOT_PUBLIC" }, last_error: "NOT_PUBLIC" },
    { id: "source-2", name: "Pending social", source_type: "social", verified: false },
  ];
  const response = await payload(await handleMcp(request(legacy("tools/call", {
    name: "get_source_status", arguments: {},
  })), environment, context, async (path) => path === "/api/topics" ? [{ id: "organoid", label: "类器官", description: "Physical organoids are distinguished from AI models." }] : sourceRows));
  const data = response.result.structuredContent ?? JSON.parse(response.result.content[0].text);
  assert.equal(data.data.total, 1);
  assert.equal(data.data.items[0].enabled, false);
  assert.equal(data.data.items[0].cloud_runtime_enabled, false);
  assert.equal(data.data.items[0].consecutive_failures, 2);
  assert.equal(data.data.items[0].ttl_hours, 6);
  assert.equal(data.data.topics[0].id, "organoid");
  assert.ok(!JSON.stringify(data).includes("NOT_PUBLIC"));
  assert.ok(!JSON.stringify(data).includes("Pending social"));
});

test("Origin, Host and Content-Type guards reject before protocol/API execution", async () => {
  const apiRead = () => { throw new Error("Guard did not run"); };
  for (const [headers, status] of [
    [{ Origin: "https://evil.example" }, 403],
    [{ Origin: "null" }, 403],
    [{ Host: "evil.example" }, 421],
    [{ "Content-Type": "text/plain" }, 415],
  ]) {
    const response = await handleMcp(request(legacy("tools/list"), { headers }), environment, context, apiRead);
    assert.equal(response.status, status);
  }
  const native = await handleMcp(request(legacy("tools/list")), environment, context, apiRead);
  assert.equal(native.status, 200);
});

test("declared and streamed oversized bodies and JSON-RPC batches are rejected", async () => {
  const apiRead = () => { throw new Error("Unexpected API read"); };
  const tooLarge = await handleMcp(request(" ".repeat(MCP_LIMITS.bodyBytes + 1)), environment, context, apiRead);
  assert.equal(tooLarge.status, 413);
  const declared = await handleMcp(request("{}", { headers: { "Content-Length": String(MCP_LIMITS.bodyBytes + 1) } }), environment, context, apiRead);
  assert.equal(declared.status, 413);
  const batch = await handleMcp(request([legacy("tools/list")]), environment, context, apiRead);
  assert.equal(batch.status, 400);
});

test("optional Cloudflare request quota rejects exhausted clients", async () => {
  const response = await handleMcp(request(legacy("tools/list"), { headers: { Origin: ORIGIN } }), {
    ...environment, MCP_RATE_LIMITER: { async limit() { return { success: false }; } },
  }, context, () => { throw new Error("Unexpected API read"); });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
});

test("company searches preserve API topic_ids, and profiles keep only evidenced approved events", async () => {
  const company = { id: "company-1", slug: "example", name_en: "Example", topic_ids: ["organoid"], official_website: "https://example.test/", events_30d: null };
  const calls = [];
  const searched = await payload(await handleMcp(request(legacy("tools/call", {
    name: "search_companies", arguments: { topic: "organoid", history: true, offset: 20 },
  })), environment, context, async (path, params) => { calls.push({ path, params }); return { total: 21, items: [company] }; }));
  const searchData = searched.result.structuredContent;
  assert.deepEqual(searchData.items[0].topics, ["organoid"]);
  assert.equal(searchData.items[0].events_30d, null);
  assert.equal(calls[0].path, "/api/companies");
  assert.equal(calls[0].params.history, true);
  assert.equal(calls[0].params.offset, 20);
  const profile = { ...company, alias_records: [{ alias: "Former Example", verification_status: "manual_reviewed" }], sources: [
    { id: "source-1", source_type: "rss" }, { id: "source-2", source_type: "social", verified: false },
  ], events: [
    { id: EVENT_ID, title: "Published event", review_status: "approved", evidence_count: 1 },
    { id: EVENT_ID, title: "No evidence", review_status: "approved" },
    { id: EVENT_ID, title: "Invalid count", review_status: "approved", evidence_count: Infinity },
    { id: EVENT_ID, title: "Draft", review_status: "draft", evidence_count: 3 },
  ] };
  const fetched = await payload(await handleMcp(request(legacy("tools/call", {
    name: "get_company", arguments: { slug: "example" },
  })), environment, context, async () => profile));
  const data = fetched.result.structuredContent.data;
  assert.deepEqual(data.topics, ["organoid"]);
  assert.equal(data.aliases[0].verification_status, "manual_reviewed");
  assert.equal(data.events.length, 1);
  assert.equal(data.events[0].publication_status, "reviewed_event");
  assert.equal(data.events_truncated, false);
  assert.equal(data.sources.length, 1);
  assert.equal(data.sources[0].verified, null);
  assert.equal(data.sources[0].enabled, null);
});

test("approved event evidence preserves original source, preprint status and citation spans", async () => {
  const event = { id: EVENT_ID, title: "Reviewed event", review_status: "approved", evidence_count: 1, academic: [{ status: "preprint", version: "3" }], evidence: [
    { raw_item_id: RECORD_ID, source_name: "bioRxiv", source_title: "Original preprint", source_type: "publications", canonical_url: "https://www.biorxiv.org/content/example", evidence_text: "Source quote.", evidence_start: 100, evidence_end: 113, content_hash: "hash", academic: { status: "preprint", version: "3" }, config: { key: "NOT_PUBLIC" } },
  ] };
  const response = await payload(await handleMcp(request(legacy("tools/call", {
    name: "get_resource", arguments: { id: EVENT_ID, kind: "event" },
  })), environment, context, async () => event));
  const data = response.result.structuredContent.data;
  assert.equal(data.publication_status, "reviewed_event");
  assert.equal(data.evidence[0].academic.status, "preprint");
  assert.equal(data.evidence[0].source_title, "Original preprint");
  assert.equal(data.evidence[0].evidence_start, 100);
  assert.equal(data.evidence[0].url, "https://www.biorxiv.org/content/example");
  assert.ok(!JSON.stringify(data).includes("NOT_PUBLIC"));
});

test("CORS allowlist supports browser preflight and makes rejected body errors visible", async () => {
  const clientOrigin = "https://client.example.test";
  const env = { ...environment, MCP_ALLOWED_ORIGINS: clientOrigin };
  const apiRead = () => { throw new Error("Unexpected API read"); };
  const preflight = await handleMcp(new Request(`${ORIGIN}/mcp`, { method: "OPTIONS", headers: {
    Origin: clientOrigin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,mcp-protocol-version",
  } }), env, context, apiRead);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), clientOrigin);
  assert.match(preflight.headers.get("access-control-allow-headers"), /mcp-protocol-version/);
  const rejected = await handleMcp(request("not-json", { headers: { Origin: clientOrigin } }), env, context, apiRead);
  assert.equal(rejected.status, 400);
  assert.equal(rejected.headers.get("access-control-allow-origin"), clientOrigin);
  const disallowed = await handleMcp(request(legacy("tools/list"), { headers: { Origin: "https://other.example.test" } }), env, context, apiRead);
  assert.equal(disallowed.status, 403);
  assert.equal(disallowed.headers.get("access-control-allow-origin"), null);
});
