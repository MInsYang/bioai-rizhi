/** Minimal first-party measurements; public telemetry never stores request text. */
export const ANALYTICS_LIMITS = Object.freeze({bodyBytes: 2048, sessionEventsPerMinute: 60, retentionDays: 90});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SLUG = /^[a-z0-9][a-z0-9_-]{0,119}$/u;
const TOPICS = new Set(['virtual-cell','organoid','virtual-embryo','virtual-organ','drug-discovery']);
const GUIDES = new Set(['virtual-cell-models','ai-drug-discovery-collaborations','weekly-reading-method']);
const VIEWS = new Set(['frontpage','overview','timeline','hot','academic','directory','sources','saved','news','daily','connect','models','companies','favorites']);
const EVENTS = new Set(['page_view','outbound_click','company_open','resource_open','mcp_copy','rss_click']);
const TOOLS = new Set(['search_resources','get_resource','search_companies','get_company','get_source_status']);
const CLASSIFICATION = 'user_agent_heuristic_v1';
const json = (body, status = 200, headers = {}) => Response.json(body, {status, headers: {'Cache-Control':'no-store', ...headers}});
const invalid = (detail, status = 422) => Object.assign(new Error(detail), {status});

function dateIdentifier(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}
/** Whitelist public destinations only; search strings, admin paths and arbitrary hashes are rejected. */
export function validAnalyticsPath(value) {
  if (typeof value !== 'string' || value.length > 200 || /[?%\s\\\u0000-\u001f\u007f]/u.test(value)) return false;
  if (['/','/connect','/guides','/briefings'].includes(value)) return true;
  if (value.startsWith('/#')) {
    const parts = value.slice(2).split('/');
    if (parts.length === 1) return VIEWS.has(parts[0]);
    if (parts.length !== 2) return false;
    if (parts[0] === 'topic') return TOPICS.has(parts[1]);
    if (parts[0] === 'company') return SLUG.test(parts[1]);
    if (['record','event'].includes(parts[0])) return UUID.test(parts[1]);
    return parts[0] === 'daily' && dateIdentifier(parts[1]);
  }
  const parts = value.slice(1).split('/');
  if (parts.length !== 2 || !value.startsWith('/')) return false;
  if (parts[0] === 'topics') return TOPICS.has(parts[1]);
  if (parts[0] === 'guides') return GUIDES.has(parts[1]);
  if (parts[0] === 'companies') return SLUG.test(parts[1]);
  if (['records','events'].includes(parts[0])) return UUID.test(parts[1]);
  return parts[0] === 'digest' && dateIdentifier(parts[1]);
}
function validHostname(value) {
  if (typeof value !== 'string' || value.length > 253 || value !== value.toLowerCase()) return false;
  const labels = value.split('.');
  return labels.length >= 2 && labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label))
    && /[a-z]/u.test(labels.at(-1)) && !['localhost','local','internal','invalid'].includes(labels.at(-1));
}
function validatedEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('Expected one telemetry event');
  const keys = new Set(['event_id','session_id','event_type','path','target','referrer_host','traffic_type']);
  if (Object.keys(value).some(key => !keys.has(key))) throw invalid('Unknown telemetry field');
  if (typeof value.event_id !== 'string' || !UUID.test(value.event_id) || typeof value.session_id !== 'string' || !UUID.test(value.session_id)) throw invalid('Invalid event or session identifier');
  if (!EVENTS.has(value.event_type) || !validAnalyticsPath(value.path)) throw invalid('Invalid event type or public page path');
  if (value.traffic_type !== undefined && value.traffic_type !== 'test') throw invalid('Only test traffic can be explicitly flagged');
  if (value.referrer_host !== undefined && value.referrer_host !== null && !validHostname(value.referrer_host)) throw invalid('Referrer must be a public hostname only');
  if (value.target !== undefined && value.target !== null) {
    const target = value.target;
    const valid = value.event_type === 'outbound_click' ? validHostname(target)
      : value.event_type === 'company_open' ? typeof target === 'string' && SLUG.test(target)
      : value.event_type === 'resource_open' ? typeof target === 'string' && UUID.test(target)
      : value.event_type === 'mcp_copy' ? target === 'mcp'
      : value.event_type === 'rss_click' ? target === 'rss' : false;
    if (!valid) throw invalid('Invalid action target');
  }
  return value;
}

