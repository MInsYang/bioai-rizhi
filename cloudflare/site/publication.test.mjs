import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { publication, getDigest, beijingWeek, getWeeklyBriefing, SITEMAP_PAGE_SIZE } from './publication.js';
import { apiRead } from './api.js';
const env={SITE_ORIGIN:'https://bioai.example.test',ASSETS:{fetch:async()=>new Response('<html><head><title>Old</title></head><body><div id="content" aria-live="polite"></div></body></html>')}};
const req=path=>new Request(env.SITE_ORIGIN+path);
test('RSS is topic bounded, XML escaped and preserves preprint/source identity',async()=>{
  const response=await publication(req('/feed.xml?topic=organoid'),env,{},async(path,params)=>{
    assert.equal(path,'/api/records');assert.equal(params.topic,'organoid');
    return {items:[{id:'abc',title:'A & B <test>',canonical_url:'https://example.org/?a=1&b=2',source_name:'Europe PMC',academic:{status:'preprint'},excerpt:'source abstract'}]};
  });
  const xml=await response.text();assert.match(xml,/A &amp; B &lt;test&gt;/);assert.match(xml,/预印本/);assert.match(xml,/ttl>60/);assert.doesNotMatch(xml,/<pubDate>/);
  assert.equal((await publication(req('/feed.xml?topic=unknown'),env,{},()=>{})).status,404);
});
test('resource share page embeds escaped metadata and canonical URL',async()=>{
  const response=await publication(req('/records/abc'),env,{},async()=>({title:'</script><script>alert(1)</script>',content_text:'<img src=x>',canonical_url:'https://example.org/article',source_name:'PubMed'}));
  const html=await response.text();assert.match(html,/rel="canonical"/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>alert/);assert.match(html,/application\/ld\+json/);
});
test('digest read passes stored IDs through publication view to honor source revocation',async()=>{
  const calls=[];const sql={async query(text,args){calls.push({text,args});return calls.length===1?[{digest_date:'2026-10-08',record_ids:['test-id']}]:[];}};
  const d=await getDigest(sql,'2026-10-08');assert.deepEqual(d.items,[]);assert.match(calls[1].text,/FROM public_records/);assert.deepEqual(calls[1].args[0],['test-id']);assert.match(calls[1].text,/ai_related/);assert.ok(calls[1].args[1].includes('nature'));assert.equal(d.total_records,0);assert.equal(d.record_ids,undefined);
});
test('replacement metacharacters remain literal and impossible dates never reach PostgreSQL',async()=>{
  const title="Dollar $& $' $` report";
  const response=await publication(req('/records/abc'),env,{},async()=>({title,content_text:'abstract',academic:{status:'preprint'}}));
  const html=await response.text();assert.equal((html.match(/<title>/g)||[]).length,1);assert.equal((html.match(/id="content"/g)||[]).length,1);assert.match(html,/预印本/);
  assert.equal((await publication(req('/api/digest?date=2026-99-99'),env,{query(){throw new Error('should not query');}},()=>{})).status,422);
});

test('homepage/topic/company HTML contains real links, evidence boundaries and only verified sources',async()=>{
  const record={id:'resource-1',title:'真实原文',canonical_url:'https://official.example/article',source_name:'Official source',published_at:'2026-10-06',fetched_at:'2026-10-08',excerpt:'Source excerpt'};
  const event={id:'event-1',title:'公开合作',event_type:'partnership',summary:'有来源的事件说明',evidence_count:1,published_at:'2026-10-06'};
  const company={slug:'fixture-company',name_en:'Fixture Company',track:'AI与模型数据',region:'中国',focus:['模型'],official_website:'https://official.example/',aliases:['Fixture'],sources:[
    {name:'Verified source',url:'https://official.example/news',verified:true,enabled:true},
    {name:'Unverified source',url:'https://pending.example/news',verified:false,enabled:false},
    {name:'Unsafe source',url:'javascript:alert(1)',verified:true,enabled:true},
  ]};
  const read=async(path,params)=>{
    if(path.startsWith('/api/companies/'))return company;
    if(path==='/api/records'){assert.equal(params.days,'0');return {items:[record]};}
    if(path==='/api/events'){assert.equal(params.days,'0');return {items:[event]};}
    if(path==='/api/companies')return {items:[company]};
    throw new Error(path);
  };
  for(const path of ['/','/topics/virtual-cell','/companies/fixture-company']) {
    const response=await publication(req(path),env,{},read);
    const html=await response.text();
    assert.equal(response.status,200);
    assert.match(html,/href="\/records\/resource-1"/);
    assert.match(html,/href="\/events\/event-1"/);
    assert.match(html,/data-search-editorial/);
    assert.match(html,/href="\/guides\/virtual-cell-models"/);
    assert.match(html,/本站收录/);
    assert.match(html,/href="https:\/\/official\.example\/article"/);
  }
  const html=await(await publication(req('/companies/fixture-company'),env,{},read)).text();
  assert.match(html,/Verified source/);
  assert.doesNotMatch(html,/pending\.example|Unverified source|javascript:|Unsafe source/);
  const schema=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(schema['@type'],'AboutPage');assert.equal(schema.mainEntity['@type'],'Organization');
});

