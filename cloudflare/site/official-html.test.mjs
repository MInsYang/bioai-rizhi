import assert from 'node:assert/strict';
import test from 'node:test';
import {officialHTML,indexArticles,extractOfficialArticle} from './official-html.js';

const source = {url:'https://official.example/news',company_id:'company-1',config:{official_html_verified:true,
  allowed_hosts:['official.example'],article_path_prefixes:['/article/'],article_selector:'.release',index_max_articles:2}};
const page = `<html><meta property="og:title" content="AI medicine partner"><script type="application/ld+json">{"@type":"NewsArticle","headline":"AI drug discovery collaboration","datePublished":"2026-09-21","dateModified":"2026-10-08"}</script>
  <h1>AI drug discovery collaboration</h1><div class="release"><div><p>The companies enter a multi-year collaboration to develop AI-designed medicines and exchange independently verified biological data.</p></div><script>injected() &lt;a href="https://evil.example"&gt;</script></div></html>`;

test('HTML index rejects unrelated hosts and paths, deduplicates and bounds article requests',()=>{
  const body = '<script><a href="/article/injected"></script><a href="https://evil.example/article/x"><a href="/jobs/x"><a href="/article/a?utm_source=x"><a href="/article/a"><a href="/article/b"><a href="/article/c">';
  assert.deepEqual(indexArticles(body,source),['https://official.example/article/a','https://official.example/article/b']);
});

test('Article metadata retains real publication date, strips scripts and preserves modified date separately',()=>{
  const result = extractOfficialArticle(page,source,'https://official.example/article/a');
  assert.equal(result.published_at,'2026-09-21T00:00:00.000Z');
  assert.equal(result.provenance.date_modified_raw,'2026-10-08');
  assert.ok(result.content_text.includes('independently verified biological data'));
  assert.ok(!result.content_text.includes('injected'));
});

test('No date is fabricated and a missing verified article container fails',()=>{
  const noDate = page.replace(/,"datePublished":"2026-09-21"/,'');
  assert.equal(extractOfficialArticle(noDate,source,'https://official.example/article/a').published_at,null);
  assert.throws(()=>extractOfficialArticle('<h1>AI drugs</h1><nav>Some long unrelated navigation and disclaimer text that must not become an article.</nav>',source,'https://official.example/article/a'),/container/);
  assert.throws(()=>extractOfficialArticle(page,source,'https://evil.example/article/a'),/allowlist/);
});

test('Repeated empty Webflow containers and navigation labels do not replace the actual body or date',()=>{
  const config={...source.config,publication_date_selector:'.date'};
  const body='<h1>AI medicine collaboration</h1><div class="release"></div><span class="date">Our Team</span><div class="release"><div>The companies develop new AI-designed therapies through a multi-year research partnership that combines drug discovery and experimental biology.</div></div><span class="date">September 21, 2026</span>';
  const result=extractOfficialArticle(body,{...source,config},'https://official.example/article/a');
  assert.equal(result.published_at,'2026-09-21T00:00:00.000Z');
  assert.equal(result.provenance.publication_date_precision,'date');
  assert.equal(result.provenance.publication_date_raw,'September 21, 2026');
  assert.ok(result.content_text.startsWith('The companies develop'));
});

test('Impossible ISO calendar dates are retained as unknown',()=>{
  assert.equal(extractOfficialArticle(page.replace('2026-09-21','2026-02-31'),source,'https://official.example/article/a').published_at,null);
});

test('One HTTP page per turn reaches a durable checkpoint before any article and retains classifier rejection',async()=>{
  const calls = [], records = [];
  const helpers = {request:async url=>{calls.push(url);return {body:url===source.url?'<a href="/article/a"><a href="/article/b">':page,url,status:200,headers:new Headers(),bytes:100};},
    record:async (_source,fields)=>{records.push(fields);return records.length===1 ? {...fields,raw_payload:{}} : null;}};
  let result = await officialHTML(source,{}, {},helpers);
  assert.equal(calls.length,1);assert.equal(result.done,false);assert.equal(result.records.length,0);
  result = await officialHTML(source,result.state,{},helpers);
  assert.equal(calls.length,2);assert.equal(result.done,false);assert.equal(result.records.length,1);
  result = await officialHTML(source,result.state,{},helpers);
  assert.equal(calls.length,3);assert.equal(result.done,true);assert.equal(result.records.length,0);
  assert.equal(result.state.retrieved_total,2);assert.equal(result.state.matched_total,1);assert.equal(result.state.bytes_total,300);
});

test('Corrupt checkpoints and unverified sources never reach transport',async()=>{
  let calls=0;
  const helpers={request:async()=>{calls++;},record:async()=>null};
  await assert.rejects(officialHTML(source,{article_urls:['https://evil.example/article/a'],offset:0},{},helpers),/allowlist/);
  await assert.rejects(officialHTML({...source,config:{...source.config,official_html_verified:false}},{},{},helpers),/verified/);
  assert.equal(calls,0);
});

test('Upstream 429 passes through unchanged for the shared retry/backoff gate',async()=>{
  const upstream=Object.assign(new Error('HTTP 429'),{http_status:429,retry_after:600});
  await assert.rejects(officialHTML(source,{},{},{request:async()=>{throw upstream;},record:async()=>null}),error=>error===upstream);
});
