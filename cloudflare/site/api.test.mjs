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
  for (const path of ['/api/events?start=2026-10-10&end=2026-10-01', '/api/events?start=2026-02-30', '/api/records?limit=101', '/api/records?topic=unknown', '/api/records?focused=maybe', '/api/records?journal_tier=top99', '/api/companies?region_group=unknown']) {
    assert.equal((await handleApi(req(path), env, noDatabase)).status, 422, path);
  }
  assert.equal((await handleApi(req('/api/admin/jobs'), env, noDatabase)).status, 401);
  assert.equal((await handleApi(req('/api/admin/jobs', 'GET', undefined, { authorization: 'Bearer wrong' }), env, noDatabase)).status, 401);
  assert.equal((await handleApi(req('/api/admin/jobs'), {}, noDatabase)).status, 503);
  assert.equal(await apiRead('/api/admin/records', {}, noDatabase), null);
});

test('journal policy is public, explicit and available without database access',async()=>{
  const response=await handleApi(req('/api/journals'),env,noDatabase);
  assert.equal(response.status,200);
  const policy=await response.json();
  assert.equal(policy.items.length,17);
  assert.equal(policy.tier,'selected');
  assert.ok(policy.items.some(journal=>journal.title==='Nature Biotechnology'));
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
  const connectedClients=new Set();
  try {
    await control.query(`CREATE DATABASE "${name}"`);
    const isolated = new URL(testUrl); isolated.pathname = '/' + name;
    pool = new Pool({ connectionString: isolated.href, max: 8 });
    pool.on('connect',client=>{
      connectedClients.add(client);
      client.once('end',()=>connectedClients.delete(client));
    });
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
    async function fixture({ title = 'UNIT TEST record', classification = { topic_ids: ['virtual-cell'],ai_related:true }, registryKey, verified = true, content,
      academic={ status: 'preprint', doi: '10.1101/fixture', version: '2' },companyId=a,enabled=true } = {}) {
      const sid = crypto.randomUUID(), rid = crypto.randomUUID();
      const quote = 'These two fixture companies collaborate on a test project with a virtual cell model.';
      const text = content || '😀 Saved source text. ' + quote;
      await sql.query(`INSERT INTO sources(id,company_id,name,source_type,url,poll_profile,verified,verification_status,adapter,registry_key,config,enabled)
        VALUES ($1,$2,'UNIT TEST SOURCE','rss',$3,'P0',$4,$5,'rss',$6,$7::jsonb,$8)`, [sid, companyId, 'https://example.org/' + sid, verified, verified ? 'verified' : 'pending', registryKey || 'unit-' + sid, JSON.stringify({ cloud_runtime_enabled: true }),enabled]);
      await sql.query(`INSERT INTO raw_items(id,source_id,external_id,title,canonical_url,published_at,content_text,content_hash,raw_payload)
        VALUES ($1,$2,$3,$4,$5,now(),$6,$7,$8::jsonb)`, [rid, sid, rid, title, 'https://example.org/' + rid, text, rid, JSON.stringify({ classification,...(academic?{academic}:{}) })]);
      return { sid, rid, quote, text };
    }
    const publication = f => ({ request_id: crypto.randomUUID(), raw_item_id: f.rid, title: 'UNIT TEST: fixture collaboration', summary: 'UNIT TEST ONLY: explicit fixture relationship.', evidence_text: f.quote, track: '测序与多组学', event_type: 'partnership', company_ids: [a, b], relations: [{ subject_id: a, object_id: b, predicate: 'collaborates_with', evidence_text: f.quote }] });
    const post = (path, body, database = sql) => handleApi(req(path, 'POST', body, auth), env, database);

    await t.test('focused records use latest verified revision and retain an explicit history scope', async () => {
      const journalMetadata={status:'indexed',journal:'Nature Biotechnology'};
      const f = await fixture({ title: 'FOCUS_FIXTURE virtual cell', registryKey: 'pubmed-eutils',academic:journalMetadata });
      await fixture({ title: 'FOCUS_FIXTURE unrelated', classification: { topic_ids: [],ai_related:true },academic:journalMetadata });
      assert.equal((await apiRead('/api/records', { q: 'FOCUS_FIXTURE', days: 0 }, sql)).total, 1);
      assert.equal((await apiRead('/api/records', { q: 'FOCUS_FIXTURE', days: 0, scope: 'all' }, sql)).total, 2);
      assert.equal((await apiRead('/api/records', { q: 'FOCUS_FIXTURE', days: 0, topic: 'organoid' }, sql)).total, 0);
      const academic = await apiRead('/api/records', { days: 0, academic: true, source: 'pubmed' }, sql);
      assert.equal(academic.total, 1);
      assert.equal(academic.items[0].academic.status, 'indexed');
      await sql.query(`INSERT INTO raw_items(id,source_id,external_id,title,canonical_url,published_at,content_hash,raw_payload,fetched_at)
        SELECT $1,source_id,external_id,'FOCUS_FIXTURE revised unrelated',canonical_url,published_at,$2,'{"classification":{"topic_ids":[]}}',now()+interval '1 second' FROM raw_items WHERE id=$3`, [crypto.randomUUID(), crypto.randomUUID(), f.rid]);
      assert.equal((await apiRead('/api/records', { q: 'FOCUS_FIXTURE', days: 0 }, sql)).total, 0);
      assert.equal((await apiRead('/api/records', { q: 'FOCUS_FIXTURE', days: 0, scope: 'all',journal_tier:'all' }, sql)).total, 2);
    });

    await t.test('default scholarly filtering applies before counts and paging and retains explicit archive access',async()=>{
      const selected={status:'indexed',journal:'Nature Biotechnology',issns:['1087-0156'],publication_types:['Journal Article']};
      const journalFixture=fields=>fixture({...fields,companyId:null});
      const row=await journalFixture({title:'JOURNAL_FIXTURE AI cell foundation model',registryKey:'europe-pmc',academic:selected});
      await journalFixture({title:'JOURNAL_FIXTURE obscure journal',academic:{...selected,journal:'Unlisted Journal',issns:['0000-0000']}});
      await journalFixture({title:'JOURNAL_FIXTURE preprint',academic:{...selected,status:'preprint'}});
      await journalFixture({title:'JOURNAL_FIXTURE no AI organoids',classification:{topic_ids:['organoid'],ai_related:false},academic:selected});
      await journalFixture({title:'JOURNAL_FIXTURE merged serial title',academic:{...selected,journal:'Nature Reviews Cancer',issns:['1474-1776']}});
      await journalFixture({title:'JOURNAL_FIXTURE company AI partnership',academic:null});
      const mixed=await apiRead('/api/records',{q:'JOURNAL_FIXTURE',days:0,limit:1},sql);
      assert.equal(mixed.total,2);assert.equal(mixed.journal_tier,'selected');assert.equal(mixed.items.length,1);
      const scholars=await apiRead('/api/records',{q:'JOURNAL_FIXTURE',academic:true,days:0},sql);
      assert.equal(scholars.total,1);assert.equal(scholars.items[0].id,row.rid);
      assert.equal(scholars.items[0].academic.journal_selection.journal_id,'nature-biotechnology');
      assert.equal((await apiRead('/api/records',{q:'JOURNAL_FIXTURE',academic:false,days:0},sql)).total,1);
      const archive=await apiRead('/api/records',{q:'JOURNAL_FIXTURE',academic:true,journal_tier:'all',days:0},sql);
      assert.equal(archive.total,5);
      assert.equal(archive.items.find(item=>item.title.endsWith('preprint')).academic.journal_selection.tier,'preprint');
      const original=await apiRead('/api/records/'+archive.items.find(item=>item.title.endsWith('obscure journal')).id,{},sql);
      assert.equal(original.academic.journal,'Unlisted Journal');
      assert.equal(original.academic.journal_selection.tier,'outside_selection');
    });
    await t.test('journal SQL and response policy agree on normalized titles and ambiguous title-missing ISSNs',async()=>{
      for(const academic of [
        {status:'indexed',issns:['0028-0836','1476-4687']},
        {status:'indexed',issns:['0028-0836','2522-5839']},
        {status:'indexed',journal:'Ｎａｔｕｒｅ Ｍｅｔｈｏｄｓ'},
        {status:'indexed',journal:'Unknown serial',issns:['0028-0836']},
      ])await fixture({title:'ISSN_FIXTURE AI virtual cell',companyId:null,academic});
      const selected=await apiRead('/api/records',{q:'ISSN_FIXTURE',days:0,academic:true},sql);
      assert.equal(selected.total,2);
      assert.deepEqual(new Set(selected.items.map(row=>row.academic.journal_selection.journal_id)),new Set(['nature','nature-methods']));
      const archive=await apiRead('/api/records',{q:'ISSN_FIXTURE',days:0,journal_tier:'all'},sql);
      assert.equal(archive.total,4);assert.equal(archive.items.filter(row=>row.academic.journal_selection.tier==='selected').length,2);
    });

    await t.test('industry URLs expose the latest source copy while preprint versions and raw evidence remain distinct',async()=>{
      const shared='https://example.org/industry-dedup-'+crypto.randomUUID();
      const old=await fixture({title:'RESOURCE_DEDUP_FIXTURE dated industry excerpt',academic:null,companyId:null});
      const latest=await fixture({title:'RESOURCE_DEDUP_FIXTURE later official article',academic:null,companyId:null,content:'Latest full official article source copy.'});
      const preprints=[];
      for(const version of ['1','2'])preprints.push(await fixture({title:'RESOURCE_DEDUP_FIXTURE preprint version '+version,companyId:null,
        academic:{status:'preprint',doi:'10.1101/dedup-fixture',version}}));
      for(const row of [old,latest,...preprints])await sql.query('UPDATE raw_items SET canonical_url=$2 WHERE id=$1',[row.rid,shared]);
      await sql.query("UPDATE raw_items SET fetched_at=now()-interval '1 hour' WHERE id=$1",[old.rid]);
      const news=await apiRead('/api/records',{q:'RESOURCE_DEDUP_FIXTURE',academic:false,days:0},sql);
      assert.equal(news.total,1);assert.equal(news.items[0].id,latest.rid);
      const archive=await apiRead('/api/records',{q:'RESOURCE_DEDUP_FIXTURE',journal_tier:'all',days:0},sql);
      assert.equal(archive.total,3);
      assert.deepEqual(new Set(archive.items.filter(row=>row.academic).map(row=>row.academic.version)),new Set(['1','2']));
      assert.equal((await apiRead('/api/records/'+old.rid,{},sql)).id,old.rid);
      assert.equal((await apiRead('/api/records/'+latest.rid,{},sql)).content_text,'Latest full official article source copy.');
      assert.equal((await sql.query('SELECT count(*)::integer n FROM raw_items WHERE canonical_url=$1',[shared]))[0].n,4);
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
      assert.equal(event.details.review_method,'operator');assert.equal(event.extraction_version,'manual-review-v1');
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

    await t.test('disabled sources cannot publish and review provenance identifies agent assisted evidence review',async()=>{
      const f=await fixture({enabled:false}),body={...publication(f),review_method:'agent-assisted-source-review'};
      assert.equal((await post('/api/admin/events',body)).status,422);
      assert.equal((await sql.query('SELECT count(*)::integer n FROM events WHERE request_id=$1',[body.request_id]))[0].n,0);
      await sql.query('UPDATE sources SET enabled=true WHERE id=$1',[f.sid]);
      assert.equal((await post('/api/admin/events',{...body,review_method:'human-reviewed'})).status,422);
      const response=await post('/api/admin/events',body);assert.equal(response.status,200);
      const event=await apiRead('/api/events/'+(await response.json()).id,{},sql);
      assert.equal(event.details.review_method,'agent-assisted-source-review');assert.equal(event.extraction_version,'agent-assisted-review-v1');
      await post('/api/admin/events/'+event.id+'/unpublish');
      await sql.query("UPDATE sources SET verified=false,verification_status='rejected',enabled=false WHERE id=$1",[f.sid]);
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

    await t.test('recent record filtering and ordering bound future issue dates by collection without rewriting them', async () => {
      const rows = [];
      for (const [label, published, fetched] of [
        ['old future issue', '90 days', '-60 days'],
        ['recent future issue', '90 days', '-2 days'],
        ['current publication', '-2 hours', '-1 hour'],
        ['undated publication', null, '-4 hours'],
      ]) {
        const row = await fixture({ title: 'DATE_FIXTURE ' + label,academic:{status:'indexed',journal:'Nature Biotechnology'} });
        await sql.query('UPDATE raw_items SET published_at=now()+$2::interval,fetched_at=now()+$3::interval WHERE id=$1', [row.rid, published, fetched]);
        rows.push(row);
      }
      const [oldFuture, recentFuture, current, undated] = rows;
      const recent = await apiRead('/api/records', { q: 'DATE_FIXTURE', days: 30 }, sql);
      assert.equal(recent.total, 3);
      assert.deepEqual(recent.items.map(row => row.id), [current.rid, undated.rid, recentFuture.rid]);
      const all = await apiRead('/api/records', { q: 'DATE_FIXTURE', days: 0 }, sql);
      assert.equal(all.total, 4);
      assert.deepEqual(all.items.map(row => row.id), [current.rid, undated.rid, recentFuture.rid, oldFuture.rid]);
      const saved = (await sql.query('SELECT published_at,fetched_at FROM raw_items WHERE id=$1', [oldFuture.rid]))[0];
      const returned = all.items.find(row => row.id === oldFuture.rid);
      assert.equal(new Date(returned.published_at).getTime(), new Date(saved.published_at).getTime());
      assert(new Date(returned.published_at) > new Date());
      assert.equal(new Date(returned.fetched_at).getTime(), new Date(saved.fetched_at).getTime());
      assert.equal(recent.items.find(row => row.id === undated.rid).published_at, null);
    });
  } finally {
    try {
      // Pool.end() removes clients before their socket-end callbacks finish.
      // A force-drop in that gap can terminate a closing client and emit an
      // unhandled idle-pool error after an otherwise successful test run.
      await pool?.end();
      await Promise.all([...connectedClients].map(client=>new Promise(resolve=>client.once('end',resolve))));
      for(let attempt=0;attempt<20;attempt++) {
        const sessions=(await control.query('SELECT count(*)::integer n FROM pg_stat_activity WHERE datname=$1',[name])).rows[0].n;
        if(!sessions)break;
        if(attempt===19)throw new Error('Disposable API database still has active connections after pool shutdown');
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      await control.query(`DROP DATABASE IF EXISTS "${name}"`);
    } finally {
      await control.end();
    }
  }
});
