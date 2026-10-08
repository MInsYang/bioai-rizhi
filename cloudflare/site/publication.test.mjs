import test from 'node:test';
import assert from 'node:assert/strict';
import { publication, getDigest } from './publication.js';
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