export function classifyTraffic(request) {
  // The label is a user-agent heuristic, not verified human/bot identity.
  const agent = (request.headers.get('user-agent') || '').slice(0,1024);
  if (/bot|crawler|spider|slurp|headless|puppeteer|playwright|curl|wget|python|node|undici|postman|monitor|health.?check/iu.test(agent)) return 'automated';
  if (/Mozilla\/(?:4|5)\.0/iu.test(agent) && /Chrome\/|Firefox\/|Safari\/|Edg\/|Opera|OPR\/|AppleWebKit\//iu.test(agent)) return 'browser';
  return 'unknown';
}
export function analyticsOptOut(request) {
  return request.headers.get('dnt') === '1' || request.headers.get('sec-gpc') === '1';
}
function testTraffic(request) {
  const url = new URL(request.url);
  return ['localhost','127.0.0.1','[::1]'].includes(url.hostname)
    || url.searchParams.get('analytics_test') === '1' || request.headers.get('x-bioai-analytics-test') === '1';
}
function sameOrigin(request, env) {
  const url = new URL(request.url);
  const expected = env.SITE_ORIGIN ? new URL(env.SITE_ORIGIN).origin : url.origin;
  if (url.origin !== expected) return false;
  const host = request.headers.get('host');
  if (host && host.toLowerCase() !== url.host.toLowerCase()) return false;
  const source = request.headers.get('origin');
  if (source !== null) return source === expected;
  // Same-origin Fetch Metadata also allows a first-party browser sendBeacon.
  return request.headers.get('sec-fetch-site') === 'same-origin';
}
async function boundedJson(request) {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > ANALYTICS_LIMITS.bodyBytes)) throw invalid('Telemetry request too large', 413);
  if (!request.body) throw invalid('Missing telemetry body', 400);
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > ANALYTICS_LIMITS.bodyBytes) { await reader.cancel(); throw invalid('Telemetry request too large', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of chunks) {bytes.set(part, offset); offset += part.byteLength;}
  try {return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes));}
  catch {throw invalid('Invalid telemetry JSON', 400);}
}
export async function sessionHash(sessionId, env) {
  const salt = env.ANALYTICS_SALT || env.ADMIN_TOKEN;
  if (typeof salt !== 'string' || salt.length < 32) throw invalid('Telemetry is not configured', 503);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(salt), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode('browser-session:v1:' + sessionId.toLowerCase())));
  return Array.from(digest, value => value.toString(16).padStart(2,'0')).join('');
}

// A bounded isolate fallback supplements the existing Cloudflare API quota.
// Keys are HMAC session digests; no IP or raw session identifier enters this map.
const sessionRates = new Map();
function sessionQuota(hash, now = Date.now()) {
  const minute = Math.floor(now / 60000), current = sessionRates.get(hash);
  const bucket = current?.minute === minute ? current : {minute, count:0};
  bucket.count++; sessionRates.set(hash, bucket);
  if (sessionRates.size > 2048) sessionRates.delete(sessionRates.keys().next().value);
  return bucket.count <= ANALYTICS_LIMITS.sessionEventsPerMinute;
}
/** databaseFactory is lazy: origin/body/consent/quota failures cannot open a DB. */
export async function handleTelemetry(request, env, databaseFactory) {
  if (request.method !== 'POST') return json({detail:'Use POST for telemetry'},405,{Allow:'POST'});
  if (!sameOrigin(request, env)) return json({detail:'Same-origin telemetry required'},403);
  if (analyticsOptOut(request)) return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get('content-type') || '')) return json({detail:'Content-Type must be application/json'},415);
  try {
    const value = validatedEvent(await boundedJson(request));
    const hash = await sessionHash(value.session_id, env);
    if (!sessionQuota(hash)) return json({detail:'Telemetry event limit reached'},429,{'Retry-After':'60'});
    const sql = databaseFactory();
    await sql.query(`INSERT INTO usage_web_events(event_id,event_type,session_hash,page_path,target,referrer_host,traffic_class,is_test)
      VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(event_id) DO NOTHING`,
    [value.event_id.toLowerCase(), value.event_type, hash, value.path, value.target ?? null, value.referrer_host ?? null,
      classifyTraffic(request), value.traffic_type === 'test' || testTraffic(request)]);
    return json({accepted:true},202);
  } catch (error) {
    if (error.status) return json({detail:error.message},error.status);
    console.error(JSON.stringify({event:'analytics_write_failed',channel:'web'}));
    return json({detail:'Telemetry temporarily unavailable'},503);
  }
}

/** Invoked only by registered tool callbacks, never by transport/protocol parsing. */
export function recordMcpExecution(request, env, ctx, sql, execution) {
  if (analyticsOptOut(request)) return;
  // Schedule the entire write, including conversion, so telemetry is fail-open.
  const task = Promise.resolve().then(async () => {
    if (!TOOLS.has(execution.tool_name) || typeof execution.success !== 'boolean') return;
    const duration = Math.max(0,Math.min(2147483647,Math.round(execution.duration_ms)));
    if (!Number.isFinite(duration)) return;
    await sql.query(`INSERT INTO usage_mcp_calls(execution_id,started_at,tool_name,success,duration_ms,traffic_class,is_test)
      VALUES($1::uuid,$2::timestamptz,$3,$4,$5,$6,$7) ON CONFLICT(execution_id) DO NOTHING`,
    [crypto.randomUUID(), execution.started_at, execution.tool_name, execution.success, duration, classifyTraffic(request), testTraffic(request)]);
  }).catch(() => console.error(JSON.stringify({event:'analytics_write_failed',channel:'mcp'})));
  try {ctx?.waitUntil?.(task);} catch { /* Metrics cannot change a public tool result. */ }
}

