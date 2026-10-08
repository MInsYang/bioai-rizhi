// Called only after the parent Worker verifies the administrator credential.
// This endpoint proposes or tracks editorial work; it never publishes an event.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 4096;
const json = (body, status = 200) => Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});
class CandidateError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function fail(status, message) { throw new CandidateError(status, message); }
function uuid(value, label) {
  if (typeof value !== 'string' || !UUID.test(value)) fail(422, `Invalid ${label}`);
  return value.toLowerCase();
}
async function bodyJson(request) {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) fail(413, 'Request body too large');
  if (!request.body) return {};
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') fail(415, 'JSON content type required');
  const reader = request.body.getReader(), chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const {value, done} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        fail(413, 'Request body too large');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!bytes) return {};
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  let body;
  try { body = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(buffer)); }
  catch { fail(400, 'Invalid JSON'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(422, 'JSON object required');
  return body;
}
async function actor(request) {
  const credential = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(credential)));
  return 'admin:' + Array.from(digest, value => value.toString(16).padStart(2, '0')).join('').slice(0, 12);
}
async function audit(tx, actorId, action, id, before, after) {
  await tx.query(`INSERT INTO audit_log(actor,action,entity_type,entity_id,before_value,after_value)
    VALUES ($1,$2,'industry_candidate',$3,$4::jsonb,$5::jsonb)`,
  [actorId, action, id, before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after)]);
}

export async function candidateApi(request, sql) {
  try {
    const path = new URL(request.url).pathname;
    if (path === '/api/admin/candidates') {
      if (request.method !== 'GET') return json({detail: 'Method not allowed'}, 405);
      const rows = await sql.query(`SELECT r.id,c.id AS candidate_id,c.suggested_type,
        r.title,r.content_text,r.canonical_url,r.published_at,s.name AS source_name,
        s.company_id,s.verified,(SELECT count(*) FROM event_evidence e WHERE e.raw_item_id=r.id) AS event_count
        FROM industry_candidates c JOIN public_records r ON r.id=c.raw_item_id JOIN sources s ON s.id=r.source_id
        WHERE c.status='pending' AND s.enabled AND s.verified
        ORDER BY LEAST(COALESCE(r.published_at,r.fetched_at),r.fetched_at) DESC,c.id LIMIT 100`);
      return json(rows);
    }
    if (path === '/api/admin/candidates/generate') {
      if (request.method !== 'POST') return json({detail: 'Method not allowed'}, 405);
      const body = await bodyJson(request);
      if (Object.keys(body).length) fail(422, 'This action accepts an empty JSON object');
      const actorId = await actor(request);
      const result = await sql.transaction(async tx => {
        const result = (await tx.query('SELECT propose_industry_candidates() AS proposed'))[0];
        await audit(tx, actorId, 'generate_candidates', null, null, result);
        return result;
      });
      return json(result);
    }
    const match = path.match(/^\/api\/admin\/candidates\/([^/]+)\/(dismiss|complete)$/);
    if (!match) return json({detail: 'Not found'}, 404);
    if (request.method !== 'POST') return json({detail: 'Method not allowed'}, 405);
    const candidateId = uuid(match[1], 'candidate id');
    const body = await bodyJson(request);
    const complete = match[2] === 'complete';
    if (Object.keys(body).some(key => key !== 'event_id' || !complete)) fail(422, 'Unexpected field');
    const eventId = complete ? uuid(body.event_id, 'event id') : null;
    const actorId = await actor(request);
    const result = await sql.transaction(async tx => {
      // Share-lock the source until the status update/audit commit, serializing
      // a concurrent source revocation rather than checking a stale flag.
      const before = (await tx.query(`SELECT c.*,s.enabled,s.verified FROM industry_candidates c
        JOIN raw_items r ON r.id=c.raw_item_id JOIN sources s ON s.id=r.source_id
        WHERE c.id=$1 FOR UPDATE OF c FOR SHARE OF s`, [candidateId]))[0];
      if (!before || !before.enabled || !before.verified) fail(422, 'Candidate missing or source unavailable');
      if (before.status !== 'pending') {
        if ((complete && before.status === 'published' && before.event_id === eventId) || (!complete && before.status === 'dismissed')) {
          return {id: before.id, status: before.status, already_applied: true};
        }
        fail(409, 'Candidate already reviewed');
      }
      if (complete) {
        const evidence = await tx.query(`SELECT e.id FROM public_events e JOIN public_evidence v ON v.event_id=e.id
          WHERE e.id=$1 AND v.raw_item_id=$2`, [eventId, before.raw_item_id]);
        if (!evidence.length) fail(422, 'Published event must include this candidate source evidence');
      }
      const after = (await tx.query(`UPDATE industry_candidates SET status=$2,event_id=$3,updated_at=now()
        WHERE id=$1 AND status='pending' RETURNING id,status,event_id`,
      [candidateId, complete ? 'published' : 'dismissed', eventId]))[0];
      await audit(tx, actorId, complete ? 'complete_candidate' : 'dismiss_candidate', candidateId,
        {status: before.status, event_id: before.event_id, raw_item_id: before.raw_item_id}, after);
      return after;
    });
    return json(result);
  } catch (error) {
    if (error instanceof CandidateError) return json({detail: error.message}, error.status);
    throw error; // The parent Worker redacts infrastructure failures.
  }
}
