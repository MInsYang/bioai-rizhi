import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { ApiError, apiRead, canonicalUrl, handleApi, normalizeIdentity } from './api.js';

const env = { ADMIN_TOKEN: 'a'.repeat(40) };
const auth = { authorization: 'Bearer ' + env.ADMIN_TOKEN, 'content-type': 'application/json' };
const req = (path, method = 'GET', body, headers = {}) => new Request('https://bioai.example' + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const noDatabase = { query() { throw new Error('Unexpected database access'); } };

test('identity normalization preserves NFKC, Unicode casefold and ambiguity lookup', async () => {
  assert.equal(normalizeIdentity('ＡＢＣ 公司 / Straße'), 'abc公司strasse');
  assert.equal(normalizeIdentity('ΟΣ'), normalizeIdentity('ος'));
  assert.equal(canonicalUrl('https://example.org/article?utm_source=test&b=2&a=1#section'), 'https://example.org/article?a=1&b=2');
  assert.throws(() => canonicalUrl('http://example.org'), ApiError);
  assert.throws(() => canonicalUrl('https://user:password@example.org'), ApiError);
  const result = await apiRead('/api/identity/resolve', { name: 'shared' }, { query: async () => [{ slug: 'a' }, { slug: 'b' }] });
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.candidates.length, 2);
});

test('parameter validation and admin authentication occur before database access', async () => {
  for (const path of ['/api/events?start=2026-10-10&end=2026-10-01', '/api/events?start=2026-02-30', '/api/records?limit=101', '/api/records?topic=unknown', '/api/records?focused=maybe', '/api/companies?region_group=unknown']) {
    assert.equal((await handleApi(req(path), env, noDatabase)).status, 422, path);
  }
  assert.equal((await handleApi(req('/api/admin/jobs'), env, noDatabase)).status, 401);
  assert.equal((await handleApi(req('/api/admin/jobs', 'GET', undefined, { authorization: 'Bearer wrong' }), env, noDatabase)).status, 401);
  assert.equal((await handleApi(req('/api/admin/jobs'), {}, noDatabase)).status, 503);
  assert.equal(await apiRead('/api/admin/records', {}, noDatabase), null);
});

test('database failures are redacted and non-API paths remain available to assets', async () => {
  const response = await handleApi(req('/health'), env, { query() { throw new Error('postgres://private:secret@db.invalid'); } });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { detail: 'Database unavailable' });
  assert.equal(await handleApi(req('/index.html'), env, noDatabase), null);
  assert.equal((await handleApi(req('/api/unknown'), env, noDatabase)).status, 404);
  assert.equal((await handleApi(req('/api/topics', 'POST'), env, noDatabase)).status, 405);
});