test('sitemap index paginates every eligible category beyond old record cap and emits only truthful guide lastmod',async()=>{
  const calls=[];
  const sql={async query(text,args){calls.push({text,args});return [{companies:201,records:401,events:1,digests:1}];}};
  const index=await(await publication(req('/sitemap.xml'),env,sql,()=>{throw new Error('must use publication views');})).text();
  assert.match(index,/<sitemapindex/);
  assert.match(index,/\/sitemaps\/records\/3.xml/);
  assert.match(index,/\/sitemaps\/companies\/2.xml/);
  assert.match(index,/\/sitemaps\/events\/1.xml/);
  assert.match(index,/\/sitemaps\/digests\/1.xml/);
  assert.match(calls[0].text,/public_resources/);assert.match(calls[0].text,/public_events/);assert.match(calls[0].text,/public_records/);
  assert.match(calls[0].text,/in_scope/);assert.match(calls[0].text,/ai_related/);assert.doesNotMatch(calls[0].text,/90 days|LIMIT 100/);
  const pages=await(await publication(req('/sitemaps/pages/1.xml'),env,{},()=>{})).text();
  assert.match(pages,/\/guides\/virtual-cell-models<\/loc><lastmod>2026-10-08/);
  assert.match(pages,/\/briefings<\/loc><\/url>/);
  assert.doesNotMatch(pages,/<priority>|<changefreq>/);
  const pageCalls=[];
  const pageSql={async query(text,args){pageCalls.push({text,args});return [{id:'later-resource'}];}};
  const recordPage=await(await publication(req('/sitemaps/records/2.xml'),env,pageSql,()=>{})).text();
  assert.match(recordPage,/\/records\/later-resource/);
  assert.doesNotMatch(recordPage,/<lastmod>/);
  assert.deepEqual(pageCalls[0].args.slice(-2),[SITEMAP_PAGE_SIZE,SITEMAP_PAGE_SIZE]);
  assert.match(pageCalls[0].text,/ORDER BY r.id/);
  assert.equal((await publication(req('/sitemaps/records/0.xml'),env,{},()=>{})).status,404);
  assert.equal((await publication(req('/sitemaps/pages/2.xml'),env,{},()=>{})).status,404);
});

test('weekly window changes at Beijing Monday midnight and totals are counted before display limits',async()=>{
  assert.equal(beijingWeek('2026-10-04T15:59:59Z').start,'2026-09-27T16:00:00.000Z');
  assert.equal(beijingWeek('2026-10-04T16:00:00Z').start,'2026-10-04T16:00:00.000Z');
  const at='2026-10-08T03:00:00Z',calls=[];
  const sql={async query(text,args){calls.push({text,args});
    if(text.startsWith('SELECT count(*) AS total'))return [{total:'42',industry_count:'40',academic_count:'2',source_count:'3',event_count:'1'}];
    if(text.startsWith('SELECT ti.id'))return [{id:'virtual-cell',count:'9'}];
    if(text.startsWith('SELECT e.id'))return [{id:'event',title:'Test event'}];
    return [{id:'record',title:'Test record'}];
  }};
  const digest=await getWeeklyBriefing(sql,at);
  assert.equal(digest.total,42);assert.equal(digest.items.length,1);assert.equal(digest.record_limit,30);
  assert.equal(digest.topics.find(t=>t.id==='virtual-cell').count,9);
  assert.equal(digest.topics.find(t=>t.id==='organoid').count,0);
  assert.deepEqual(calls[0].args.slice(0,2),['2026-10-04T16:00:00.000Z','2026-10-08T03:00:00.000Z']);
  assert.doesNotMatch(calls[0].text,/LIMIT/);assert.match(calls[0].text,/r.fetched_at >=/);
  assert.match(calls[0].text,/public_resources/);assert.match(calls[3].text,/public_events/);
});

