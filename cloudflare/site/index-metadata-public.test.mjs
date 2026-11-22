import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRead, ApiError } from './api.js';
import { publication, getDigest, getWeeklyBriefing } from './publication.js';
import { handleMcp } from './mcp.js';
import { ownedText } from './locales.js';

const base = 'https://bioai.example.test';
const id = 'e7560bc9-e3f5-4660-88f5-4c98db1b691c';
const provenance = {format:'official_index',index_url:'https://www.iambic.ai/news',index_fetched_at:null,
  index_content_hash:'a'.repeat(64),publication_date_raw:'November 18, 2026',publication_date_precision:'date'};
const directory = () => ({id,title:'Original official title',canonical_url:'https://ir.iambic.ai/news-releases/example',
  source_name:'Iambic newsroom',registry_key:'iambic-official-newsroom',company_slug:'iambic-therapeutics',
  published_at:'2026-11-18T00:00:00Z',fetched_at:'2026-11-22T02:00:00Z',content_level:'index_metadata',
  fulltext_status:'not_fetched',provenance:{...provenance,private_adapter_field:'NOT_PUBLIC'},
  excerpt:'MUST_NOT_BECOME_AN_ABSTRACT',content_text:'MUST_NOT_BECOME_FULL_TEXT',
  classification:{in_scope:false,topic_ids:[],method:'automated_keyword_v1',input_scope:'title_only'},industry_classification:{relevant:false}});
const historical = () => ({id:'2cdabf10-fc58-4797-ac40-bd709d387784',title:'Historical source title',
  canonical_url:'https://www.iambic.ai/post/example',source_name:'Iambic newsroom',content_text:'Historical stored source text.',excerpt:'Historical source excerpt.'});
const assets = {SITE_ORIGIN:base,ASSETS:{fetch:async()=>new Response('<html lang="zh-CN"><head><title>Home</title></head><body><div id="content" aria-live="polite"></div></body></html>')}};

