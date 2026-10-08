import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {candidateApi} from './candidates.js';
import {handleApi} from './api.js';

const noDatabase = {query() {throw new Error('Unexpected database access');}, transaction() {throw new Error('Unexpected transaction');}};
const candidateId = 'a1234567-1234-1234-1234-123456789abc';
const headers = {'content-type': 'application/json', authorization: 'Bearer ' + 'a'.repeat(40)};
const request = (path, body = {}, extra = {}) => new Request('https://bioai.example/api/admin/candidates' + path,
  {method: 'POST', headers, body: JSON.stringify(body), ...extra});

test('candidate UUIDs and JSON shapes are checked before database access', async () => {
  assert.equal((await candidateApi(request('/' + '-'.repeat(36) + '/complete', {event_id: candidateId}), noDatabase)).status, 422);
  for (const body of [{event_id: '-'.repeat(36)}, [], null, {event_id: candidateId, publish: true}])
    assert.equal((await candidateApi(request('/' + candidateId + '/complete', body), noDatabase)).status, 422);
  assert.equal((await candidateApi(request('/generate', {publish: true}), noDatabase)).status, 422);
  assert.equal((await candidateApi(request('/' + candidateId + '/dismiss', {event_id: candidateId}), noDatabase)).status, 422);
});

test('body is byte-bounded even when content length is absent or lies', async () => {
  const path = '/' + candidateId + '/complete';
  for (const extra of [{}, {headers: {...headers, 'content-length': '10'}}])
    assert.equal((await candidateApi(request(path, {event_id: '字'.repeat(2000)}, extra), noDatabase)).status, 413);
  const stream = new ReadableStream({start(controller) {
    controller.enqueue(new TextEncoder().encode(' '.repeat(3000)));
    controller.enqueue(new TextEncoder().encode(' '.repeat(3000))); controller.close();
  }});
  assert.equal((await candidateApi(request(path, {}, {body: stream, duplex: 'half'}), noDatabase)).status, 413);
  assert.equal((await candidateApi(request(path, {}, {body: '{'}), noDatabase)).status, 400);
  assert.equal((await candidateApi(request(path, {}, {headers: {'content-type': 'text/plain'}}), noDatabase)).status, 415);
});

test('source revocation and failed exact evidence prevent both mutation and audit', async () => {
  for (const before of [{enabled: false, verified: true}, {enabled: true, verified: false}, {enabled: true, verified: true}]) {
    const queries = [];
    const sql = {transaction: fn => fn({query: async text => {
      queries.push(text);
      if (text.startsWith('SELECT c.*')) return [{id: candidateId, status: 'pending', raw_item_id: candidateId, ...before}];
      if (text.startsWith('SELECT e.id')) return [];
      throw new Error('Unexpected mutation');
    }})};
    assert.equal((await candidateApi(request('/' + candidateId + '/complete', {event_id: candidateId}), sql)).status, 422);
    assert.ok(!queries.some(text => /UPDATE industry_candidates|INSERT INTO audit_log/.test(text)));
    if (before.enabled && before.verified) assert.ok(queries.some(text => text.includes('JOIN public_evidence')));
  }
});