test('empty stored digests remain readable but are excluded from indexing',async()=>{
  const sql={query:async(text)=>text.startsWith('SELECT *')?[{digest_date:'2026-10-08',record_ids:['record'],total_records:1}]:[]};
  const response=await publication(req('/digest/2026-10-08'),env,sql,()=>{});
  assert.equal(response.status,200);assert.equal(response.headers.get('x-robots-tag'),'noindex');
  const html=await response.text();assert.match(html,/此期当前没有公开可见的原文/);assert.match(html,/noindex,follow/);
});

// New SQL must be exercised against PostgreSQL, including read-time revocation.
// The test creates a disposable local database and never migrates the app DB.
let localUrl=process.env.API_TEST_DATABASE_URL;
if(!localUrl) {
  try {localUrl=(await readFile(new URL('../../.env',import.meta.url),'utf8')).match(/^DATABASE_URL\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^['"](.*)['"]$/,'$1');}catch{/* optional local PostgreSQL */}
}
let isLocal=false;
try{isLocal=['localhost','127.0.0.1'].includes(new URL(localUrl).hostname);}catch{/* missing local config */}
test('PostgreSQL weekly/sitemap/digest queries share source, scope and journal gates', {skip:!isLocal}, async()=>{
  const {Client,Pool}=await import('pg');
  const adminUrl=new URL(localUrl);adminUrl.pathname='/postgres';
  const control=new Client({connectionString:adminUrl.href});await control.connect();
  const name='bioai_publication_test_'+crypto.randomUUID().replaceAll('-','');
  const closedConnections=[];
  let pool;
  try {
    await control.query(`CREATE DATABASE "${name}"`);
    const isolated=new URL(localUrl);isolated.pathname='/'+name;
    pool=new Pool({connectionString:isolated.href,max:4});
    // Subscribe before teardown starts, including clients that close early.
    // Pool.end() may resolve while a removed client's socket is still closing.
    pool.on('connect',client=>{
      closedConnections.push(new Promise(resolve=>client.once('end',resolve)));
    });
    const sql={query:async(text,args=[]) => (await pool.query(text,args)).rows};
    const migrations=new URL('../../backend/migrations/',import.meta.url);
    for(const file of (await readdir(migrations)).filter(f=>f.endsWith('.sql')).sort())await sql.query(await readFile(new URL(file,migrations),'utf8'));
    await sql.query("INSERT INTO polling_profiles VALUES ('P0',1),('P1',6),('P2',24)");
    const cid=crypto.randomUUID(),sid=crypto.randomUUID();
    await sql.query("INSERT INTO companies(id,slug,name_en,track,region,official_website,priority) VALUES ($1,'source-fixture','Source Fixture','AI与模型数据','中国','https://source.example/','P0')",[cid]);
    await sql.query("INSERT INTO sources(id,company_id,registry_key,name,source_type,url,poll_profile,verified,verification_status,adapter) VALUES ($1,$2,'source-fixture','SOURCE FIXTURE','rss','https://source.example/feed','P0',true,'verified','rss')",[sid,cid]);
    const fixtures=[
      {title:'Selected virtual-cell paper',academic:{status:'indexed',journal:'Nature Methods',doi:'10.1234/test'},classification:{in_scope:true,ai_related:true,topic_ids:['virtual-cell']}},
      {title:'Selected paper duplicate',academic:{status:'indexed',journal:'Nature Methods',doi:'10.1234/test'},classification:{in_scope:true,ai_related:true,topic_ids:['virtual-cell']}},
      {title:'Industry partnership',industry_classification:{relevant:true},classification:{in_scope:true,ai_related:true,topic_ids:['drug-discovery']}},
      {title:'Preprint excluded',academic:{status:'preprint',journal:'Nature'},classification:{in_scope:true,ai_related:true,topic_ids:['virtual-cell']}},
      {title:'Out of scope excluded',classification:{in_scope:false,ai_related:true,topic_ids:['virtual-cell']}},
      {title:'Industry scope excluded',industry_classification:{relevant:false},classification:{in_scope:true,ai_related:true,topic_ids:['virtual-cell']}},
      {title:'Non-AI paper excluded',academic:{status:'indexed',journal:'Nature Methods'},classification:{in_scope:true,ai_related:false,topic_ids:['virtual-cell']}},
    ];
    const ids=[];
    for(const [index,fixture] of fixtures.entries()) {
      const id=crypto.randomUUID();ids.push(id);
      const {title,...payload}=fixture;
      await sql.query(`INSERT INTO raw_items(id,source_id,external_id,title,canonical_url,published_at,fetched_at,content_text,content_hash,raw_payload)
        VALUES ($1::uuid,$2,$1::uuid::text,$3,$4,'2025-01-01',$5,'Fixture evidence',$1::uuid::text,$6::jsonb)`,[id,sid,title,'https://source.example/'+id,'2026-10-08T0'+(index+1)+':00:00Z',JSON.stringify(payload)]);
    }
    const eventId=crypto.randomUUID();
    await sql.query("INSERT INTO events(id,event_type,title,summary,published_at,confidence,review_status) VALUES ($1,'partnership','Fixture event','Fixture summary','2026-10-06',1,'approved')",[eventId]);
    await sql.query("INSERT INTO event_evidence(event_id,raw_item_id,evidence_text) VALUES ($1,$2,'Fixture evidence')",[eventId,ids[2]]);
    await sql.query("INSERT INTO event_entities(event_id,entity_type,entity_id,role) VALUES ($1,'company',$2,'subject')",[eventId,cid]);
    // Frozen digest intentionally stores a superset; reads still apply scope gates.
    await sql.query("INSERT INTO daily_digests(digest_date,window_start,window_end,record_ids,total_records) VALUES ('2026-10-08','2026-10-07','2026-10-08T08:00:00Z',$1,7)",[ids]);
    const weekly=await getWeeklyBriefing(sql,'2026-10-08T08:00:00Z');
    assert.equal(weekly.total,2);assert.equal(weekly.academic_count,1);assert.equal(weekly.industry_count,1);assert.equal(weekly.event_count,1);
    assert.equal(weekly.items.length,2);assert.ok(weekly.items.every(r=>!r.title.includes('excluded')));
    assert.equal((await getDigest(sql,'2026-10-08')).items.length,3); // Both frozen DOI source copies stay independently attributable.
    const read=(path,params)=>apiRead(path,params,sql);
    const recordMap=await(await publication(req('/sitemaps/records/1.xml'),env,sql,read)).text();
    assert.equal((recordMap.match(/<url>/g)||[]).length,2);
    const company=await(await publication(req('/companies/source-fixture'),env,sql,read)).text();
    assert.match(company,/Fixture event/);assert.match(company,/SOURCE FIXTURE/);
    const index=await(await publication(req('/sitemap.xml'),env,sql,read)).text();
    assert.match(index,/\/sitemaps\/events\/1.xml/);assert.match(index,/\/sitemaps\/digests\/1.xml/);
    await sql.query("UPDATE sources SET verified=false,verification_status='pending' WHERE id=$1",[sid]);
    const revoked=await getWeeklyBriefing(sql,'2026-10-08T08:00:00Z');
    assert.equal(revoked.total,0);assert.equal(revoked.event_count,0);assert.deepEqual(revoked.items,[]);
    assert.equal((await getDigest(sql,'2026-10-08')).items.length,0);
    const after=await(await publication(req('/sitemap.xml'),env,sql,read)).text();
    assert.doesNotMatch(after,/\/sitemaps\/(records|events|digests)\//);
    assert.equal((await publication(req('/sitemaps/records/1.xml'),env,sql,read)).status,404);
    const revokedCompany=await(await publication(req('/companies/source-fixture'),env,sql,read)).text();
    assert.doesNotMatch(revokedCompany,/Fixture event|SOURCE FIXTURE/);
  } finally {
    try {
      await pool?.end();
      await Promise.all(closedConnections);
      // Server backends can outlive the local socket-end callback briefly.
      // Wait for this unique database only; never terminate closing clients.
      for(let attempt=0;attempt<20;attempt++) {
        const sessions=(await control.query('SELECT count(*)::integer n FROM pg_stat_activity WHERE datname=$1',[name])).rows[0].n;
        if(!sessions)break;
        if(attempt===19)throw new Error('Disposable publication database still has active connections after pool shutdown');
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      await control.query(`DROP DATABASE IF EXISTS "${name}"`);
    } finally {
      await control.end();
    }
  }
});
