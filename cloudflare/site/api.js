import { TOPICS } from './topics.js';

// PostgreSQL remains the publication authority. Cloudflare messages and browser
// retries may be duplicated; every admin mutation runs on one DB transaction.
export class ApiError extends Error {
  constructor(status, detail) { super(detail); this.status = status; this.detail = detail; }
}
const fail = (status, detail) => { throw new ApiError(status, detail); };
const CASEFOLD = {"µ":"μ","ß":"ss","ŉ":"ʼn","ſ":"s","ǰ":"ǰ","ͅ":"ι","ΐ":"ΐ","ΰ":"ΰ","ς":"σ","ϐ":"β","ϑ":"θ","ϕ":"φ","ϖ":"π","ϰ":"κ","ϱ":"ρ","ϵ":"ε","և":"եւ","Ꭰ":"Ꭰ","Ꭱ":"Ꭱ","Ꭲ":"Ꭲ","Ꭳ":"Ꭳ","Ꭴ":"Ꭴ","Ꭵ":"Ꭵ","Ꭶ":"Ꭶ","Ꭷ":"Ꭷ","Ꭸ":"Ꭸ","Ꭹ":"Ꭹ","Ꭺ":"Ꭺ","Ꭻ":"Ꭻ","Ꭼ":"Ꭼ","Ꭽ":"Ꭽ","Ꭾ":"Ꭾ","Ꭿ":"Ꭿ","Ꮀ":"Ꮀ","Ꮁ":"Ꮁ","Ꮂ":"Ꮂ","Ꮃ":"Ꮃ","Ꮄ":"Ꮄ","Ꮅ":"Ꮅ","Ꮆ":"Ꮆ","Ꮇ":"Ꮇ","Ꮈ":"Ꮈ","Ꮉ":"Ꮉ","Ꮊ":"Ꮊ","Ꮋ":"Ꮋ","Ꮌ":"Ꮌ","Ꮍ":"Ꮍ","Ꮎ":"Ꮎ","Ꮏ":"Ꮏ","Ꮐ":"Ꮐ","Ꮑ":"Ꮑ","Ꮒ":"Ꮒ","Ꮓ":"Ꮓ","Ꮔ":"Ꮔ","Ꮕ":"Ꮕ","Ꮖ":"Ꮖ","Ꮗ":"Ꮗ","Ꮘ":"Ꮘ","Ꮙ":"Ꮙ","Ꮚ":"Ꮚ","Ꮛ":"Ꮛ","Ꮜ":"Ꮜ","Ꮝ":"Ꮝ","Ꮞ":"Ꮞ","Ꮟ":"Ꮟ","Ꮠ":"Ꮠ","Ꮡ":"Ꮡ","Ꮢ":"Ꮢ","Ꮣ":"Ꮣ","Ꮤ":"Ꮤ","Ꮥ":"Ꮥ","Ꮦ":"Ꮦ","Ꮧ":"Ꮧ","Ꮨ":"Ꮨ","Ꮩ":"Ꮩ","Ꮪ":"Ꮪ","Ꮫ":"Ꮫ","Ꮬ":"Ꮬ","Ꮭ":"Ꮭ","Ꮮ":"Ꮮ","Ꮯ":"Ꮯ","Ꮰ":"Ꮰ","Ꮱ":"Ꮱ","Ꮲ":"Ꮲ","Ꮳ":"Ꮳ","Ꮴ":"Ꮴ","Ꮵ":"Ꮵ","Ꮶ":"Ꮶ","Ꮷ":"Ꮷ","Ꮸ":"Ꮸ","Ꮹ":"Ꮹ","Ꮺ":"Ꮺ","Ꮻ":"Ꮻ","Ꮼ":"Ꮼ","Ꮽ":"Ꮽ","Ꮾ":"Ꮾ","Ꮿ":"Ꮿ","Ᏸ":"Ᏸ","Ᏹ":"Ᏹ","Ᏺ":"Ᏺ","Ᏻ":"Ᏻ","Ᏼ":"Ᏼ","Ᏽ":"Ᏽ","ᏸ":"Ᏸ","ᏹ":"Ᏹ","ᏺ":"Ᏺ","ᏻ":"Ᏻ","ᏼ":"Ᏼ","ᏽ":"Ᏽ","ᲀ":"в","ᲁ":"д","ᲂ":"о","ᲃ":"с","ᲄ":"т","ᲅ":"т","ᲆ":"ъ","ᲇ":"ѣ","ᲈ":"ꙋ","ẖ":"ẖ","ẗ":"ẗ","ẘ":"ẘ","ẙ":"ẙ","ẚ":"aʾ","ẛ":"ṡ","ẞ":"ss","ὐ":"ὐ","ὒ":"ὒ","ὔ":"ὔ","ὖ":"ὖ","ᾀ":"ἀι","ᾁ":"ἁι","ᾂ":"ἂι","ᾃ":"ἃι","ᾄ":"ἄι","ᾅ":"ἅι","ᾆ":"ἆι","ᾇ":"ἇι","ᾈ":"ἀι","ᾉ":"ἁι","ᾊ":"ἂι","ᾋ":"ἃι","ᾌ":"ἄι","ᾍ":"ἅι","ᾎ":"ἆι","ᾏ":"ἇι","ᾐ":"ἠι","ᾑ":"ἡι","ᾒ":"ἢι","ᾓ":"ἣι","ᾔ":"ἤι","ᾕ":"ἥι","ᾖ":"ἦι","ᾗ":"ἧι","ᾘ":"ἠι","ᾙ":"ἡι","ᾚ":"ἢι","ᾛ":"ἣι","ᾜ":"ἤι","ᾝ":"ἥι","ᾞ":"ἦι","ᾟ":"ἧι","ᾠ":"ὠι","ᾡ":"ὡι","ᾢ":"ὢι","ᾣ":"ὣι","ᾤ":"ὤι","ᾥ":"ὥι","ᾦ":"ὦι","ᾧ":"ὧι","ᾨ":"ὠι","ᾩ":"ὡι","ᾪ":"ὢι","ᾫ":"ὣι","ᾬ":"ὤι","ᾭ":"ὥι","ᾮ":"ὦι","ᾯ":"ὧι","ᾲ":"ὰι","ᾳ":"αι","ᾴ":"άι","ᾶ":"ᾶ","ᾷ":"ᾶι","ᾼ":"αι","ι":"ι","ῂ":"ὴι","ῃ":"ηι","ῄ":"ήι","ῆ":"ῆ","ῇ":"ῆι","ῌ":"ηι","ῒ":"ῒ","ΐ":"ΐ","ῖ":"ῖ","ῗ":"ῗ","ῢ":"ῢ","ΰ":"ΰ","ῤ":"ῤ","ῦ":"ῦ","ῧ":"ῧ","ῲ":"ὼι","ῳ":"ωι","ῴ":"ώι","ῶ":"ῶ","ῷ":"ῶι","ῼ":"ωι","ꭰ":"Ꭰ","ꭱ":"Ꭱ","ꭲ":"Ꭲ","ꭳ":"Ꭳ","ꭴ":"Ꭴ","ꭵ":"Ꭵ","ꭶ":"Ꭶ","ꭷ":"Ꭷ","ꭸ":"Ꭸ","ꭹ":"Ꭹ","ꭺ":"Ꭺ","ꭻ":"Ꭻ","ꭼ":"Ꭼ","ꭽ":"Ꭽ","ꭾ":"Ꭾ","ꭿ":"Ꭿ","ꮀ":"Ꮀ","ꮁ":"Ꮁ","ꮂ":"Ꮂ","ꮃ":"Ꮃ","ꮄ":"Ꮄ","ꮅ":"Ꮅ","ꮆ":"Ꮆ","ꮇ":"Ꮇ","ꮈ":"Ꮈ","ꮉ":"Ꮉ","ꮊ":"Ꮊ","ꮋ":"Ꮋ","ꮌ":"Ꮌ","ꮍ":"Ꮍ","ꮎ":"Ꮎ","ꮏ":"Ꮏ","ꮐ":"Ꮐ","ꮑ":"Ꮑ","ꮒ":"Ꮒ","ꮓ":"Ꮓ","ꮔ":"Ꮔ","ꮕ":"Ꮕ","ꮖ":"Ꮖ","ꮗ":"Ꮗ","ꮘ":"Ꮘ","ꮙ":"Ꮙ","ꮚ":"Ꮚ","ꮛ":"Ꮛ","ꮜ":"Ꮜ","ꮝ":"Ꮝ","ꮞ":"Ꮞ","ꮟ":"Ꮟ","ꮠ":"Ꮠ","ꮡ":"Ꮡ","ꮢ":"Ꮢ","ꮣ":"Ꮣ","ꮤ":"Ꮤ","ꮥ":"Ꮥ","ꮦ":"Ꮦ","ꮧ":"Ꮧ","ꮨ":"Ꮨ","ꮩ":"Ꮩ","ꮪ":"Ꮪ","ꮫ":"Ꮫ","ꮬ":"Ꮬ","ꮭ":"Ꮭ","ꮮ":"Ꮮ","ꮯ":"Ꮯ","ꮰ":"Ꮰ","ꮱ":"Ꮱ","ꮲ":"Ꮲ","ꮳ":"Ꮳ","ꮴ":"Ꮴ","ꮵ":"Ꮵ","ꮶ":"Ꮶ","ꮷ":"Ꮷ","ꮸ":"Ꮸ","ꮹ":"Ꮹ","ꮺ":"Ꮺ","ꮻ":"Ꮻ","ꮼ":"Ꮼ","ꮽ":"Ꮽ","ꮾ":"Ꮾ","ꮿ":"Ꮿ","ﬀ":"ff","ﬁ":"fi","ﬂ":"fl","ﬃ":"ffi","ﬄ":"ffl","ﬅ":"st","ﬆ":"st","ﬓ":"մն","ﬔ":"մե","ﬕ":"մի","ﬖ":"վն","ﬗ":"մխ"};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE_TYPES = ['homepage', 'newsroom', 'investor_relations', 'blog', 'rss', 'sitemap', 'social', 'publications'];
const PROFILES = ['P0', 'P1', 'P2'];
const TRACKS = ['测序与多组学', '生物医药', 'AI与模型数据', '学术进展'];
const EVENT_TYPES = ['funding', 'partnership', 'acquisition', 'licensing', 'product', 'clinical', 'regulatory', 'strategy', 'paper', 'model', 'dataset', 'other'];
const PREDICATES = ['collaborates_with', 'invests_in', 'acquires', 'licenses_from', 'co_develops', 'adopts_platform', 'co_publishes'];