export function analyticsPeriod(days, atTime = new Date()) {
  // UTC+08 has no daylight-saving transition; use UTC arithmetic for date boundaries.
  const now = new Date(atTime), shifted = new Date(now.getTime() + 8*3600000);
  const endDate = shifted.toISOString().slice(0,10);
  const endMidnight = Date.parse(endDate + 'T00:00:00Z');
  const startDate = new Date(endMidnight - (days-1)*86400000).toISOString().slice(0,10);
  return {start:new Date(Date.parse(startDate+'T00:00:00Z')-8*3600000).toISOString(), end:now.toISOString(), start_date:startDate, end_date:endDate};
}
const BROWSER = "NOT is_test AND traffic_class='browser'";
const number = value => value === null || value === undefined ? null : Number(value);
function numbers(row, textFields = []) {
  return Object.fromEntries(Object.entries(row).map(([key,value]) => [key, textFields.includes(key) ? value : number(value)]));
}

export async function readAnalytics(sql, days = 7, atTime = new Date()) {
  const period = analyticsPeriod(days, atTime), bounds = [period.start,period.end];
  const [state,summary,mcp,tools,daily,pages,referrers,actions,excluded] = await Promise.all([
    sql.query('SELECT collected_since FROM usage_analytics_state WHERE singleton=true'),
    sql.query(`SELECT count(*) FILTER(WHERE event_type='page_view') AS page_views,
      count(DISTINCT session_hash) FILTER(WHERE event_type='page_view') AS sessions,
      count(*) FILTER(WHERE event_type<>'page_view') AS clicks,
      count(*) FILTER(WHERE event_type='outbound_click') AS outbound_clicks,
      count(*) FILTER(WHERE event_type='resource_open') AS resource_opens,
      count(*) FILTER(WHERE event_type='company_open') AS company_opens,
      count(*) FILTER(WHERE event_type='mcp_copy') AS mcp_copies,
      count(*) FILTER(WHERE event_type='rss_click') AS rss_clicks
      FROM usage_web_events WHERE received_at >= $1::timestamptz AND received_at < $2::timestamptz AND ${BROWSER}`,bounds),
    sql.query(`SELECT count(*) AS tool_calls,count(*) FILTER(WHERE success) AS successes,count(*) FILTER(WHERE NOT success) AS errors,
      avg(duration_ms) AS avg_duration_ms,percentile_cont(0.95) WITHIN GROUP(ORDER BY duration_ms) AS p95_duration_ms
      FROM usage_mcp_calls WHERE started_at >= $1::timestamptz AND started_at < $2::timestamptz AND NOT is_test`,bounds),
    sql.query(`SELECT tool_name AS tool,count(*) AS tool_calls,count(*) FILTER(WHERE success) AS successes,count(*) FILTER(WHERE NOT success) AS errors,
      avg(duration_ms) AS avg_duration_ms,percentile_cont(0.95) WITHIN GROUP(ORDER BY duration_ms) AS p95_duration_ms
      FROM usage_mcp_calls WHERE started_at >= $1::timestamptz AND started_at < $2::timestamptz AND NOT is_test
      GROUP BY tool_name ORDER BY tool_calls DESC,tool_name`,bounds),
    sql.query(`WITH dates AS (SELECT generate_series($3::date::timestamp,$4::date::timestamp,interval '1 day')::date AS day),
      web AS (SELECT (received_at AT TIME ZONE 'Asia/Shanghai')::date AS day,
        count(*) FILTER(WHERE event_type='page_view') AS page_views,
        count(DISTINCT session_hash) FILTER(WHERE event_type='page_view') AS sessions,
        count(*) FILTER(WHERE event_type<>'page_view') AS clicks
        FROM usage_web_events WHERE received_at >= $1::timestamptz AND received_at < $2::timestamptz AND ${BROWSER} GROUP BY 1),
      mcp AS (SELECT (started_at AT TIME ZONE 'Asia/Shanghai')::date AS day,count(*) AS calls,
        count(*) FILTER(WHERE success) AS successes,count(*) FILTER(WHERE NOT success) AS errors
        FROM usage_mcp_calls WHERE started_at >= $1::timestamptz AND started_at < $2::timestamptz AND NOT is_test GROUP BY 1)
      SELECT to_char(d.day,'YYYY-MM-DD') AS date,COALESCE(w.page_views,0) AS page_views,COALESCE(w.sessions,0) AS sessions,
        COALESCE(w.clicks,0) AS clicks,COALESCE(m.calls,0) AS mcp_tool_calls,COALESCE(m.successes,0) AS mcp_successes,COALESCE(m.errors,0) AS mcp_errors
      FROM dates d LEFT JOIN web w USING(day) LEFT JOIN mcp m USING(day) ORDER BY d.day`,[...bounds,period.start_date,period.end_date]),
    sql.query(`SELECT page_path AS path,count(*) AS page_views,count(DISTINCT session_hash) AS sessions
      FROM usage_web_events WHERE received_at >= $1::timestamptz AND received_at < $2::timestamptz AND ${BROWSER} AND event_type='page_view'
      GROUP BY page_path ORDER BY page_views DESC,page_path LIMIT 10`,bounds),
    sql.query(`SELECT COALESCE(referrer_host,'(direct)') AS referrer_host,count(*) AS page_views,count(DISTINCT session_hash) AS sessions
      FROM usage_web_events WHERE received_at >= $1::timestamptz AND received_at < $2::timestamptz AND ${BROWSER} AND event_type='page_view'
      GROUP BY referrer_host ORDER BY page_views DESC,referrer_host LIMIT 10`,bounds),
    sql.query(`SELECT event_type,target,count(*) AS count FROM usage_web_events
      WHERE received_at >= $1::timestamptz AND received_at < $2::timestamptz AND ${BROWSER} AND event_type<>'page_view'
      GROUP BY event_type,target ORDER BY count DESC,event_type,target LIMIT 10`,bounds),
    sql.query(`SELECT count(*) FILTER(WHERE is_test) AS test_events,
      count(*) FILTER(WHERE NOT is_test AND traffic_class='automated') AS automated_web_events,
      count(*) FILTER(WHERE NOT is_test AND traffic_class='unknown') AS unknown_web_events,
      (SELECT count(*) FROM usage_mcp_calls WHERE started_at >= $1::timestamptz AND started_at < $2::timestamptz AND is_test) AS test_mcp_calls
      FROM usage_web_events WHERE received_at >= $1::timestamptz AND received_at < $2::timestamptz`,bounds),
  ]);
  if (!state[0]?.collected_since) throw new Error('Analytics migration is not installed');
  const calls = numbers(mcp[0]);
  return {
    timezone:'Asia/Shanghai',days,generated_at:period.end,
    collected_since:new Date(state[0].collected_since).toISOString(),period,retention_days:ANALYTICS_LIMITS.retentionDays,
    summary:numbers(summary[0]),
    mcp:{...calls,error_rate:calls.tool_calls ? calls.errors/calls.tool_calls : null,tools:tools.map(row=>numbers(row,['tool']))},
    daily:daily.map(row=>numbers(row,['date'])),top_pages:pages.map(row=>numbers(row,['path'])),
    top_referrers:referrers.map(row=>numbers(row,['referrer_host'])),top_actions:actions.map(row=>numbers(row,['event_type','target'])),excluded:numbers(excluded[0]),
    methodology:{session_window_minutes:30,
      session_definition:'Distinct anonymous browser sessions that expire after 30 minutes of inactivity and have at least one accepted page view; sessions are not people. Daily distinct sessions are not additive.',
      web_inclusion:'Non-test events classified browser by a user-agent heuristic; automated and unknown events are shown separately. Clicks include all recorded non-page-view actions.',
      mcp_inclusion:'Actual executions of registered tools, including native clients, excluding flagged tests. Handshakes, tools/list, transport failures and rejected arguments do not count as tool executions.',
      classification:CLASSIFICATION,
      privacy:'No raw IP, user agent, query, full referrer URL, tool arguments, prompts or content is stored. Session UUIDs are HMAC hashed. DNT/GPC requests are omitted.',
      coverage:'First-party measurements start at collected_since. Browser blocking, disabled JavaScript and failed telemetry writes can reduce coverage. No historical visitor estimates.'},
  };
}
/** Auth is enforced in the parent Worker before the lazy database is opened. */
export async function handleAdminAnalytics(request, sql) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/admin/analytics') return json({detail:'Not found'},404);
  if (request.method !== 'GET') return json({detail:'Use GET for analytics'},405,{Allow:'GET'});
  const values = url.searchParams.getAll('days');
  if ([...url.searchParams.keys()].some(key=>key!=='days') || values.length > 1 || (values.length && !['1','7','30'].includes(values[0]))) return json({detail:'days must be 1, 7 or 30'},422);
  return json(await readAnalytics(sql,values.length ? Number(values[0]) : 7));
}
