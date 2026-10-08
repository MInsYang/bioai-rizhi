import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {ANALYTICS_LIMITS,analyticsPeriod,classifyTraffic,handleTelemetry,readAnalytics,recordMcpExecution,sessionHash,validAnalyticsPath} from './analytics.js';
import {createWorker} from './index.js';
import {handleMcp} from './mcp.js';

const ORIGIN = 'https://bioai.example.test';
const ENV = {SITE_ORIGIN:ORIGIN,ADMIN_TOKEN:'a'.repeat(40),ANALYTICS_SALT:'b'.repeat(40)};
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const event = (values={}) => ({event_id:crypto.randomUUID(),session_id:crypto.randomUUID(),event_type:'page_view',path:'/#frontpage',...values});
const telemetry = (body=event(), options={}) => {
  const {headers={},...rest} = options;
  return new Request(ORIGIN+'/api/telemetry',{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json','user-agent':BROWSER,...headers},
    body:typeof body === 'string' ? body : JSON.stringify(body),...rest});
};
const noDatabase = () => {throw new Error('Unexpected database access');};
const rpcRequest = (method, params={}, headers={}) => new Request(ORIGIN+'/mcp',{
  method:'POST',headers:{Host:'bioai.example.test','content-type':'application/json',Accept:'application/json, text/event-stream',...headers},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),
});
async function rpcPayload(response) {
  const body = await response.text();
  if (!response.headers.get('content-type')?.includes('text/event-stream')) return JSON.parse(body);
  const messages = body.split('\n').filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6)));
  return messages.findLast(message=>message.id!==undefined);
}