export function normalizeIdentity(value) {
  return Array.from(value.normalize('NFKC'), ch => CASEFOLD[ch] ?? ch.toLowerCase()).join('').replace(/[^\p{L}\p{N}]/gu, '');
}
export function canonicalUrl(value) {
  let url;
  try { url = new URL(value); } catch { fail(422, 'Invalid source link'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) fail(422, 'Invalid source link');
  const pairs = [...url.searchParams].filter(([key]) => !key.toLowerCase().startsWith('utm_') && !['fbclid', 'gclid'].includes(key.toLowerCase()));
  pairs.sort(([ak, av], [bk, bv]) => ak === bk ? (av < bv ? -1 : av > bv ? 1 : 0) : ak < bk ? -1 : 1);
  url.search = new URLSearchParams(pairs).toString();
  url.hash = '';
  return url.href;
}
function parameters(params) {
  if (params instanceof URLSearchParams) return params;
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) if (value !== null && value !== undefined) result.set(key, String(value));
  return result;
}
function integer(params, key, fallback, min, max = Number.MAX_SAFE_INTEGER) {
  const raw = params.get(key);
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) fail(422, `${key} must be an integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(422, `${key} must be between ${min} and ${max}`);
  return value;
}
function boolean(params, key, fallback) {
  const raw = params.get(key);
  if (raw === null) return fallback;
  if (['true', '1', 'yes', 'on', 't', 'y'].includes(raw.toLowerCase())) return true;
  if (['false', '0', 'no', 'off', 'f', 'n'].includes(raw.toLowerCase())) return false;
  fail(422, `${key} must be a boolean`);
}
function uuid(value, key = 'id') {
  if (typeof value !== 'string') fail(422, `${key} must be a UUID`);
  const stripped = value.replace(/^urn:uuid:/i, '').replace(/^\{(.*)\}$/, '$1');
  const expanded = /^[0-9a-f]{32}$/i.test(stripped) ? stripped.replace(/^(........)(....)(....)(....)(............)$/, '$1-$2-$3-$4-$5') : stripped;
  if (!UUID.test(expanded)) fail(422, `${key} must be a UUID`);
  return expanded.toLowerCase();
}
function textField(body, key, min = 0, max = Infinity, fallback) {
  const value = body[key] === undefined ? fallback : body[key];
  if (typeof value !== 'string' || Array.from(value).length < min || Array.from(value).length > max) fail(422, `Invalid ${key}`);
  return value;
}
function choice(body, key, values, fallback) {
  const value = body[key] === undefined ? fallback : body[key];
  if (!values.includes(value)) fail(422, `Invalid ${key}`);
  return value;
}
function bodyBoolean(body, key, fallback = false) {
  const value = body[key] === undefined ? fallback : body[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string' || value === 0 || value === 1) return boolean(new URLSearchParams({ [key]: String(value) }), key, fallback);
  fail(422, `Invalid ${key}`);
}
function listField(body, key, max, fallback) {
  const value = body[key] === undefined ? fallback : body[key];
  if (!Array.isArray(value) || value.length > max) fail(422, `Invalid ${key}`);
  return value;
}
function dateOnly(value, key) {
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(422, `Invalid ${key}`);
  const d = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) fail(422, `Invalid ${key}`);
  return value;
}
function datetime(value, key) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(value)) fail(422, `Invalid ${key}`);
  dateOnly(value.slice(0, 10), key);
  const d = new Date(value.length === 10 ? value + 'T00:00:00Z' : /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : value.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(d.getTime())) fail(422, `Invalid ${key}`);
  return d.toISOString();
}
function conditions() {
  const args = [], clauses = [];
  return { args, clauses, p(value) { args.push(value); return '$' + args.length; }, get where() { return clauses.join(' AND ') || 'true'; } };
}
export function regionClause(region, alias = 'c') {
  const groups = {
    cn: `${alias}.region LIKE '中国%' AND ${alias}.region NOT LIKE '%/%' AND ${alias}.region NOT LIKE '%香港%'`,
    hk: `${alias}.region LIKE '%香港%' AND ${alias}.region NOT LIKE '%/%'`,
    global: `${alias}.region NOT LIKE '中国%' AND ${alias}.region NOT LIKE '%/%'`,
    cross: `${alias}.region LIKE '%/%'`,
  };
  if (!groups[region]) fail(422, '未知地区分类');
  return groups[region];
}
function dates(c, days, start, end, field) {
  if (start && end && start > end) fail(422, '开始日期不能晚于结束日期');
  if (start) c.clauses.push(`${field} >= ${c.p(start)}::date`);
  else if (days) c.clauses.push(`${field} >= now()-make_interval(days=>${c.p(days)}::integer)`);
  if (end) c.clauses.push(`${field} < ${c.p(end)}::date+interval '1 day'`);
}
function topicConditions(params, c, payload, defaultFocused = false) {
  const topic = params.get('topic') || params.get('topic_id') || '';
  if (topic && !TOPICS.some(item => item.id === topic)) fail(422, '未知主题');
  const scope = params.get('scope');
  if (scope && !['all', 'focused'].includes(scope)) fail(422, '未知范围');
  const focused = scope === 'all' ? false : scope === 'focused' ? true : boolean(params, 'focused', defaultFocused);
  if (topic) c.clauses.push(`COALESCE(${payload}->'classification'->'topic_ids','[]'::jsonb) ? ${c.p(topic)}`);
  else if (focused) c.clauses.push(`jsonb_array_length(CASE WHEN jsonb_typeof(${payload}->'classification'->'topic_ids')='array' THEN ${payload}->'classification'->'topic_ids' ELSE '[]'::jsonb END)>0`);
  return { topic, focused };
}
function eventConditions(params) {
  const c = conditions();
  dates(c, integer(params, 'days', 30, 0, 3660), dateOnly(params.get('start'), 'start'), dateOnly(params.get('end'), 'end'), 'COALESCE(e.occurred_at,e.published_at)');
  const q = params.get('q') || '';
  if (q) c.clauses.push(`(e.title ILIKE ${c.p('%' + q + '%')} OR e.summary ILIKE ${c.p('%' + q + '%')})`);
  for (const key of ['track', 'event_type']) if (params.get(key)) c.clauses.push(`e.${key}=${c.p(params.get(key))}`);
  if (boolean(params, 'picked', false)) c.clauses.push('e.editor_pick');
  const company = params.get('company'), region = params.get('region');
  if (company || region) {
    let sub = "ee.event_id=e.id AND ee.entity_type='company'";
    if (company) sub += ` AND c.slug=${c.p(company)}`;
    if (region) sub += ` AND (${regionClause(region)})`;
    c.clauses.push(`EXISTS(SELECT 1 FROM event_entities ee JOIN companies c ON c.id=ee.entity_id WHERE ${sub})`);
  }
  const topics = conditions();
  topicConditions(params, topics, 'ri.raw_payload');
  if (topics.clauses.length) {
    const offset = c.args.length;
    const clause = topics.where.replace(/\$(\d+)/g, (_, n) => '$' + (Number(n) + offset));
    c.args.push(...topics.args);
    c.clauses.push(`EXISTS(SELECT 1 FROM event_evidence ev JOIN raw_items ri ON ri.id=ev.raw_item_id WHERE ev.event_id=e.id AND ${clause})`);
  }
  return c;
}
const EVENT_FIELDS = `e.*,COALESCE(e.occurred_at,e.published_at) AS display_date,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'slug',c.slug,'track',c.track,'name',COALESCE(NULLIF(c.name_zh,''),c.name_en)))
 FROM event_entities ee JOIN companies c ON c.id=ee.entity_id WHERE ee.event_id=e.id AND ee.entity_type='company'),'[]') AS companies,
 COALESCE((SELECT jsonb_agg(DISTINCT v.academic) FROM public_evidence v WHERE v.event_id=e.id AND v.academic IS NOT NULL),'[]') AS academic`;
function companyTopics(alias, parameter) {
  return `COALESCE((SELECT jsonb_agg(DISTINCT ti.id ORDER BY ti.id) FROM public_records pr
    CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(pr.raw_payload->'classification'->'topic_ids')='array' THEN pr.raw_payload->'classification'->'topic_ids' ELSE '[]'::jsonb END) ti(id)
    WHERE pr.company_id=${alias}.id AND ti.id=ANY(${parameter}::text[])),'[]')`;
}
async function first(sql, query, args = []) { return (await sql.query(query, args))[0]; }
const count = rows => Number(rows[0]?.n || 0);
function counts(row, keys) { for (const key of keys) if (row[key] !== null && row[key] !== undefined) row[key] = Number(row[key]); return row; }
const eventNumbers = row => counts(row, ['evidence_count', 'confidence']);

/** Shared public read model for the browser and MCP. Never bypass public views. */
export async function apiRead(path, input, sql) {
  const params = parameters(input);
  if (path === '/api/topics') return { items: TOPICS };
  if (path === '/health') return { database: (await first(sql, 'SELECT 1 AS ok')).ok, version: '2.0.0' };
  if (path === '/api/overview') {
    const row = await first(sql, `SELECT
     (SELECT count(*) FROM companies WHERE status='active' AND include_in_company_wall) AS companies,
     (SELECT count(*) FROM public_events) AS events,
     (SELECT count(*) FROM public_resources r WHERE jsonb_array_length(CASE WHEN jsonb_typeof(r.raw_payload->'classification'->'topic_ids')='array' THEN r.raw_payload->'classification'->'topic_ids' ELSE '[]'::jsonb END)>0) AS records,
     (SELECT count(*) FROM public_records) AS all_records,
     (SELECT count(*) FROM sources WHERE verified AND enabled AND adapter<>'unsupported') AS connected_sources,
     (SELECT count(*) FROM sources WHERE verified AND enabled AND config->>'cloud_runtime_enabled'='true' AND adapter IN ('europepmc','pubmed','biorxiv','rss')) AS cloud_connected_sources,
     (SELECT count(*) FROM sources) AS sources,
     (SELECT max(last_success_at) FROM sources WHERE verified) AS last_success_at,
     (SELECT count(*) FROM relations r JOIN public_events e ON e.id=r.event_id) AS relations,
     (SELECT max(scheduled_at) FROM scheduler_runs WHERE status='succeeded' AND trigger_kind='cron') AS scheduler_last_dispatch_at,
     (SELECT jsonb_build_object('scheduled_at',sr.scheduled_at,'trigger_kind',sr.trigger_kind,'started_at',sr.started_at,'finished_at',sr.finished_at,'status',sr.status,'dispatched_count',sr.dispatched_count,'dispatch_attempts',sr.dispatch_attempts) FROM scheduler_runs sr WHERE sr.trigger_kind='cron' ORDER BY scheduled_at DESC LIMIT 1) AS scheduler_latest_run,
     COALESCE((SELECT jsonb_agg(t) FROM (SELECT track,count(*)::integer AS count FROM companies WHERE status='active' AND include_in_company_wall GROUP BY track ORDER BY track) t),'[]') AS tracks`);
    return { ...counts(row, ['companies', 'events', 'records', 'all_records', 'connected_sources', 'cloud_connected_sources', 'sources', 'relations']), cadence_hours: 1 };
  }
  if (path === '/api/companies') {
    const c = conditions();
    if (!boolean(params, 'history', false)) c.clauses.push("c.include_in_company_wall AND c.status='active'");
    const q = params.get('q') || '';
    if (q) c.clauses.push(`(c.name_zh ILIKE ${c.p('%' + q + '%')} OR c.name_en ILIKE ${c.p('%' + q + '%')} OR EXISTS(SELECT 1 FROM company_aliases a WHERE a.company_id=c.id AND a.alias ILIKE ${c.p('%' + q + '%')}))`);
    if (params.get('track')) c.clauses.push(`c.track=${c.p(params.get('track'))}`);
    if (params.get('region_group')) c.clauses.push('(' + regionClause(params.get('region_group')) + ')');
    if (params.get('region')) c.clauses.push(`c.region ILIKE ${c.p('%' + params.get('region') + '%')}`);
    const topic = params.get('topic') || params.get('topic_id');
    if (topic) {
      if (!TOPICS.some(item => item.id === topic)) fail(422, '未知主题');
      c.clauses.push(`EXISTS(SELECT 1 FROM public_records pr WHERE pr.company_id=c.id AND COALESCE(pr.raw_payload->'classification'->'topic_ids','[]'::jsonb) ? ${c.p(topic)})`);
    }
    const limit = integer(params, 'limit', 150, 1, 200), offset = integer(params, 'offset', 0, 0);
    const [total, rows] = await Promise.all([
      sql.query('SELECT count(*) n FROM companies c WHERE ' + c.where, c.args),
      sql.query(`SELECT c.id,c.slug,c.name_zh,c.name_en,c.track,c.region,c.focus,c.official_website,c.status,c.priority,${companyTopics('c', '$' + (c.args.length + 4))} AS topic_ids,
       (SELECT count(DISTINCT e.id) FROM public_events e JOIN event_entities ee ON ee.event_id=e.id WHERE ee.entity_id=c.id AND ee.entity_type='company' AND e.review_status='approved' AND COALESCE(e.occurred_at,e.published_at)>=now()-interval '30 days') AS events_30d,
       (SELECT e.title FROM public_events e JOIN event_entities ee ON ee.event_id=e.id WHERE ee.entity_id=c.id AND ee.entity_type='company' AND e.review_status='approved' ORDER BY COALESCE(e.occurred_at,e.published_at) DESC NULLS LAST LIMIT 1) AS latest_event
       FROM companies c WHERE ${c.where} ORDER BY CASE WHEN c.region LIKE $${c.args.length + 1} THEN 0 ELSE 1 END,c.name_en LIMIT $${c.args.length + 2} OFFSET $${c.args.length + 3}`, [...c.args, '中国%', limit, offset, TOPICS.map(item => item.id)]),
    ]);
    return { total: count(total), items: rows.map(r => counts(r, ['events_30d'])), offset, limit };
  }
  if (path === '/api/identity/resolve') {
    const name = params.get('name');
    if (!name || Array.from(name).length > 200) fail(422, 'Invalid name');
    const candidates = await sql.query(`SELECT c.id,c.slug,c.name_zh,c.name_en,c.status,c.parent_company_id,a.alias_type,a.verification_status
      FROM company_aliases a JOIN companies c ON c.id=a.company_id WHERE a.normalized=$1 ORDER BY c.slug`, [normalizeIdentity(name)]);
    return { query: name, status: candidates.length === 1 ? 'matched' : candidates.length ? 'ambiguous' : 'unresolved', candidates };
  }
  const companyMatch = path.match(/^\/api\/companies\/([^/]+)$/);
  if (companyMatch) {
    const row = await first(sql, `SELECT c.*,${companyTopics('c', '$2')} AS topic_ids FROM companies c WHERE c.slug=$1`, [decodeURIComponent(companyMatch[1]), TOPICS.map(item => item.id)]);
    if (!row) fail(404, 'Company not found');
    delete row.seed_payload;
    [row.alias_records, row.identity_links, row.sources, row.events, row.relations] = await Promise.all([
      sql.query('SELECT alias,alias_type,verification_status,valid_from,valid_to FROM company_aliases WHERE company_id=$1', [row.id]),
      sql.query('SELECT * FROM company_identity_links WHERE company_id=$1', [row.id]),
      sql.query(`SELECT id,name,source_type,url,platform,verified,verification_status,enabled,adapter,last_success_at,next_poll_at,consecutive_failures,config->>'integration_status' AS integration_status,COALESCE(config->>'cloud_runtime_enabled'='true',false) AS cloud_runtime_enabled FROM sources WHERE company_id=$1 AND (source_type<>'social' OR verified) ORDER BY source_type,url`, [row.id]),
      sql.query("SELECT DISTINCT e.* FROM public_events e JOIN event_entities ee ON ee.event_id=e.id WHERE ee.entity_id=$1 AND ee.entity_type='company' AND e.review_status='approved' ORDER BY e.published_at DESC NULLS LAST LIMIT 100", [row.id]),
      sql.query("SELECT r.* FROM relations r JOIN public_events e ON e.id=r.event_id WHERE (r.subject_id=$1 OR r.object_id=$2) AND e.review_status='approved' AND EXISTS(SELECT 1 FROM event_evidence v WHERE v.event_id=e.id)", [row.id, row.id]),
    ]);
    row.events = row.events.map(eventNumbers);
    row.relations = row.relations.map(r => counts(r, ['confidence']));
    return row;
  }
  if (path === '/api/events') {
    const c = eventConditions(params), limit = integer(params, 'limit', 60, 1, 200), offset = integer(params, 'offset', 0, 0);
    const [total, items] = await Promise.all([
      sql.query('SELECT count(*) n FROM public_events e WHERE ' + c.where, c.args),
      sql.query(`SELECT ${EVENT_FIELDS} FROM public_events e WHERE ${c.where} ORDER BY display_date DESC NULLS LAST,e.id LIMIT $${c.args.length + 1} OFFSET $${c.args.length + 2}`, [...c.args, limit, offset]),
    ]);
    return { total: count(total), items: items.map(eventNumbers), limit, offset };
  }
  const eventMatch = path.match(/^\/api\/events\/([^/]+)$/);
  if (eventMatch) {
    const id = uuid(eventMatch[1], 'event_id');
    const event = await first(sql, `SELECT ${EVENT_FIELDS} FROM public_events e WHERE e.id=$1`, [id]);
    if (!event) fail(404, '事件不存在或尚未发布');
    [event.evidence, event.relations] = await Promise.all([sql.query('SELECT * FROM public_evidence WHERE event_id=$1', [id]), sql.query('SELECT * FROM relations WHERE event_id=$1', [id])]);
    return eventNumbers(event);
  }
  if (path === '/api/graph') {
    const c = eventConditions(params);
    const edges = await sql.query(`SELECT r.id,r.subject_id,r.object_id,r.predicate,r.event_id,e.title,e.evidence_count,COALESCE(e.occurred_at,e.published_at) AS display_date
      FROM relations r JOIN public_events e ON e.id=r.event_id JOIN companies s ON s.id=r.subject_id JOIN companies o ON o.id=r.object_id
      WHERE r.subject_type='company' AND r.object_type='company' AND ${c.where} ORDER BY display_date DESC NULLS LAST,r.id LIMIT 300`, c.args);
    const ids = [...new Set(edges.flatMap(e => [e.subject_id, e.object_id]))];
    const nodes = ids.length ? await sql.query('SELECT id,slug,name_zh,name_en,track,region FROM companies WHERE id=ANY($1::uuid[])', [ids]) : [];
    return { nodes, edges: edges.map(row => counts(row, ['evidence_count'])), limit: 300 };
  }
  if (path === '/api/records') {
    const c = conditions();
    // Future journal issue dates must not keep old records at the top of recent lists.
    // Preserve the source date in the response and bound listing time by collection.
    const effectiveTime = 'LEAST(COALESCE(r.published_at,r.fetched_at),r.fetched_at)';
    dates(c, integer(params, 'days', 30, 0, 3660), null, null, effectiveTime);
    const academic = boolean(params, 'academic', null);
    if (academic !== null) c.clauses.push("(r.registry_key IN ('pubmed-eutils','biorxiv','medrxiv','europe-pmc','crossref')) IS " + (academic ? 'TRUE' : 'NOT TRUE'));
    const q = params.get('q') || '';
    if (q) c.clauses.push(`(r.title ILIKE ${c.p('%' + q + '%')} OR r.content_text ILIKE ${c.p('%' + q + '%')})`);
    if (params.get('company')) c.clauses.push(`r.company_slug=${c.p(params.get('company'))}`);
    if (params.get('source')) c.clauses.push(`r.registry_key=${c.p(params.get('source') === 'pubmed' ? 'pubmed-eutils' : params.get('source'))}`);
    const focus = topicConditions(params, c, 'r.raw_payload', true);
    const limit = integer(params, 'limit', 40, 1, 100), offset = integer(params, 'offset', 0, 0);
    const [total, items] = await Promise.all([
      sql.query('SELECT count(*) n FROM public_resources r WHERE ' + c.where, c.args),
      sql.query(`SELECT r.id,r.title,left(r.content_text,400) AS excerpt,r.canonical_url,r.published_at,r.fetched_at,r.source_name,r.source_type,r.company_slug,r.company_name,r.company_name_en,r.registry_key,r.external_id,
        r.raw_payload->'academic' AS academic,r.raw_payload->'classification' AS classification FROM public_resources r WHERE ${c.where}
        ORDER BY ${effectiveTime} DESC,r.id LIMIT $${c.args.length + 1} OFFSET $${c.args.length + 2}`, [...c.args, limit, offset]),
    ]);
    return { total: count(total), items, limit, offset, ...focus };
  }
  const recordMatch = path.match(/^\/api\/records\/([^/]+)$/);
  if (recordMatch) {
    const row = await first(sql, `SELECT r.id,r.title,r.content_text,r.canonical_url,r.published_at,r.fetched_at,r.source_name,r.source_type,r.company_slug,r.company_name,r.registry_key,r.external_id,r.content_hash,
      r.raw_payload->'academic' AS academic,r.raw_payload->'classification' AS classification FROM public_records r WHERE r.id=$1`, [uuid(recordMatch[1], 'record_id')]);
    if (!row) fail(404, '原文不存在或来源尚未验证');
    return row;
  }
  if (path === '/api/sources') {
    const rows = await sql.query(`SELECT s.id,s.name,s.registry_key,s.source_type,s.url,s.verified,s.verification_status,s.enabled,s.adapter,s.last_success_at,s.next_poll_at,s.consecutive_failures,
      c.slug AS company_slug,c.name_zh,c.name_en,p.ttl_hours,COALESCE(s.config->>'cloud_runtime_enabled'='true',false) AS cloud_runtime_enabled,(SELECT count(*) FROM raw_items r WHERE r.source_id=s.id) AS raw_count
      FROM sources s LEFT JOIN companies c ON c.id=s.company_id JOIN polling_profiles p ON p.id=s.poll_profile
      WHERE s.source_type<>'social' OR s.verified ORDER BY s.last_success_at DESC NULLS LAST,s.name`);
    return rows.map(row => counts(row, ['raw_count']));
  }
  return null;
}

async function digest(value) { return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))); }
async function admin(request, env) {
  const expected = env.ADMIN_TOKEN || '';
  if (expected.length < 32) fail(503, 'Admin authentication is not configured');
  const header = request.headers.get('authorization') || '';
  const actual = header.startsWith('Bearer ') ? header.slice(7) : header;
  const [a, b] = await Promise.all([digest(expected), digest(actual)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  if (difference) fail(401, 'Admin token required');
  return 'admin:' + Array.from(a, v => v.toString(16).padStart(2, '0')).join('').slice(0, 12);
}
async function bodyJson(request) {
  if (Number(request.headers.get('content-length') || 0) > 1_000_000) fail(413, 'Request body too large');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 1_000_000) fail(413, 'Request body too large');
  let body;
  try { body = JSON.parse(raw); } catch { fail(422, 'Invalid JSON body'); }
  if (!body || Array.isArray(body) || typeof body !== 'object') fail(422, 'Invalid JSON body');
  return body;
}
async function audit(sql, actor, action, kind, id, before = null, after = null) {
  await sql.query('INSERT INTO audit_log(actor,action,entity_type,entity_id,before_value,after_value) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)', [actor, action, kind, id, before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after)]);
}
async function syncAliases(sql, id, zh, en, aliases) {
  const values = [[zh, 'name_zh'], [en, 'name_en'], ...aliases.map(value => [value, 'alias'])].filter(([value]) => value && normalizeIdentity(value));
  await sql.query('DELETE FROM company_aliases WHERE company_id=$1 AND NOT(normalized=ANY($2::text[]))', [id, values.map(([value]) => normalizeIdentity(value))]);
  for (const [value, kind] of values) await sql.query(`INSERT INTO company_aliases(company_id,alias,normalized,alias_type,verification_status)
    VALUES ($1,$2,$3,$4,'manual_reviewed') ON CONFLICT(company_id,normalized) DO NOTHING`, [id, value, normalizeIdentity(value), kind]);
}
async function adminApi(request, path, params, env, sql) {
  const actor = await admin(request, env), method = request.method;
  if (path === '/api/admin/sources' && method === 'GET') {
    const status = params.get('status') || '', social = boolean(params, 'social', false);
    return sql.query(`SELECT s.*,c.name_zh,c.name_en FROM sources s LEFT JOIN companies c ON c.id=s.company_id
      WHERE ($1='' OR s.verification_status=$2) AND (NOT $3 OR s.source_type='social') ORDER BY s.consecutive_failures DESC,s.created_at DESC LIMIT 1000`, [status, status, social]);
  }
  if (path === '/api/admin/sources' && method === 'POST') {
    const body = await bodyJson(request);
    const data = { company_id: body.company_id === null || body.company_id === undefined ? null : uuid(body.company_id, 'company_id'), name: textField(body, 'name', 1, 200), url: textField(body, 'url', 0, 2000), source_type: choice(body, 'source_type', SOURCE_TYPES), platform: body.platform ?? null, poll_profile: choice(body, 'poll_profile', PROFILES, 'P1') };
    if (data.platform !== null && typeof data.platform !== 'string') fail(422, 'Invalid platform');
    const url = canonicalUrl(data.url), adapter = data.source_type === 'social' ? 'unsupported' : data.source_type === 'homepage' ? 'discover' : data.source_type === 'rss' ? 'rss' : data.source_type === 'sitemap' ? 'sitemap' : 'html';
    return sql.transaction(async tx => {
      if (data.company_id && !(await first(tx, 'SELECT id FROM companies WHERE id=$1', [data.company_id]))) fail(404, 'Company not found');
      const row = await first(tx, `INSERT INTO sources(id,company_id,name,url,source_type,platform,poll_profile,adapter)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(company_id,url) DO UPDATE SET url=EXCLUDED.url RETURNING *`, [crypto.randomUUID(), data.company_id, data.name, url, data.source_type, data.platform, data.poll_profile, adapter]);
      await audit(tx, actor, 'source_candidate', 'source', row.id, null, data);
      return row;
    });
  }
  const reviewMatch = path.match(/^\/api\/admin\/sources\/([^/]+)\/review$/);
  if (reviewMatch && method === 'POST') {
    const id = uuid(reviewMatch[1], 'source_id'), body = await bodyJson(request);
    const data = { decision: choice(body, 'decision', ['verified', 'rejected', 'pending']), method: choice(body, 'method', ['official_backlink', 'platform_badge', 'manual_review']), evidence_url: textField(body, 'evidence_url', 8, 2000), evidence_text: textField(body, 'evidence_text', 10, 5000), enable_ingestion: bodyBoolean(body, 'enable_ingestion') };
    canonicalUrl(data.evidence_url);
    return sql.transaction(async tx => {
      // Queue claim locks the job before its source. Use the same order to avoid
      // a revoke racing a queued claim and deadlocking the two transactions.
      await tx.query("SELECT id FROM ingestion_jobs WHERE source_id=$1 AND status IN ('queued','retry') FOR UPDATE", [id]);
      const source = await first(tx, 'SELECT * FROM sources WHERE id=$1 FOR UPDATE', [id]);
      if (!source) fail(404, 'Source not found');
      if (data.enable_ingestion && (data.decision !== 'verified' || source.adapter === 'unsupported')) fail(422, 'Verification and a supported adapter are required to enable ingestion');
      if (data.method === 'official_backlink' && source.config?.provenance?.discovered_on !== data.evidence_url) fail(422, 'Evidence URL must match the stored official backlink provenance; otherwise use manual review');
      await tx.query('INSERT INTO verification_reviews(id,source_id,decision,method,evidence_url,evidence_text,reviewer) VALUES ($1,$2,$3,$4,$5,$6,$7)', [crypto.randomUUID(), id, data.decision, data.method, data.evidence_url, data.evidence_text, actor]);
      await tx.query('UPDATE sources SET verified=$1,verification_status=$2,verified_at=CASE WHEN $3 THEN now() END,enabled=$4,next_poll_at=now() WHERE id=$5', [data.decision === 'verified', data.decision, data.decision === 'verified', data.enable_ingestion, id]);
      if (!data.enable_ingestion) await tx.query("UPDATE ingestion_jobs SET status='dead',finished_at=now(),last_error='Source disabled by reviewer' WHERE source_id=$1 AND status IN ('queued','retry')", [id]);
      await audit(tx, actor, 'review', 'source', id, source, data);
      return { status: data.decision, enabled: data.enable_ingestion };
    });
  }
  const editMatch = path.match(/^\/api\/admin\/companies\/([^/]+)$/);
  if (editMatch && method === 'PUT') {
    const body = await bodyJson(request);
    const data = { name_zh: textField(body, 'name_zh', 0, 200), name_en: textField(body, 'name_en', 1, 200), aliases: listField(body, 'aliases', 100), official_website: textField(body, 'official_website'), priority: choice(body, 'priority', PROFILES), notes: textField(body, 'notes', 0, 10000) };
    const url = canonicalUrl(data.official_website);
    if (data.aliases.some(alias => typeof alias !== 'string' || !alias.trim() || Array.from(alias).length > 200)) fail(422, 'Invalid alias');
    return sql.transaction(async tx => {
      const before = await first(tx, 'SELECT * FROM companies WHERE slug=$1 FOR UPDATE', [decodeURIComponent(editMatch[1])]);
      if (!before) fail(404, 'Company not found');
      const priorNames = ['name_zh', 'name_en'].map(key => before[key] && before[key] !== data[key] ? before[key] : null).filter(Boolean);
      const applied = [...new Set([...data.aliases, ...priorNames])];
      await tx.query('UPDATE companies SET name_zh=$1,name_en=$2,aliases=$3::jsonb,official_website=$4,priority=$5,notes=$6,updated_at=now() WHERE id=$7', [data.name_zh, data.name_en, JSON.stringify(applied), url, data.priority, data.notes, before.id]);
      await tx.query('UPDATE sources SET poll_profile=$1 WHERE company_id=$2 AND poll_profile=$3', [data.priority, before.id, before.priority]);
      await syncAliases(tx, before.id, data.name_zh, data.name_en, applied);
      for (const name of priorNames) await tx.query("UPDATE company_aliases SET alias_type='historical_brand',verification_status='manual_reviewed' WHERE company_id=$1 AND alias=$2", [before.id, name]);
      if (!before.official_website || canonicalUrl(before.official_website) !== url) {
        await tx.query("UPDATE sources SET enabled=false,verified=false,verification_status='pending',verified_at=NULL WHERE company_id=$1", [before.id]);
        await tx.query("INSERT INTO sources(id,company_id,name,source_type,url,poll_profile,adapter) VALUES ($1,$2,$3,'homepage',$4,$5,'discover') ON CONFLICT DO NOTHING", [crypto.randomUUID(), before.id, data.name_en + ' homepage', url, data.priority]);
      }
      await audit(tx, actor, 'edit', 'company', before.id, before, { ...data, aliases: applied });
      return { status: 'updated' };
    });
  }
  if (path === '/api/admin/jobs' && method === 'GET') return sql.query(`SELECT j.*,s.name,(SELECT row_to_json(a) FROM ingestion_attempts a WHERE a.job_id=j.id ORDER BY attempt DESC LIMIT 1) AS last_attempt
    FROM ingestion_jobs j JOIN sources s ON s.id=j.source_id ORDER BY j.created_at DESC LIMIT 100`);
  const reviewsMatch = path.match(/^\/api\/admin\/sources\/([^/]+)\/reviews$/);
  if (reviewsMatch && method === 'GET') return sql.query('SELECT * FROM verification_reviews WHERE source_id=$1 ORDER BY created_at DESC', [uuid(reviewsMatch[1], 'source_id')]);
  if (path === '/api/admin/records' && method === 'GET') return (await sql.query(`SELECT r.*,s.name AS source_name,s.verified,s.company_id,(SELECT count(*) FROM event_evidence v WHERE v.raw_item_id=r.id) AS event_count
    FROM raw_items r JOIN sources s ON s.id=r.source_id ORDER BY r.fetched_at DESC,r.id LIMIT $1 OFFSET $2`, [integer(params, 'limit', 100, 1, 200), integer(params, 'offset', 0, 0)])).map(row => counts(row, ['event_count']));
  if (path === '/api/admin/events' && method === 'POST') {
    const body = await bodyJson(request);
    const data = { request_id: uuid(body.request_id, 'request_id'), raw_item_id: uuid(body.raw_item_id, 'raw_item_id'), title: textField(body, 'title', 5, 500), summary: textField(body, 'summary', 10, 2000), evidence_text: textField(body, 'evidence_text', 20, 10000), track: choice(body, 'track', TRACKS), event_type: choice(body, 'event_type', EVENT_TYPES), occurred_at: datetime(body.occurred_at, 'occurred_at'), company_ids: listField(body, 'company_ids', 20, []).map(id => uuid(id, 'company_id')), relations: listField(body, 'relations', 20, []).map(edge => {
      if (!edge || typeof edge !== 'object') fail(422, 'Invalid relation');
      return { subject_id: uuid(edge.subject_id, 'subject_id'), object_id: uuid(edge.object_id, 'object_id'), predicate: choice(edge, 'predicate', PREDICATES), evidence_text: textField(edge, 'evidence_text', 10, 10000) };
    }), editor_pick: bodyBoolean(body, 'editor_pick'), amount: textField(body, 'amount', 0, 100, ''), stage: textField(body, 'stage', 0, 100, '') };
    return sql.transaction(async tx => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [data.request_id]);
      const existing = await first(tx, 'SELECT id FROM events WHERE request_id=$1', [data.request_id]);
      if (existing) return { id: existing.id, status: 'already_published' };
      const raw = await first(tx, 'SELECT r.*,s.verified FROM raw_items r JOIN sources s ON s.id=r.source_id WHERE r.id=$1 FOR SHARE OF s', [data.raw_item_id]);
      if (!raw) fail(404, '找不到原始记录');
      if (!raw.verified) fail(422, '请先验证来源归属');
      const content = raw.content_text || '', start = content.indexOf(data.evidence_text);
      if (start < 0) fail(422, '证据句必须完整摘自已保存的原文正文');
      const ids = [...new Set(data.company_ids)], found = ids.length ? await tx.query('SELECT id FROM companies WHERE id=ANY($1::uuid[])', [ids]) : [];
      if (new Set(found.map(row => row.id)).size !== ids.length) fail(422, '公司实体不存在');
      for (const edge of data.relations) {
        if (edge.subject_id === edge.object_id || !ids.includes(edge.subject_id) || !ids.includes(edge.object_id)) fail(422, '关系两端必须是本事件中不同的公司');
        if (!data.evidence_text.includes(edge.evidence_text)) fail(422, '关系必须有属于该事件证据的原文句子');
      }
      const id = crypto.randomUUID();
      await tx.query(`INSERT INTO events(id,request_id,event_type,title,summary,occurred_at,published_at,confidence,review_status,editor_pick,extraction_version,track,details)
        VALUES ($1,$2,$3,$4,$5,$6,$7,0.9,'approved',$8,'manual-review-v1',$9,$10::jsonb)`, [id, data.request_id, data.event_type, data.title, data.summary, data.occurred_at, raw.published_at, data.editor_pick, data.track, JSON.stringify({ amount: data.amount, stage: data.stage, reviewed_by: actor })]);
      const codepointStart = Array.from(content.slice(0, start)).length;
      await tx.query('INSERT INTO event_evidence(event_id,raw_item_id,evidence_text,evidence_start,evidence_end) VALUES ($1,$2,$3,$4,$5)', [id, raw.id, data.evidence_text, codepointStart, codepointStart + Array.from(data.evidence_text).length]);
      for (const companyId of ids) await tx.query("INSERT INTO event_entities VALUES ($1,'company',$2,'participant')", [id, companyId]);
      for (const edge of data.relations) await tx.query(`INSERT INTO relations(id,subject_type,subject_id,predicate,object_type,object_id,event_id,confidence,valid_from)
        VALUES ($1,'company',$2,$3,'company',$4,$5,0.9,$6) ON CONFLICT DO NOTHING`, [crypto.randomUUID(), edge.subject_id, edge.predicate, edge.object_id, id, data.occurred_at]);
      await audit(tx, actor, 'publish_event', 'event', id, null, data);
      return { id, status: 'published' };
    });
  }
  const unpublishMatch = path.match(/^\/api\/admin\/events\/([^/]+)\/unpublish$/);
  if (unpublishMatch && method === 'POST') {
    const id = uuid(unpublishMatch[1], 'event_id');
    return sql.transaction(async tx => {
      if (!(await first(tx, "UPDATE events SET review_status='pending' WHERE id=$1 RETURNING id", [id]))) fail(404, '找不到事件');
      await audit(tx, actor, 'unpublish_event', 'event', id);
      return { status: 'unpublished' };
    });
  }
  fail(404, 'Not Found');
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? String(v) : v), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
export async function handleApi(request, env, sql) {
  const url = new URL(request.url), path = url.pathname;
  if (!path.startsWith('/api/') && path !== '/health') return null;
  try {
    if (path.startsWith('/api/admin/')) return json(await adminApi(request, path, url.searchParams, env, sql));
    if (request.method !== 'GET') fail(405, 'Method Not Allowed');
    const result = await apiRead(path, url.searchParams, sql);
    return result === null ? json({ detail: 'Not Found' }, 404) : json(result);
  } catch (error) {
    if (error instanceof ApiError) return json({ detail: error.detail }, error.status);
    if (error instanceof URIError) return json({ detail: 'Invalid path encoding' }, 422);
    // Connection strings, backend errors and submitted tokens never enter a response.
    return json({ detail: 'Database unavailable' }, 503);
  }
}
