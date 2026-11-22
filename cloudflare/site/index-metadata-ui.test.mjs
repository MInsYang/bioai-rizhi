import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { escape } from './publication.js';
import { ownedText } from './locales.js';

const app = await readFile(new URL('../../dist/app.js',import.meta.url),'utf8');
const registry = await readFile(new URL('../../dist/registry-panel.js',import.meta.url),'utf8');
const locale = await readFile(new URL('../../dist/locale.js',import.meta.url),'utf8');
const metadata = {id:'metadata-id',title:'Original official title',source_name:'Iambic newsroom',company_slug:'iambic-therapeutics',
  canonical_url:'https://ir.iambic.ai/news-releases/example',published_at:'2026-11-18T00:00:00Z',fetched_at:'2026-11-22T02:00:00Z',
  content_level:'index_metadata',fulltext_status:'not_fetched',excerpt:'NO_ABSTRACT',content_text:'NO_FULL_TEXT',
  provenance:{index_url:'https://www.iambic.ai/news',index_fetched_at:null,publication_date_raw:'November 18, 2026',publication_date_precision:'date'}};
const old = {id:'old-id',title:'Historical article',source_name:'Iambic newsroom',canonical_url:'https://www.iambic.ai/post/old',
  excerpt:'Historical excerpt.',content_text:'Historical full source text.',published_at:'2026-10-01'};

function language(language) {
  const module = {exports:{}};
  vm.runInNewContext(locale,{module,URL,URLSearchParams});
  return module.exports.createLocale({document:{documentElement:{lang:'zh-CN'}},localStorage:{getItem:()=>null},
    location:{origin:'https://bioai.example.test',pathname:'/',search:'?lang='+language,href:'https://bioai.example.test/?lang='+language}});
}
function renderContext(languageCode) {
  const l=language(languageCode), content={innerHTML:''};
  const dialog={open:false,showModal(){this.open=true;}}, evidence={innerHTML:''};
  const ctx=vm.createContext({l,tr:(key,vars)=>l.t(key,vars),esc:escape,date:value=>l.date(value),
    anchor:(url,label)=>url?`<a href="${escape(url)}">${escape(label)}</a>`:'',topicName:id=>id,URLSearchParams,
    content,epoch:1,page:0,sourceRows:[],dialogEpoch:0,
    paperLabels:()=>'',heading:(title,kicker,description)=>`<h1>${escape(title)}</h1><p>${escape(description)}</p>`,pager:()=>'',
    location:{origin:'https://bioai.example.test'},$:selector=>selector==='#evidence-dialog'?dialog:evidence,
  });
  // Execute the actual render functions with deterministic browser dependencies;
  // no network, browser startup, or copied rendering implementation is involved.
  const cards=app.slice(app.indexOf('  const isDirectory ='),app.indexOf('  async function frontpage('));
  const resources=app.slice(app.indexOf('  async function resource('),app.indexOf('  async function timeline('));
  const modal=app.slice(app.indexOf('  async function showDetail('),app.indexOf('  async function render('));
  vm.runInContext(cards+'\n'+resources+'\n'+modal+'\nglobalThis.renderers={recordCard,newspaperRecord,resource,sourceRecords,showDetail};',ctx);
  return {ctx,content,evidence,l};
}