let connectionString = process.env.API_TEST_DATABASE_URL;
if (!connectionString) {
  try {connectionString = (await readFile(new URL('../../.env', import.meta.url), 'utf8')).match(/^DATABASE_URL\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^['"](.*)['"]$/, '$1');} catch {}
}
let local = false;
try {local = ['localhost', '127.0.0.1'].includes(new URL(connectionString).hostname);} catch {}

test('candidate generation, publication evidence, revocation and audit use isolated PostgreSQL', {skip: !local}, async () => {
  const {Client, Pool} = await import('pg');
  const controlUrl = new URL(connectionString); controlUrl.pathname = '/postgres';
  const control = new Client({connectionString: controlUrl.href});
  const name = 'bioai_candidates_test_' + crypto.randomUUID().replaceAll('-', '');
  await control.connect(); let pool;
  try {
    await control.query(`CREATE DATABASE "${name}"`);
    const testUrl = new URL(connectionString); testUrl.pathname = '/' + name;
    pool = new Pool({connectionString: testUrl.href});
    const sql = {query: async (text, params = []) => (await pool.query(text, params)).rows,
      async transaction(fn) {const c = await pool.connect(); try {await c.query('BEGIN'); const result = await fn({query: async (text, params = []) => (await c.query(text, params)).rows}); await c.query('COMMIT'); return result;} catch (error) {await c.query('ROLLBACK'); throw error;} finally {c.release();}}};
    const migrations = new URL('../../backend/migrations/', import.meta.url);
    for (const file of (await readdir(migrations)).filter(x => x.endsWith('.sql')).sort()) await sql.query(await readFile(new URL(file, migrations), 'utf8'));
    await sql.query("INSERT INTO polling_profiles VALUES('P0',1)");
    const sourceId = crypto.randomUUID(), rawId = crypto.randomUUID();
    const quote = 'Fixture company collaborates on an artificial intelligence drug discovery project.';
    await sql.query(`INSERT INTO sources(id,name,source_type,url,verified,verification_status,enabled,adapter,poll_profile)
      VALUES ($1,'TEST source','rss','https://fixture.example/feed',true,'verified',true,'rss','P0')`, [sourceId]);
    await sql.query(`INSERT INTO raw_items(id,source_id,external_id,title,canonical_url,content_text,content_hash,raw_payload)
      VALUES($1,$2,'fixture-record','Fixture collaboration announcement','https://fixture.example/announcement',$3,'fixture-hash',$4::jsonb)`,
    [rawId, sourceId, quote, JSON.stringify({industry_classification: {relevant: true, event_types: ['partnership']}})]);
    const generate = await candidateApi(request('/generate'), sql);
    assert.equal(generate.status, 200); assert.equal((await generate.json()).proposed, 1);
    assert.equal((await sql.query('SELECT count(*)::int AS n FROM events'))[0].n, 0, 'Generation must never publish');
    assert.equal((await sql.query("SELECT count(*)::int AS n FROM audit_log WHERE action='generate_candidates'"))[0].n, 1);
    const candidate = (await sql.query('SELECT * FROM industry_candidates'))[0];
    assert.equal((await candidateApi(request('/' + candidate.id + '/complete', {event_id: crypto.randomUUID()}), sql)).status, 422);
    const body = {request_id: crypto.randomUUID(), raw_item_id: rawId, title: 'Fixture collaboration announcement', summary: 'An explicitly reviewed fixture collaboration for testing.', evidence_text: quote, track: '生物医药', event_type: 'partnership', company_ids: [], relations: []};
    const published = await handleApi(new Request('https://bioai.example/api/admin/events', {method: 'POST', headers, body: JSON.stringify(body)}), {ADMIN_TOKEN: 'a'.repeat(40)}, sql);
    assert.equal(published.status, 200); const event = await published.json();
    await sql.query("UPDATE sources SET verified=false,verification_status='rejected' WHERE id=$1", [sourceId]);
    assert.equal((await candidateApi(request('/' + candidate.id + '/complete', {event_id: event.id}), sql)).status, 422);
    assert.equal((await (await candidateApi(new Request('https://bioai.example/api/admin/candidates'), sql)).json()).length, 0);
    await sql.query("UPDATE sources SET verified=true,verification_status='verified' WHERE id=$1", [sourceId]);
    const complete = await candidateApi(request('/' + candidate.id + '/complete', {event_id: event.id}), sql);
    assert.equal(complete.status, 200); assert.equal((await complete.json()).status, 'published');
    assert.equal((await sql.query("SELECT count(*)::int AS n FROM audit_log WHERE action='complete_candidate'"))[0].n, 1);
    const again = await candidateApi(request('/' + candidate.id + '/complete', {event_id: event.id}), sql);
    assert.equal((await again.json()).already_applied, true);
    assert.equal((await candidateApi(request('/' + candidate.id + '/dismiss'), sql)).status, 409);
  } finally {
    await pool?.end(); await control.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); await control.end();
  }
});
