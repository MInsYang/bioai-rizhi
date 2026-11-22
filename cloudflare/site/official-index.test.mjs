import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {extractOfficialIndex,officialHTML} from './official-html.js';
import {consume} from './ingestion.js';
import {classify} from './topics.js';

// Exact card fields from the saved official /news snapshot (SHA-256
// a64770a57a2c63a5d08d766e54a3ef0ac79bc4c46736b158b9d74aac06b9f845).
// Only non-semantic images/layout are omitted from this self-contained fixture.
const cards = [
  {primary:'Press',date:'November 18, 2026',title:'Iambic Presents Preclinical Data for CDK2/4 Inhibitor IAM-C1 and Brain-Penetrant KIF18A Inhibitor IAM217 at 2026 EORTC-NCI-AACR Symposium',href:'https://ir.iambic.ai/news-releases/news-release-details/iambic-presents-preclinical-data-cdk24-inhibitor-iam-c1-and'},
  {primary:'Publications',date:'November 18, 2026',title:'IAM-C1, a Potent and Selective Dual CDK2/CDK4 Inhibitor, Demonstrates Robust Antitumor Activity and a Favorable Preclinical Tolerability Profile',href:'https://cdn.prod.website-files.com/64c03f218d60985b40eeeae5/6af4f1f78573f7d027a01f96_IAM-C1-Tri2026_20261109.pdf'},
  {primary:'Publications',date:'November 18, 2026',title:'IAM217: a Novel, Brain-penetrant KIF18A Inhibitor for Targeting Chromosomal Instability in Cancer',href:'https://cdn.prod.website-files.com/64c03f218d60985b40eeeae5/6af4f1f7e5bd315394b4c04a_IAM217_ENA2026_Abstract_330.pdf'},
  {primary:'Press',date:'November 16, 2026',title:'Iambic Provides Business Updates and Third Quarter 2026 Financial Results',href:'https://ir.iambic.ai/news-releases/news-release-details/iambic-provides-business-updates-and-third-quarter-2026'},
  {primary:'Press',date:'November 9, 2026',title:'Iambic to participate in Jefferies Global Healthcare Conference',href:'/post/iambic-to-participate-in-jefferies-global-healthcare-conference'},
  {primary:'Press',date:'October 26, 2026',title:'Iambic Presents Updated IAM1363 Clinical Data at ESMO 2026, Showing Durable Responses with a Favorable Tolerability Profile in Heavily Pretreated Participants with HER2-Driven Cancers',href:'/post/iambic-presents-updated-iam1363-clinical-data-at-esmo-2026'},
  {primary:'Publications',date:'October 23, 2026',title:'Safety and Activity of IAM1363, a CNS-penetrant HER2 TKI in Participants with HER2 Altered Advanced Cancers',href:'https://cdn.prod.website-files.com/64d1614b6114857407c79035/6adf7d2c6814a594b84a6cee_IAM1363-01%20ESMO%202026%20Poster_2026-10-16%20Final%20(1).pdf'},
  {primary:'Press',date:'October 14, 2026',title:'Iambic Announces Pricing of Initial Public Offering',href:'/post/iambic-announces-pricing-of-initial-public-offering'},
  {primary:'Press',date:'October 5, 2026',title:'Iambic Submits IND for a Potentially Brain-Penetrant KIF18A Inhibitor IAM217, Its Second Wholly Owned AI-Discovered Candidate',href:'/post/iambic-submits-ind-for-a-potentially-brain-penetrant-kif18a-inhibitor-iam217-its-second-wholly-owned-ai-discovered-candidate'},
  {primary:'Press',date:'September 21, 2026',title:'Iambic Launches Enchant v3 – Molecular Superintelligence Designed to Advance End-to-End Drug Discovery & Development',href:'/post/iambic-launches-enchant-v3---molecular-superintelligence-designed-to-advance-end-to-end-drug-discovery-development'},
];
const source = {id:'dc201082-adf3-5368-8746-11de72fda916',registry_key:'iambic-official-newsroom',adapter:'official_html',
  url:'https://www.iambic.ai/news',config:{collection_mode:'index_metadata',official_index_verified:true,official_html_verified:true,
    allowed_hosts:['www.iambic.ai','ir.iambic.ai'],article_path_prefixes:['/post/','/news-releases/news-release-details/'],
    article_selector:'.rich-text',index_max_articles:8,query_version:'official-index-2026-11-v1',
    content_domain:'industry',official_industry_source:true,ai_biopharma_identity_verified:true}};
const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const cardHTML = card => `<div data-news-primary="">${escape(card.primary)}</div><div data-news-date="">${escape(card.date)}</div><div data-news-title="">${escape(card.title)}</div><a class="link-w-arrow w-inline-block" href="${escape(card.href)}">Read more</a>`;
const indexHTML = (items=cards) => `<!doctype html><html><body><div data-news-featured="">${cardHTML(items[0])}</div><div data-news-archive=""><div role="list">${items.slice(1).map(card=>`<div role="listitem"><div class="platform-cms-card">${cardHTML(card)}</div></div>`).join('')}</div><nav><a href="?page=2">Load more</a></nav></div><div hidden><a href="/post/jpm-healthcare-conference-2026">Old PDF wrapper</a><a href="/post/stale-empty-press-stub">Old hidden tab</a></div><script>const fake='<div data-news-featured="">not a real card</div>';</script></body></html>`;
const changed = (index,values) => cards.map((card,i)=>i===index?{...card,...values}:card);