test('browser cards, resource pages, and modals label metadata in three languages without inventing abstracts or bodies',async()=>{
  for(const code of ['zh-CN','zh-Hant','en']) {
    const {ctx,content,evidence}=renderContext(code);
    const label=ownedText('官方目录信息，正文未采集',code);
    for(const render of [ctx.renderers.recordCard,ctx.renderers.newspaperRecord]) {
      const html=render(metadata);
      assert.ok(html.includes(label));assert.ok(html.includes(metadata.title));
      assert.ok(html.includes(metadata.provenance.publication_date_raw));
      assert.doesNotMatch(html,/NO_ABSTRACT|NO_FULL_TEXT|摘要暂未提供|Read the original/);
    }
    ctx.api=async()=>metadata;
    await ctx.renderers.resource(1,'record',metadata.id);
    assert.ok(content.innerHTML.includes(label));assert.doesNotMatch(content.innerHTML,/NO_ABSTRACT|NO_FULL_TEXT|class="raw-body"/);
    await ctx.renderers.showDetail('record',metadata.id);
    assert.ok(evidence.innerHTML.includes(label));assert.ok(evidence.innerHTML.includes(ownedText('未知',code)));
    assert.doesNotMatch(evidence.innerHTML,/NO_ABSTRACT|NO_FULL_TEXT|class="raw-body"/);
    ctx.api=async()=>old;
    await ctx.renderers.resource(1,'record',old.id);assert.ok(content.innerHTML.includes(old.content_text));
    await ctx.renderers.showDetail('record',old.id);assert.ok(evidence.innerHTML.includes(old.content_text));
    assert.doesNotMatch(evidence.innerHTML,/data-content-level="index_metadata"/);
  }
});

test('source page requests all dates for its exact registry key and displays mixed historical and directory URLs',async()=>{
  const {ctx,content}=renderContext('en');
  const calls=[];
  ctx.api=async url=>{calls.push(url);return url.startsWith('/api/records?')?{total:2,items:[metadata,old]}:[{name:'Iambic',registry_key:'iambic-official-newsroom',collection_mode:'index_metadata'}];};
  await ctx.renderers.sourceRecords(1,'iambic-official-newsroom');
  const params=new URLSearchParams(calls.find(url=>url.startsWith('/api/records?')).split('?')[1]);
  assert.equal(params.get('source'),'iambic-official-newsroom');assert.equal(params.get('days'),'0');
  assert.equal(params.has('focused'),false);assert.equal(params.has('collection_mode'),false);
  for(const row of [metadata,old])assert.ok(content.innerHTML.includes(row.canonical_url));
  assert.ok(content.innerHTML.includes(old.excerpt));assert.doesNotMatch(content.innerHTML,/NO_ABSTRACT|NO_FULL_TEXT/);
});

test('company panel includes the source collection and historical records instead of showing events alone',async()=>{
  for(const code of ['zh-CN','zh-Hant','en']) {
    const nodes=new Map(), l=language(code), requests=[];
    const element=()=>({innerHTML:'',value:'',checked:false,addEventListener(){}});
    for(const id of ['#intro','#registry-result','#q','#track','#region','#company-topic','#history'])nodes.set(id,element());
    const root={isConnected:true,querySelector:selector=>nodes.get(selector),addEventListener(){}};
    const company={name_en:'Iambic',focus:[],alias_records:[],identity_links:[],events:[],relations:[],sources:[{name:'Iambic',url:'https://www.iambic.ai/news',registry_key:'iambic-official-newsroom',collection_mode:'index_metadata',verified:true,consecutive_failures:0}]};
    const context=vm.createContext({window:{BioAILocale:l},document:{title:''},localStorage:{getItem:()=>null},URLSearchParams,
      fetch:async url=>{requests.push(url);return {ok:true,json:async()=>url.includes('/api/records?')?{items:[metadata,old]}:company};}});
    vm.runInContext(registry,context);
    context.window.RegistryPanel.mount(root,'iambic-therapeutics');
    await new Promise(resolve=>setImmediate(resolve));
    const html=nodes.get('#registry-result').innerHTML;
    assert.ok(html.includes(metadata.title));assert.ok(html.includes(old.excerpt));assert.ok(html.includes(old.canonical_url));
    assert.ok(html.includes(ownedText('官方目录信息，正文未采集',code)));
    assert.ok(html.includes('#source/iambic-official-newsroom'));assert.doesNotMatch(html,/NO_ABSTRACT|NO_FULL_TEXT/);
    const query=new URL(requests.find(url=>url.includes('/api/records?')),'https://bioai.example.test').searchParams;
    assert.equal(query.get('company'),'iambic-therapeutics');assert.equal(query.get('days'),'0');assert.equal(query.get('limit'),'40');
  }
});