test('analytics accepts only bounded public destinations and known identifiers',()=>{
  for (const path of ['/','/#frontpage','/#overview','/#news','/#saved','/#daily/2026-10-08','/briefings','/guides',
    '/guides/virtual-cell-models','/topics/organoid','/companies/fixture-company','/#company/fixture-company',
    '/records/'+crypto.randomUUID(),'/digest/2026-10-08']) assert.equal(validAnalyticsPath(path),true,path);
  for (const path of ['/api/admin/sources','/#admin','/#overview?query=private','/?token=private','https://example.test',
    '/topics/unknown','/#company/name with space','/#daily/2026-02-30','/digest/2026-13-01','/guides/unapproved-guide',
    '/companies/../../admin','/records/not-a-uuid','/#frontpage/extra','/#company/%70rivate','//example.test','/guides/'+ 'a'.repeat(300)]) assert.equal(validAnalyticsPath(path),false,path);
});
test('user-agent labels explicitly distinguish heuristic browser, automated and unknown',()=>{
  assert.equal(classifyTraffic(telemetry()),'browser');
  for (const agent of ['Googlebot/2.1 '+BROWSER,'HeadlessChrome/131 '+BROWSER,'curl/8.0','python-requests/2','Playwright/'+BROWSER])
    assert.equal(classifyTraffic(telemetry(event(),{headers:{'user-agent':agent}})),'automated');
  assert.equal(classifyTraffic(telemetry(event(),{headers:{'user-agent':'native-mcp-client'}})),'unknown');
});
test('method, origin, host, fetch metadata and content guards run before a database opens',async()=>{
  for (const [headers,status] of [[{origin:'https://evil.test'},403],[{origin:'null'},403],[{host:'evil.test'},403],
    [{'content-type':'text/plain'},415]])
    assert.equal((await handleTelemetry(telemetry(event(),{headers}),ENV,noDatabase)).status,status);
  assert.equal((await handleTelemetry(new Request(ORIGIN+'/api/telemetry'),ENV,noDatabase)).status,405);
  const missingOrigin=telemetry(); missingOrigin.headers.delete('origin');
  assert.equal((await handleTelemetry(missingOrigin,ENV,noDatabase)).status,403);
  const metadata=telemetry(); metadata.headers.delete('origin'); metadata.headers.set('sec-fetch-site','same-origin');
  assert.equal((await handleTelemetry(metadata,ENV,()=>({query:async()=>[]}))).status,202);
});
test('DNT and GPC requests are omitted, including malformed bodies',async()=>{
  for (const headers of [{dnt:'1'},{'sec-gpc':'1'}]) {
    const response=await handleTelemetry(telemetry('{',{headers}),ENV,noDatabase);
    assert.equal(response.status,204);assert.equal(await response.text(),'');
    assert.equal(response.headers.get('cache-control'),'no-store');
  }
});
test('telemetry rejects raw request fields, spoofed classifications, unsafe targets and overlong streams',async()=>{
  for (const body of [null,[],event({ip:'203.0.113.1'}),event({user_agent:BROWSER}),event({query:'private'}),
    event({traffic_class:'browser'}),event({traffic_type:'browser'}),event({session_id:'not-uuid'}),event({path:'/?q=private'}),
    event({referrer_host:'https://google.com/search?q=private'}),event({referrer_host:'127.0.0.1'}),
    event({event_type:'outbound_click',target:'private@example.com'}),event({event_type:'outbound_click',target:'example.com/private'}),
    event({event_type:'resource_open',target:'private query'}),event({event_type:'mcp_copy',target:'https://example.test/mcp'})])
    assert.equal((await handleTelemetry(telemetry(body),ENV,noDatabase)).status,422,JSON.stringify(body));
  assert.equal((await handleTelemetry(telemetry('{'),ENV,noDatabase)).status,400);
  assert.equal((await handleTelemetry(telemetry(' '.repeat(ANALYTICS_LIMITS.bodyBytes+1)),ENV,noDatabase)).status,413);
  assert.equal((await handleTelemetry(telemetry(event(),{headers:{'content-length':'99999'}}),ENV,noDatabase)).status,413);
  const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(' '.repeat(1200)));controller.enqueue(new TextEncoder().encode(' '.repeat(1200)));controller.close();}});
  assert.equal((await handleTelemetry(telemetry(event(),{body:stream,duplex:'half',headers:{'content-length':'10'}}),ENV,noDatabase)).status,413);
});
test('session IDs are HMAC hashed with a stable secret and are absent from writes',async()=>{
  const sample=event({event_type:'outbound_click',target:'www.nature.com',referrer_host:'google.com'}),writes=[];
  const hash=await sessionHash(sample.session_id,ENV);
  assert.match(hash,/^[a-f0-9]{64}$/);
  assert.equal(hash,await sessionHash(sample.session_id.toUpperCase(),ENV));
  assert.notEqual(hash,await sessionHash(sample.session_id,{...ENV,ANALYTICS_SALT:'c'.repeat(40)}));
  assert.notEqual(hash,sample.session_id);
  assert.equal((await handleTelemetry(telemetry(sample),ENV,()=>({query:async(text,params)=>{writes.push({text,params});return [];}}))).status,202);
  assert.equal(writes[0].params[2],hash);
  assert.equal(writes[0].params[6],'browser');
  assert.ok(!JSON.stringify(writes).includes(sample.session_id));
  assert.ok(!JSON.stringify(writes).includes(BROWSER));
  assert.equal((await handleTelemetry(telemetry(),{},noDatabase)).status,503);
});
test('public quota and authenticated dashboard gates precede database reads',async()=>{
  const worker=createWorker(noDatabase);
  for (const [path,method] of [['/api/admin/analytics?days=7','GET'],['/api/admin/analytics','POST'],['/api/admin/analytics/extra','GET']]) {
    const response=await worker.fetch(new Request(ORIGIN+path,{method}),ENV,{});
    assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'no-store');
  }
  const response=await worker.fetch(telemetry(),{...ENV,API_RATE_LIMITER:{limit:async()=>({success:false})}},{});
  assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'60');
  const session=crypto.randomUUID();let writes=0;
  for(let i=0;i<ANALYTICS_LIMITS.sessionEventsPerMinute;i++)
    assert.equal((await handleTelemetry(telemetry(event({session_id:session})),ENV,()=>({query:async()=>{writes++;return [];}}))).status,202);
  assert.equal((await handleTelemetry(telemetry(event({session_id:session})),ENV,noDatabase)).status,429);
  assert.equal(writes,60);
});
test('Beijing date boundaries use calendar days including the UTC crossover',()=>{
  assert.deepEqual(analyticsPeriod(1,'2026-10-08T16:05:00Z'),{start:'2026-10-08T16:00:00.000Z',end:'2026-10-08T16:05:00.000Z',start_date:'2026-10-09',end_date:'2026-10-09'});
  assert.equal(analyticsPeriod(7,'2026-10-08T15:59:59Z').start,'2026-10-01T16:00:00.000Z');
});
test('MCP measures executed registered tools, successful and isError outcomes, without request data',async()=>{
  const measurements=[];
  const observer=measurement=>measurements.push(measurement);
  const reader=async()=>({total:0,items:[]});
  for(const [method,params] of [['initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}}],
    ['tools/list',{}],['tools/call',{name:'search_resources',arguments:{limit:100}}],['tools/call',{name:'admin_edit',arguments:{}}]])
    await handleMcp(rpcRequest(method,params),ENV,{},reader,observer);
  assert.equal(measurements.length,0);
  const success=await rpcPayload(await handleMcp(rpcRequest('tools/call',{name:'search_resources',arguments:{query:'PRIVATE SEARCH'}}),ENV,{},reader,observer));
  assert.equal(success.result.isError,undefined);assert.equal(measurements.length,1);
  assert.equal(measurements[0].success,true);assert.equal(measurements[0].tool_name,'search_resources');
  assert.ok(measurements[0].duration_ms>=0);assert.ok(!JSON.stringify(measurements).includes('PRIVATE'));
  const failed=await rpcPayload(await handleMcp(rpcRequest('tools/call',{name:'get_company',arguments:{slug:'fixture'}}),ENV,{},async()=>{throw new Error('PRIVATE postgres://password');},observer));
  assert.equal(failed.result.isError,true);assert.equal(measurements[1].success,false);
  const failOpen=await rpcPayload(await handleMcp(rpcRequest('tools/call',{name:'search_resources',arguments:{}}),ENV,{},reader,()=>{throw new Error('Metrics failed');}));
  assert.equal(failOpen.result.isError,undefined);
});
test('MCP analytics uses waitUntil and metrics failure remains fail-open and redacted',async t=>{
  const messages=[];t.mock.method(console,'error',value=>messages.push(value));
  const tasks=[];const ctx={waitUntil(task){tasks.push(task);}};
  recordMcpExecution(rpcRequest('tools/list'),ENV,ctx,{query:async()=>{throw new Error('PRIVATE database URL');}},
    {tool_name:'search_resources',success:true,duration_ms:10,started_at:new Date().toISOString()});
  assert.equal(tasks.length,1);await tasks[0];
  assert.deepEqual(messages,[JSON.stringify({event:'analytics_write_failed',channel:'mcp'})]);
  assert.ok(!messages.join('').includes('PRIVATE'));
  recordMcpExecution(rpcRequest('tools/list',{}, {dnt:'1'}),ENV,ctx,{query:noDatabase},{});
  assert.equal(tasks.length,1);
});
test('daily retention is scheduled independently and IndexNow proof needs no database',async()=>{
  const worker=createWorker(noDatabase),key='fixture-indexnow-key-1234';
  for(const method of ['GET','HEAD']) {
    const response=await worker.fetch(new Request(ORIGIN+'/indexnow-key.txt',{method}),{...ENV,INDEXNOW_KEY:key},{});
    assert.equal(response.status,200);assert.equal(await response.text(),method==='GET'?key:'');
    assert.equal(response.headers.get('cache-control'),'no-store');
  }
  assert.equal((await worker.fetch(new Request(ORIGIN+'/indexnow-key.txt'),ENV,{})).status,404);
  const tasks=[],queries=[];
  await createWorker(()=>({query:async(text,params)=>{queries.push({text,params});return [];}})).scheduled(
    {cron:'0 0 * * *',scheduledTime:Date.parse('2026-10-08T00:00:00Z')},ENV,{waitUntil(task){tasks.push(task);}});
  await Promise.all(tasks);assert.equal(tasks.length,2);
  assert.ok(queries.some(row=>row.text.includes('cleanup_usage_analytics')&&row.params[0]==='2026-10-08T00:00:00.000Z'));
});

test('isolated PostgreSQL persists deduped telemetry, exclusions, tool executions and zero-filled reports',
  {skip:process.env.BIOAI_TEST_LOCAL!=='1'},async t=>{
  let configured=process.env.API_TEST_DATABASE_URL || process.env.DATABASE_URL;
  if(!configured) configured=(await readFile(new URL('../../.env',import.meta.url),'utf8')).match(/^DATABASE_URL\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^['"](.*)['"]$/u,'$1');
  const url=new URL(configured);assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'Integration tests must never use remote PostgreSQL');
  const {Client}=await import('pg'),adminUrl=new URL(url);adminUrl.pathname='/postgres';
  const name='bioai_analytics_test_'+crypto.randomUUID().replaceAll('-','').slice(0,12);
  const admin=new Client({connectionString:adminUrl.href});await admin.connect();let db;
  try {
    await admin.query('CREATE DATABASE '+name);
    const isolated=new URL(url);isolated.pathname='/'+name;
    db=new Client({connectionString:isolated.href});await db.connect();
    // A single disposable pg client has one wire query at a time. Production
    // uses independent Neon HTTP queries; serialize only this test adapter.
    let queryChain=Promise.resolve();
    const sql={query(text,params=[]) {
      const task=queryChain.then(()=>db.query(text,params));queryChain=task.catch(()=>{});
      return task.then(result=>result.rows);
    }};
    const migrations=new URL('../../backend/migrations/',import.meta.url);
    for(const file of (await readdir(migrations)).filter(file=>file.endsWith('.sql')).sort())await sql.query(await readFile(new URL(file,migrations),'utf8'));
    const worker=createWorker(()=>sql);
    await t.test('zero-data dashboard is honest and admin responses are uncached',async()=>{
      const report=await readAnalytics(sql,30,'2026-10-08T09:00:00Z');
      assert.equal(report.summary.page_views,0);assert.equal(report.summary.sessions,0);
      assert.equal(report.daily.length,30);assert.ok(report.daily.every(day=>day.page_views===0&&day.mcp_tool_calls===0));
      assert.equal(report.mcp.tool_calls,0);assert.equal(report.mcp.error_rate,null);assert.equal(report.mcp.avg_duration_ms,null);
      assert.deepEqual(report.top_pages,[]);assert.ok(report.collected_since);
      const headers={authorization:'Bearer '+ENV.ADMIN_TOKEN};
      const response=await worker.fetch(new Request(ORIGIN+'/api/admin/analytics?days=7',{headers}),ENV,{});
      assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
      for(const query of ['days=0','days=90','days=7&days=30','q=PRIVATE','days=7&q=PRIVATE'])
        assert.equal((await worker.fetch(new Request(ORIGIN+'/api/admin/analytics?'+query,{headers}),ENV,{})).status,422);
    });
    await t.test('event retries are idempotent and the database only has a session digest',async()=>{
      const sample=event({referrer_host:'google.com'});
      assert.equal((await worker.fetch(telemetry(sample),ENV,{})).status,202);
      assert.equal((await worker.fetch(telemetry(sample),ENV,{})).status,202);
      const rows=await sql.query('SELECT * FROM usage_web_events');assert.equal(rows.length,1);
      assert.equal(rows[0].session_hash,await sessionHash(sample.session_id,ENV));
      assert.ok(!JSON.stringify(rows).includes(sample.session_id));assert.ok(!JSON.stringify(rows).includes(BROWSER));
      await sql.query("UPDATE usage_web_events SET received_at='2026-10-08T15:59:00Z' WHERE event_id=$1",[sample.event_id]);
      const next=event({session_id:sample.session_id,path:'/#news'});
      await worker.fetch(telemetry(next),ENV,{});
      await sql.query("UPDATE usage_web_events SET received_at='2026-10-08T16:01:00Z' WHERE event_id=$1",[next.event_id]);
      const click=event({session_id:sample.session_id,event_type:'outbound_click',target:'www.nature.com',path:'/#news'});
      await worker.fetch(telemetry(click),ENV,{});
      await sql.query("UPDATE usage_web_events SET received_at='2026-10-08T16:02:00Z' WHERE event_id=$1",[click.event_id]);
      for(const [headers,extra] of [[{'user-agent':'Googlebot/2.1 '+BROWSER},{}],[{'user-agent':'native-agent'},{}],[{}, {traffic_type:'test'}]]) {
        const rejected=event(extra);assert.equal((await worker.fetch(telemetry(rejected,{headers}),ENV,{})).status,202);
        await sql.query("UPDATE usage_web_events SET received_at='2026-10-08T16:03:00Z' WHERE event_id=$1",[rejected.event_id]);
      }
      const report=await readAnalytics(sql,7,'2026-10-09T01:00:00Z');
      assert.equal(report.summary.page_views,2);assert.equal(report.summary.sessions,1);assert.equal(report.summary.clicks,1);
      assert.equal(report.summary.outbound_clicks,1);assert.equal(report.daily.find(day=>day.date==='2026-10-08').page_views,1);
      assert.equal(report.daily.find(day=>day.date==='2026-10-09').page_views,1);
      assert.equal(report.daily.reduce((sum,day)=>sum+day.sessions,0),2,'Distinct daily sessions must not be summed as people');
      assert.deepEqual(report.excluded,{test_events:1,automated_web_events:1,unknown_web_events:1,test_mcp_calls:0});
      assert.equal(report.top_actions[0].target,'www.nature.com');
      assert.equal((await readAnalytics(sql,1,'2026-10-09T01:00:00Z')).summary.page_views,1);
    });
    await t.test('real SDK execution writes success/error metrics but handshake and validation do not',async()=>{
      const tasks=[];const ctx={waitUntil(task){tasks.push(task);}};
      for(const [method,params] of [['initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}}],
        ['tools/list',{}],['tools/call',{name:'search_resources',arguments:{limit:100}}]])
        await worker.fetch(rpcRequest(method,params),ENV,ctx);
      assert.equal(tasks.length,0);assert.equal((await sql.query('SELECT count(*)::integer n FROM usage_mcp_calls'))[0].n,0);
      const success=await rpcPayload(await worker.fetch(rpcRequest('tools/call',{name:'search_resources',arguments:{query:'PRIVATE_QUERY'}}),ENV,ctx));
      assert.equal(success.result.isError,undefined);
      const failed=await rpcPayload(await worker.fetch(rpcRequest('tools/call',{name:'get_company',arguments:{slug:'does-not-exist'}}),ENV,ctx));
      assert.equal(failed.result.isError,true);
      await rpcPayload(await worker.fetch(rpcRequest('tools/call',{name:'search_resources',arguments:{}},{'x-bioai-analytics-test':'1'}),ENV,ctx));
      await Promise.all(tasks);assert.equal(tasks.length,3);
      const records=await sql.query('SELECT * FROM usage_mcp_calls');assert.equal(records.length,3);
      assert.ok(!JSON.stringify(records).includes('PRIVATE_QUERY'));assert.ok(records.every(row=>row.duration_ms>=0));
      await sql.query("UPDATE usage_mcp_calls SET started_at='2026-10-08T16:10:00Z',duration_ms=CASE WHEN success THEN 100 ELSE 300 END");
      const report=await readAnalytics(sql,7,'2026-10-09T01:00:00Z');
      assert.equal(report.mcp.tool_calls,2);assert.equal(report.mcp.successes,1);assert.equal(report.mcp.errors,1);
      assert.equal(report.mcp.error_rate,0.5);assert.equal(report.mcp.avg_duration_ms,200);assert.equal(report.mcp.p95_duration_ms,290);
      assert.equal(report.excluded.test_mcp_calls,1);assert.equal(report.daily.at(-1).mcp_tool_calls,2);
      assert.deepEqual(new Set(report.mcp.tools.map(row=>row.tool)),new Set(['search_resources','get_company']));
    });
    await t.test('retention removes only measurements older than 90 days and preserves collection start',async()=>{
      const original=(await sql.query('SELECT collected_since FROM usage_analytics_state'))[0].collected_since;
      const at='2027-01-06T16:01:00Z'; // exactly 90 days after the second accepted page view
      const removed=(await sql.query('SELECT cleanup_usage_analytics($1::timestamptz) AS result',[at]))[0].result;
      assert.equal(removed.web_events_deleted,1);assert.equal(removed.mcp_calls_deleted,0);
      assert.equal((await sql.query('SELECT count(*)::integer n FROM usage_web_events'))[0].n,5);
      assert.equal((await sql.query('SELECT collected_since FROM usage_analytics_state'))[0].collected_since.toISOString(),original.toISOString());
      await sql.query("SELECT cleanup_usage_analytics('2027-02-01T00:00:00Z')");
      assert.equal((await sql.query('SELECT count(*)::integer n FROM usage_mcp_calls'))[0].n,0);
    });
  } finally {
    await db?.end();
    try {await admin.query('DROP DATABASE IF EXISTS '+name);} finally {await admin.end();}
  }
});