test('approved official cards yield seven Press metadata records and exclude exactly three PDFs',()=>{
  const result=extractOfficialIndex(indexHTML(),source);
  assert.equal(result.articles.length,7);assert.equal(result.excluded_pdf_count,3);assert.equal(result.card_count,10);
  assert.deepEqual(result.articles.map(article=>article.title),cards.filter(card=>card.primary==='Press').map(card=>card.title));
  assert.equal(result.articles.filter(article=>article.canonical_url.startsWith('https://ir.iambic.ai/')).length,2);
  for(const article of result.articles){assert.equal(article.content_text,'');assert.match(article.published_at,/^2026-\d{2}-\d{2}T00:00:00\.000Z$/);}
  assert.ok(!JSON.stringify(result).includes('jpm-healthcare'));assert.ok(!JSON.stringify(result).includes('stale-empty'));
});

test('index mode is restricted to the exact reviewed source, hosts, paths and proof flag',()=>{
  for(const bad of [
    {...source,registry_key:'another-source'}, {...source,url:'https://www.iambic.ai/news/'},
    {...source,config:{...source.config,official_index_verified:false}},
    {...source,config:{...source.config,allowed_hosts:[...source.config.allowed_hosts,'evil.example']}},
    {...source,config:{...source.config,article_path_prefixes:['/post/','/']}},
    {...source,config:{...source.config,collection_mode:'metadata_auto_fallback'}},
  ])assert.throws(()=>extractOfficialIndex(indexHTML(),bad),error=>error.permanent===true);
});

test('malicious or unreviewed card URLs fail without silently omitting a Press card',()=>{
  for(const href of ['javascript:alert(1)','http://www.iambic.ai/post/a','https://evil.example/post/a',
    'https://user:password@www.iambic.ai/post/a','https://www.iambic.ai:8443/post/a',
    'https://www.iambic.ai/news-releases/news-release-details/a','https://ir.iambic.ai/post/a',
    '/post/%2e%2e/other','/post/a%2fb','/post/a?next=https://evil.example',
    'https://ir.iambic.ai/unreviewed/new-release',cards[1].href]) {
    assert.throws(()=>extractOfficialIndex(indexHTML(changed(0,{href})),source),error=>error.permanent===true,href);
  }
  assert.throws(()=>extractOfficialIndex(indexHTML(changed(1,{href:'/post/unreviewed-publication'})),source),/unreviewed/);
  assert.throws(()=>extractOfficialIndex(indexHTML(changed(1,{primary:'Unknown category'})),source),/unreviewed/);
});

test('missing, duplicate, malformed or overlong fields and bad calendar dates fail the entire index',()=>{
  for(const date of ['February 30, 2026','February 29, 2025','April 31, 2026','11/18/2026','2026-11-18T09:00:00Z','']) {
    assert.throws(()=>extractOfficialIndex(indexHTML(changed(0,{date})),source),error=>error.permanent===true,date);
  }
  for(const html of [indexHTML(changed(0,{title:''})),indexHTML(changed(0,{title:'x'.repeat(1001)})),
    indexHTML().replace('data-news-date=""','data-news-date-removed=""'),
    indexHTML().replace('data-news-title=""','data-news-title="" data-news-title="duplicate"'),
    indexHTML().replace('Read more</a>','Read more</a><a href="/post/unreviewed-link">Extra</a>'),
    indexHTML().replace('</body>',''),indexHTML().replace('data-news-archive=""','data-news-archive-removed=""')]) {
    assert.throws(()=>extractOfficialIndex(html,source),error=>error.permanent===true);
  }
});

test('bounds reject a ninth Press card, a duplicate URL, deep markup and oversized input',()=>{
  const eighth={...cards[0],href:'/post/eighth-reviewed-release'};
  assert.equal(extractOfficialIndex(indexHTML([...cards,eighth]),source).articles.length,8);
  assert.throws(()=>extractOfficialIndex(indexHTML([...cards,eighth,{...eighth,href:'/post/ninth-release'}]),source),/bound/);
  assert.throws(()=>extractOfficialIndex(indexHTML([...cards,cards[0]]),source),/duplicate/);
  assert.throws(()=>extractOfficialIndex(indexHTML().replace('<body>','<body>'+'<div>'.repeat(64)),source),/deep/);
  assert.throws(()=>extractOfficialIndex(' '.repeat(1_500_001),source),/bound/);
});