test('API exposes whitelisted directory provenance, empty text, and no new completeness claim for legacy records', async () => {
  const queries=[];
  const sql={query:async(text,args)=>{queries.push({text,args});return text.startsWith('SELECT count')?[{n:1}]:[directory()];}};
  const result=await apiRead('/api/records',{source:'iambic-official-newsroom',days:0},sql);
  assert.equal(result.items[0].content_level,'index_metadata');
  assert.equal(result.items[0].fulltext_status,'not_fetched');
  assert.equal(result.items[0].excerpt,'');
  assert.deepEqual(result.items[0].provenance,provenance);
  assert.equal(result.items[0].classification.in_scope,false);
  assert.equal(result.focused,false);
  assert.match(queries[1].text,/jsonb_build_object\(/);
  assert.doesNotMatch(queries[1].text,/SELECT r\.\*| AS raw_payload/);
  const detail=await apiRead('/api/records/'+id,{}, {query:async()=>[directory()]});
  assert.equal(detail.content_text,'');
  assert.deepEqual(detail.provenance,provenance);
  const old=await apiRead('/api/records/'+id,{}, {query:async()=>[historical()]});
  assert.equal(old.content_text,'Historical stored source text.');
  assert.equal(old.content_level,null);assert.equal(old.fulltext_status,null);assert.equal(old.provenance,null);
});

test('research feed excludes metadata while company/source queries preserve their real classification and all public URLs', async () => {
  for (const [params,expected] of [[{},'research'],[{company:'iambic-therapeutics'},'directory'],[{source:'iambic-official-newsroom'},'directory'],[{collection_mode:'index_metadata'},'metadata'],[{company:'another-company'},'research'],[{source:'another-newsroom'},'research'],[{company:'iambic-therapeutics',scope:'focused'},'focused']]) {
    const queries=[];
    const sql={query:async(text,args)=>{queries.push({text,args});return text.startsWith('SELECT count')?[{n:0}]:[];}};
    await apiRead('/api/records',params,sql);
    const where=queries[0].text;
    if (expected==='research') {assert.match(where,/content_level' IS DISTINCT FROM 'index_metadata'/);assert.match(where,/in_scope/);}
    if (expected==='directory') {assert.doesNotMatch(where,/in_scope|relevant|content_level/);}
    if (expected==='metadata') {assert.match(where,/content_level'='index_metadata'/);assert.doesNotMatch(where,/in_scope/);}
    if (expected==='focused') assert.match(where,/in_scope/);
  }
  await assert.rejects(()=>apiRead('/api/records',{collection_mode:'fulltext'},{query(){throw Error('must not query');}}),ApiError);
});

test('digest and weekly read-time gates reject metadata and empty bodies, including older frozen selections', async () => {
  const calls=[];
  const sql={query:async(text,args)=>{calls.push({text,args});return text.startsWith('SELECT * FROM daily_digests')?[{record_ids:[id],total_records:1}]:[];}};
  const digest=await getDigest(sql,'2026-11-22');
  assert.equal(digest.total_records,0);assert.deepEqual(digest.items,[]);
  assert.match(calls[1].text,/content_level' IS DISTINCT FROM 'index_metadata'/);
  assert.match(calls[1].text,/btrim\(COALESCE\(r\.content_text,''\)\)<>''/);
  calls.length=0;
  await getWeeklyBriefing(sql,'2026-11-22T02:00:00Z');
  for (const call of calls.filter(call=>/FROM public_resources/.test(call.text))) {
    assert.match(call.text,/content_level' IS DISTINCT FROM 'index_metadata'/);
    assert.match(call.text,/btrim\(COALESCE\(r\.content_text,''\)\)<>''/);
  }
});

test('SSR directory details in all languages never invent a body, summary, articleBody, or fetch timestamp', async () => {
  for (const language of ['zh-CN','zh-Hant','en']) {
    const response=await publication(new Request(base+'/records/'+id+'?lang='+language),assets,{},async()=>directory());
    const html=await response.text();
    assert.ok(html.includes(ownedText('官方目录信息，正文未采集',language)));
    assert.ok(html.includes(ownedText('未知',language)));
    assert.ok(html.includes(provenance.publication_date_raw));
    assert.ok(html.includes(provenance.index_url));
    assert.doesNotMatch(html,/MUST_NOT|已保存的原文节选|Saved source excerpt|articleBody|NOT_PUBLIC/);
    const schema=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(schema['@type'],'WebPage');
    assert.equal(schema.description,ownedText('官方目录信息，正文未采集',language));
  }
  const old=await(await publication(new Request(base+'/records/'+id),assets,{},async()=>historical())).text();
  assert.match(old,/Historical stored source text\./);assert.match(old,/已保存的原文节选/);
  assert.doesNotMatch(old,/data-content-level="index_metadata"/);
});

test('company SSR shows all official links with historical text and explicitly marked metadata together', async () => {
  const items=Array.from({length:7},(_,i)=>({...((i%2)?historical():directory()),id:'resource-'+i,canonical_url:'https://www.iambic.ai/post/item-'+i}));
  const read=async(path,params)=>{
    if(path.startsWith('/api/companies/'))return {name_en:'Iambic',sources:[],focus:[]};
    if(path==='/api/records'){assert.equal(params.company,'iambic-therapeutics');assert.equal(params.limit,'40');assert.equal(params.collection_mode,undefined);return {items};}
    return {items:[]};
  };
  const html=await(await publication(new Request(base+'/companies/iambic-therapeutics'),assets,{},read)).text();
  for(let i=0;i<items.length;i++)assert.ok(html.includes('https://www.iambic.ai/post/item-'+i));
  assert.match(html,/Historical source excerpt\./);assert.doesNotMatch(html,/MUST_NOT_BECOME_AN_ABSTRACT/);
});

async function mcp(name,args,read) {
  const response=await handleMcp(new Request(base+'/mcp',{method:'POST',headers:{Host:'bioai.example.test','Content-Type':'application/json',Accept:'application/json, text/event-stream'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),{SITE_ORIGIN:base},{waitUntil(){}},read);
  const body=await response.text();
  const parsed=response.headers.get('content-type')?.includes('text/event-stream')
    ? body.split('\n').filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6))).findLast(value=>value.id!==undefined) : JSON.parse(body);
  assert.equal(parsed.result.isError,undefined,body);
  return parsed.result.structuredContent ?? JSON.parse(parsed.result.content[0].text);
}

test('MCP preserves the directory contract, source mode, provenance whitelist, and legacy text', async () => {
  for (const language of ['zh-CN','zh-Hant','en']) {
    const result=await mcp('get_resource',{id,language},async()=>directory());
    assert.equal(result.data.content_text,'');assert.equal(result.data.excerpt,'');assert.equal(result.data.content_char_count,0);
    assert.equal(result.data.content_level,'index_metadata');assert.equal(result.data.fulltext_status,'not_fetched');
    assert.deepEqual(result.data.provenance,provenance);
    assert.equal(result.data.display_labels.content_level,ownedText('官方目录信息，正文未采集',language));
    assert.equal(result.data.title,'Original official title');
    assert.equal(result.data.classification.input_scope,'title_only');
    assert.doesNotMatch(JSON.stringify(result),/MUST_NOT|NOT_PUBLIC/);
  }
  const old=await mcp('get_resource',{id},async()=>historical());
  assert.equal(old.data.content_level,null);assert.equal(old.data.fulltext_status,null);
  assert.equal(old.data.content_text,'Historical stored source text.');
  const search=await mcp('search_resources',{source:'iambic-official-newsroom',collection_mode:'index_metadata'},async(path,params)=>{
    assert.equal(params.source,'iambic-official-newsroom');assert.equal(params.collection_mode,'index_metadata');assert.equal(params.focused,undefined);return {total:1,items:[directory()]};
  });
  assert.equal(search.items[0].excerpt,'');
  for (const explicit of [{focused:true},{focused:false},{topic:'drug-discovery'}]) {
    await mcp('search_resources',{source:'iambic-official-newsroom',...explicit},async(path,params)=>{
      for (const [key,value] of Object.entries(explicit)) assert.equal(params[key],value);
      return {total:0,items:[]};
    });
  }
  const status=await mcp('get_source_status',{language:'en'},async path=>path==='/api/topics'?{items:[]}:[{name:'Iambic',collection_mode:'index_metadata'},{name:'Historical'}]);
  assert.equal(status.data.items[0].collection_mode,'index_metadata');assert.equal(status.data.items[1].collection_mode,null);
  assert.match(status.data.status_note,/not full-text availability/);
});