// This suite creates and drops a disposable database. It refuses remote URLs,
// and never migrates, truncates or seeds the configured application database.
let testUrl = process.env.API_TEST_DATABASE_URL;
if (!testUrl) {
  try {
    const localEnv = await readFile(new URL('../../.env', import.meta.url), 'utf8');
    testUrl = localEnv.match(/^DATABASE_URL\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^['"](.*)['"]$/, '$1');
  } catch { /* Pure route tests still run without a local PostgreSQL installation. */ }
}
let isLocal = false;
try { isLocal = ['127.0.0.1', 'localhost'].includes(new URL(testUrl).hostname); } catch { /* Missing or invalid test configuration. */ }

test('PostgreSQL public views, publication transactions and source revocation', { skip: !isLocal }, async t => {
  const { Client, Pool } = await import('pg');
  const adminUrl = new URL(testUrl); adminUrl.pathname = '/postgres';
  const name = 'bioai_worker_api_test_' + crypto.randomUUID().replaceAll('-', '');
  const control = new Client({ connectionString: adminUrl.href });
  await control.connect();
  let pool;
  try {
    await control.query(`CREATE DATABASE "${name}"`);
    const isolated = new URL(testUrl); isolated.pathname = '/' + name;
    pool = new Pool({ connectionString: isolated.href, max: 8 });
    const sql = {
      query: async (text, params = []) => (await pool.query(text, params)).rows,
      async transaction(operation) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await operation({ query: async (text, params = []) => (await client.query(text, params)).rows });
          await client.query('COMMIT');
          return result;
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
      },
    };
    const migrations = new URL('../../backend/migrations/', import.meta.url);
    for (const file of (await readdir(migrations)).filter(file => file.endsWith('.sql')).sort()) await sql.query(await readFile(new URL(file, migrations), 'utf8'));
    await sql.query("INSERT INTO polling_profiles VALUES ('P0',1),('P1',6),('P2',24)");
    const a = crypto.randomUUID(), b = crypto.randomUUID(), historical = crypto.randomUUID();
    for (const [id, slug, zh, en, region, status] of [[a, 'fixture-a', '测试公司甲', 'Fixture A', '中国', 'active'], [b, 'fixture-b', '', 'Fixture B', '美国', 'active'], [historical, 'fixture-old', '', 'Fixture Old', '中国/美国', 'historical']]) {
      await sql.query("INSERT INTO companies(id,slug,name_zh,name_en,track,region,official_website,priority,status) VALUES ($1,$2,$3,$4,'测序与多组学',$5,$6,'P0',$7)", [id, slug, zh, en, region, 'https://' + slug + '.example/', status]);
      for (const alias of [zh, en, 'shared'].filter(Boolean)) await sql.query("INSERT INTO company_aliases(company_id,alias,normalized,alias_type) VALUES($1,$2,$3,'alias') ON CONFLICT DO NOTHING", [id, alias, normalizeIdentity(alias)]);
    }
    async function fixture({ title = 'UNIT TEST record', classification = { topic_ids: ['virtual-cell'] }, registryKey, verified = true, content } = {}) {
      const sid = crypto.randomUUID(), rid = crypto.randomUUID();
      const quote = 'These two fixture companies collaborate on a test project with a virtual cell model.';
      const text = content || '😀 Saved source text. ' + quote;
      await sql.query(`INSERT INTO sources(id,company_id,name,source_type,url,poll_profile,verified,verification_status,adapter,registry_key,config)
        VALUES ($1,$2,'UNIT TEST SOURCE','rss',$3,'P0',$4,$5,'rss',$6,$7::jsonb)`, [sid, a, 'https://example.org/' + sid, verified, verified ? 'verified' : 'pending', registryKey || 'unit-' + sid, JSON.stringify({ cloud_runtime_enabled: true })]);
      await sql.query(`INSERT INTO raw_items(id,source_id,external_id,title,canonical_url,published_at,content_text,content_hash,raw_payload)
        VALUES ($1,$2,$3,$4,$5,now(),$6,$7,$8::jsonb)`, [rid, sid, rid, title, 'https://example.org/' + rid, text, rid, JSON.stringify({ classification, academic: { status: 'preprint', doi: '10.1101/fixture', version: '2' } })]);
      return { sid, rid, quote, text };
    }
    const publication = f => ({ request_id: crypto.randomUUID(), raw_item_id: f.rid, title: 'UNIT TEST: fixture collaboration', summary: 'UNIT TEST ONLY: explicit fixture relationship.', evidence_text: f.quote, track: '测序与多组学', event_type: 'partnership', company_ids: [a, b], relations: [{ subject_id: a, object_id: b, predicate: 'collaborates_with', evidence_text: f.quote }] });
    const post = (path, body, database = sql) => handleApi(req(path, 'POST', body, auth), env, database);

    await t.test('focused records use latest verified revision and retain an explicit history scope', async () => {
      const f = await fixture({ title: 'FOCUS_FIXTURE virtual cell', registryKey: 'pubmed-eutils' });
      await fixture({ title: 'FOCUS_FIXTURE unrelated', classification: { topic_ids: [] } });
      assert.equal((await apiRead('/api/records', { q: 'FOCUS_FIXTURE', days: 0 }, sql)).total, 1);
      assert.equal((await apiRead('/api/records', { q: 'FOCUS_FIXTURE', days: 0, scope: 'all' }, sql)).total, 2);
      assert.equal((await apiRead('/api/records', { q: 'FOCUS_FIXTURE', days: 0, topic: 'organoid' }, sql)).total, 0);
      const academic = await apiRead('/api/records', { days: 0, academic: true, source: 'pubmed' }, sql);
      assert.equal(academic.total, 1);
      assert.equal(academic.items[0].academic.status, 'preprint');
      await sql.query(`INSERT INTO raw_items(id,source_id,external_id,title,canonical_url,published_at,content_hash,raw_payload,fetched_at)
        SELECT $1,source_id,external_id,'FOCUS_FIXTURE revised unrelated',canonical_url,published_at,$2,'{"classification":{"topic_ids":[]}}',now()+interval '1 second' FROM raw_items WHERE id=$3`, [crypto.randomUUID(), crypto.randomUUID(), f.rid]);
      assert.equal((await apiRead('/api/records', { q: 'FOCUS_FIXTURE', days: 0 }, sql)).total, 0);
      assert.equal((await apiRead('/api/records', { q: 'FOCUS_FIXTURE', days: 0, scope: 'all' }, sql)).total, 2);
    });

    await t.test('concurrent publication is idempotent, excerpt-backed and immediately revocable', async () => {
      const f = await fixture(), body = publication(f);
      assert.equal((await post('/api/admin/events', { ...body, evidence_text: 'This evidence sentence does not exist in the saved source.' })).status, 422);
      assert.equal((await sql.query('SELECT count(*)::integer AS n FROM events'))[0].n, 0);
      const responses = await Promise.all([post('/api/admin/events', body), post('/api/admin/events', body)]);
      for (const response of responses) assert.equal(response.status, 200, await response.clone().text());
      const results = await Promise.all(responses.map(response => response.json()));
      assert.equal(results[0].id, results[1].id);
      assert.deepEqual(new Set(results.map(row => row.status)), new Set(['published', 'already_published']));
      const id = results[0].id;
      const event = await apiRead('/api/events/' + id, {}, sql);
      assert.equal(event.evidence_count, 1);
      assert.equal(event.academic[0].status, 'preprint');
      assert.equal(event.companies.length, 2);
      assert.equal((await apiRead('/api/companies', { topic: 'virtual-cell' }, sql)).total, 1);
      assert.deepEqual((await apiRead('/api/companies/fixture-a', {}, sql)).topic_ids, ['virtual-cell']);
      assert.equal((await apiRead('/api/companies', { topic: 'organoid' }, sql)).total, 0);
      assert.equal((await apiRead('/api/graph', { days: 0, topic: 'virtual-cell' }, sql)).edges.length, 1);
      assert.equal((await apiRead('/api/graph', { days: 0, topic: 'organoid' }, sql)).edges.length, 0);
      const span = (await sql.query('SELECT evidence_start,evidence_end FROM event_evidence WHERE event_id=$1', [id]))[0];
      assert.equal(span.evidence_start, Array.from(f.text.split(f.quote)[0]).length);
      assert.equal(span.evidence_end - span.evidence_start, Array.from(f.quote).length);
      assert.equal((await sql.query("SELECT count(*)::integer n FROM audit_log WHERE action='publish_event'"))[0].n, 1);
      await sql.query("UPDATE sources SET verified=false,verification_status='rejected' WHERE id=$1", [f.sid]);
      assert.equal((await apiRead('/api/events', { days: 0 }, sql)).total, 0);
      assert.equal((await apiRead('/api/graph', { days: 0 }, sql)).edges.length, 0);
      assert.equal((await apiRead('/api/companies/fixture-a', {}, sql)).events.length, 0);
      assert.equal((await apiRead('/api/companies', { topic: 'virtual-cell' }, sql)).total, 0);
      assert.deepEqual((await apiRead('/api/companies/fixture-a', {}, sql)).topic_ids, []);
      assert.equal((await apiRead('/api/companies', { q: '测试公司甲' }, sql)).items[0].events_30d, 0);
      await assert.rejects(apiRead('/api/events/' + id, {}, sql), error => error.status === 404);
      await assert.rejects(apiRead('/api/records/' + f.rid, {}, sql), error => error.status === 404);
      await sql.query("UPDATE sources SET verified=true,verification_status='verified' WHERE id=$1", [f.sid]);
      assert.equal((await post('/api/admin/events/' + id + '/unpublish')).status, 200);
      assert.equal((await apiRead('/api/events', { days: 0 }, sql)).total, 0);
    });

    await t.test('audit failures roll back publication and invalid relationship endpoints are rejected', async () => {
      const f = await fixture(), body = publication(f);
      assert.equal((await post('/api/admin/events', { ...body, relations: [{ ...body.relations[0], object_id: crypto.randomUUID() }] })).status, 422);
      const failing = { ...sql, transaction: operation => sql.transaction(tx => operation({ query: async (text, params) => {
        if (text.startsWith('INSERT INTO audit_log')) throw new Error('Injected audit failure');
        return tx.query(text, params);
      } })) };
      assert.equal((await post('/api/admin/events', body, failing)).status, 503);
      assert.equal((await sql.query('SELECT count(*)::integer n FROM events WHERE request_id=$1', [body.request_id]))[0].n, 0);
      const unverified = await fixture({ verified: false });
      assert.equal((await post('/api/admin/events', publication(unverified))).status, 422);
    });

    await t.test('source verification requires supported ingestion and matching stored backlink evidence', async () => {
      const added = await post('/api/admin/sources', { company_id: a, name: 'Candidate feed', url: 'https://example.org/candidate?utm_source=fixture', source_type: 'rss' });
      assert.equal(added.status, 200);
      const source = await added.json();
      assert.equal(source.verified, false);
      assert.equal(source.enabled, false);
      assert.equal(source.url, 'https://example.org/candidate');
      const review = { decision: 'verified', method: 'official_backlink', evidence_url: 'https://example.org/official', evidence_text: 'Official source links to this exact feed.', enable_ingestion: true };
      assert.equal((await post('/api/admin/sources/' + source.id + '/review', review)).status, 422);
      await sql.query("UPDATE sources SET config=$1::jsonb WHERE id=$2", [JSON.stringify({ provenance: { discovered_on: review.evidence_url } }), source.id]);
      assert.equal((await post('/api/admin/sources/' + source.id + '/review', review)).status, 200);
      const job = crypto.randomUUID();
      await sql.query("INSERT INTO ingestion_jobs(id,source_id,window_start) VALUES($1,$2,now())", [job, source.id]);
      assert.equal((await post('/api/admin/sources/' + source.id + '/review', { ...review, decision: 'pending', enable_ingestion: false })).status, 200);
      assert.equal((await sql.query('SELECT status FROM ingestion_jobs WHERE id=$1', [job]))[0].status, 'dead');
      const social = await (await post('/api/admin/sources', { name: 'Candidate social', url: 'https://x.com/example', source_type: 'social' })).json();
      assert.equal((await post('/api/admin/sources/' + social.id + '/review', { ...review, method: 'manual_review' })).status, 422);
      assert.equal((await post('/api/admin/sources', { company_id: crypto.randomUUID(), name: 'Missing company', url: 'https://example.org/missing', source_type: 'rss' })).status, 404);
    });

    await t.test('company identity edits preserve historical names and revoke source verification', async () => {
      const body = { name_zh: '新测试公司甲', name_en: 'Updated Fixture A', aliases: ['New alias'], official_website: 'https://new-fixture-a.example/', priority: 'P1', notes: 'UNIT TEST identity change' };
      const response = await handleApi(req('/api/admin/companies/fixture-a', 'PUT', body, auth), env, sql);
      assert.equal(response.status, 200, await response.clone().text());
      const old = await apiRead('/api/identity/resolve', { name: 'Fixture A' }, sql);
      assert.equal(old.status, 'matched');
      assert.equal(old.candidates[0].alias_type, 'historical_brand');
      assert.equal((await apiRead('/api/identity/resolve', { name: 'Updated Fixture A' }, sql)).status, 'matched');
      assert.equal((await sql.query('SELECT count(*)::integer n FROM sources WHERE company_id=$1 AND verified', [a]))[0].n, 0);
      assert.equal((await apiRead('/api/companies', {}, sql)).total, 2);
      assert.equal((await apiRead('/api/companies', { history: true }, sql)).total, 3);
      assert.equal((await apiRead('/api/companies', { region_group: 'global' }, sql)).total, 1);
      assert.equal((await apiRead('/api/companies', { region_group: 'cross', history: true }, sql)).total, 1);
    });

    await t.test('hourly heartbeat records zero-job success and exposes latest failure without private diagnostics', async () => {
      await sql.query("INSERT INTO scheduler_runs(scheduled_at,status,finished_at,dispatched_count,error) VALUES ('2026-10-08T01:00:00Z','succeeded',now(),0,NULL),('2026-10-08T02:00:00Z','failed',now(),0,'private backend diagnosis')");
      await sql.query("INSERT INTO scheduler_runs(scheduled_at,trigger_kind,status,finished_at,dispatched_count) VALUES ('2026-10-08T03:00:00Z','manual','succeeded',now(),0)");
      const overview = await apiRead('/api/overview', {}, sql);
      assert.equal(overview.cadence_hours, 1);
      assert.equal(new Date(overview.scheduler_last_dispatch_at).toISOString(), '2026-10-08T01:00:00.000Z');
      assert.equal(overview.scheduler_latest_run.status, 'failed');
      assert.equal(overview.scheduler_latest_run.trigger_kind, 'cron');
      assert.equal(Object.hasOwn(overview.scheduler_latest_run, 'error'), false);
      assert.equal(overview.companies, 2);
      const jobs = await handleApi(req('/api/admin/jobs', 'GET', undefined, auth), env, sql);
      const records = await handleApi(req('/api/admin/records?limit=1&offset=0', 'GET', undefined, auth), env, sql);
      assert.equal(jobs.status, 200);
      assert.equal(records.status, 200);
      assert.equal((await records.json()).length, 1);
      assert.equal((await apiRead('/api/topics', {}, sql)).items.length, 5);
    });
  } finally {
    await pool?.end();
    await control.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await control.end();
  }
});