test('adapter fetches only the fixed index and passes empty bodies with precise index provenance',async()=>{
  const html=indexHTML(),calls=[],saved=[],now=Date.parse('2026-11-22T04:00:00Z');
  const helpers={request:async(url,hosts,_env,_headers,options)=>{
    calls.push(url);assert.deepEqual(hosts,['www.iambic.ai']);assert.equal(options.allow_redirects,false);
    return {body:html,url,status:200,headers:new Headers(),bytes:Buffer.byteLength(html)};
  },record:async(_source,fields,payload)=>{saved.push({fields,payload});return {...fields,raw_payload:payload};}};
  // An old full-text checkpoint must not trigger even one detail request.
  const result=await officialHTML(source,{article_urls:['https://www.iambic.ai/post/old-checkpoint'],offset:0},{NOW:()=>now},helpers);
  assert.deepEqual(calls,[source.url]);assert.equal(result.done,true);assert.equal(result.records.length,7);
  assert.equal(result.state.collection_mode,'index_metadata');assert.equal(result.state.excluded_pdf_count,3);
  for(const {fields,payload} of saved) {
    assert.equal(fields.content_text,'');assert.equal(payload.content_level,'index_metadata');assert.equal(payload.format,'official_index');
    assert.equal(payload.fulltext_status,'not_fetched');assert.equal(payload.index_url,source.url);assert.equal(payload.index_fetched_at,new Date(now).toISOString());
    assert.equal(payload.index_content_hash,createHash('sha256').update(html).digest('hex'));assert.equal(payload.publication_date_precision,'date');
    assert.equal(payload.classification_scope,'title_only');assert.ok(!('summary' in payload));assert.ok(!('excerpt' in payload));assert.ok(!('abstract' in payload));
  }
});

const JOB='10000000-0000-4000-8000-000000000001',TOKEN='20000000-0000-4000-8000-000000000001';
function sqlMock() {
  const calls=[];return {calls,async query(text,params=[]) {
    calls.push({text,params});
    if(text.includes('ingestion_claim'))return [{result:{status:'claimed',job:{id:JOB,lease_token:TOKEN,checkpoint:{}},source}}];
    if(text.includes('ingestion_finish'))return [{result:{status:'succeeded'}}];
    if(text.includes('ingestion_fail'))return [{result:{status:'dead'}}];
    throw new Error('Unexpected SQL in index-only collection');
  }};
}
const message = () => ({body:{job_id:JOB},acked:0,ack(){this.acked++;},retry(){assert.fail('Permanent index failure must not retry immediately');}});

test('ingestion retains all seven directory entries, never fills the empty body and preserves actual title classification',async()=>{
  const sql=sqlMock(),m=message(),calls=[];
  const env={NOW:()=>Date.parse('2026-11-22T04:00:00Z'),FETCH:async url=>{calls.push(url);return new Response(indexHTML(),{status:200});}};
  await consume({messages:[m]},env,sql);
  assert.deepEqual(calls,[source.url]);assert.equal(m.acked,1);
  const finish=sql.calls.find(call=>call.text.includes('ingestion_finish'));assert.ok(finish);
  const rows=JSON.parse(finish.params[2]),metrics=JSON.parse(finish.params[4]);assert.equal(rows.length,7);
  for(const row of rows) {
    assert.equal(row.content_text,'');assert.equal(row.raw_payload.http_status,200);assert.equal(row.raw_payload.fetched_url,source.url);
    assert.equal(row.raw_payload.classification_scope,'title_only');assert.equal(row.raw_payload.classification.input_scope,'title_only');
    assert.deepEqual(row.raw_payload.classification,{...classify(row.title,''),input_scope:'title_only'});
    assert.equal(row.raw_payload.retrieval.request_scope,'official_index_only');
    assert.ok(!('summary' in row.raw_payload));assert.ok(!('excerpt' in row.raw_payload));assert.ok(!('abstract' in row.raw_payload));
  }
  const routine=rows.find(row=>row.title.includes('Financial Results'));assert.equal(routine.raw_payload.industry_classification.relevant,false);
  assert.equal(routine.raw_payload.classification.in_scope,false);
  assert.equal(metrics.collection_mode,'index_metadata');assert.equal(metrics.fulltext_status,'not_fetched');assert.equal(metrics.retrieved_total,7);
  assert.equal(metrics.matched_total,7);assert.equal(metrics.excluded_pdf_count,3);assert.ok(!sql.calls.some(call=>call.text.includes('ingestion_checkpoint')));
});

test('an index redirect, non-200 response or changed card fails without a detail request or success timestamp update',async()=>{
  for(const response of [new Response('',{status:302,headers:{Location:'https://www.iambic.ai/post/forbidden-detail'}}),
    new Response(null,{status:304}),new Response('denied',{status:403}),new Response(indexHTML(changed(9,{date:'September 31, 2026'})),{status:200})]) {
    const sql=sqlMock(),m=message(),calls=[];
    await consume({messages:[m]},{FETCH:async url=>{calls.push(url);return response;}},sql);
    assert.deepEqual(calls,[source.url]);assert.ok(sql.calls.some(call=>call.text.includes('ingestion_fail')));
    assert.ok(!sql.calls.some(call=>call.text.includes('ingestion_finish')));assert.equal(m.acked,1);
  }
});
