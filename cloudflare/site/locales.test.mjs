import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, EN_COPY, ownedText, languageUrl, controlledLabel } from './locales.js';
import { TRADITIONAL_COPY } from './traditional-copy.js';
import { GUIDES, GUIDE_SOURCES, localizedGuide, guidePage } from './guides.js';
import { publication } from './publication.js';
import { apiRead, handleApi } from './api.js';

const base = 'https://bioai.example.test';
const shell = '<html lang="zh-CN"><head><title data-i18n="BioAI 日知 · 问象">Home</title><meta name="description" data-i18n-content="home" content="Home"><link rel="canonical" href="https://wrong.example/"></head><body><div id="content" aria-live="polite"></div></body></html>';
const env = { SITE_ORIGIN: base, ASSETS: { fetch: async () => new Response(shell) } };
const record = { id:'record-1', title:'专题指南', excerpt:'已保存的原文节选', content_text:'条件性上限不等于当前交易现金。', source_name:'原始出处', canonical_url:'https://source.example/article?x=1&lang=original', classification:{topic_ids:['virtual-cell'],in_scope:true,ai_related:true} };
const event = { id:'event-1',title:'事件说明',summary:'合作成立与平台性能、候选药物进度分别需要证据。',event_type:'partnership',evidence_count:1,evidence:[{evidence_text:'公开证据与原始出处',source_name:'Source & <name>',canonical_url:'https://source.example/evidence'}] };
const company = { slug:'fixture-company',name_zh:'来源公司',name_en:'Source Company',track:'AI与模型数据',region:'中国',focus:['不可自动翻译的登记字段'],sources:[] };
const read = async path => path.startsWith('/api/companies/') ? company : path.startsWith('/api/records/') ? record : path.startsWith('/api/events/') ? event : {items:path === '/api/records' ? [record] : path === '/api/events' ? [event] : [company]};
const sql = { async query(query) {
  if (query.startsWith('SELECT * FROM daily_digests')) return [{total_records:1,record_ids:['record-1'],window_start:'2026-10-07',window_end:'2026-10-08'}];
  if (query.startsWith('SELECT count(*) AS total')) return [{total:1,industry_count:1,source_count:1,event_count:1}];
  if (query.startsWith('SELECT ti.id')) return [{id:'virtual-cell',count:1}];
  if (query.startsWith('SELECT e.id')) return [event];
  return [record];
} };

test('all original guide copy has explicit English and Traditional Chinese translations with unchanged citations', () => {
  for (const guide of GUIDES) {
    const authored = [guide.title,guide.description,...guide.links.map(link=>link.label),...guide.sections.flatMap(section=>[section.heading,...(section.paragraphs||[]).map(p=>p.text),...(section.table?.headers||[]),...(section.table?.rows||[]).flatMap(row=>row.cells)])];
    for (const copy of authored) {
      assert.ok(EN_COPY[copy], 'Missing English: '+copy);
      assert.ok(TRADITIONAL_COPY[copy], 'Missing Traditional Chinese: '+copy);
      assert.doesNotMatch(EN_COPY[copy], /[\u3400-\u9fff]/);
    }
    for (const language of LANGUAGES) {
      const localized = localizedGuide(guide,language), html = guidePage(guide,language,true);
      assert.deepEqual(localized.sourceIds, guide.sourceIds);
      for (const id of guide.sourceIds) {
        assert.ok(html.includes(GUIDE_SOURCES[id].title));
        assert.ok(html.includes(GUIDE_SOURCES[id].url));
      }
      assert.ok(html.includes('lang='+language));
    }
  }
  assert.match(guidePage(GUIDES[0],'en'), /unpaired CTRL and PERT/);
  assert.match(guidePage(GUIDES[1],'en'), /US\$45 million and US\$37\.5 million/);
  assert.match(guidePage(GUIDES[0],'zh-Hant'), /虛擬細胞/);
});

test('language links preserve query and hash, and leave external source URLs intact', () => {
  assert.equal(languageUrl('/?q=RNA&topic=virtual-cell#sources','en',true,base),'/?q=RNA&topic=virtual-cell&lang=en#sources');
  assert.equal(languageUrl('/?q=RNA&lang=en#sources','zh-Hant',true,base),'/?q=RNA&lang=zh-Hant#sources');
  assert.equal(languageUrl('https://source.example/article?lang=original','en',true,base),'https://source.example/article?lang=original');
  assert.equal(languageUrl('/guides','zh-CN'),'/guides');
  assert.equal(languageUrl('/guides','en<script>',true),'/guides?lang=zh-CN');
});

test('every public HTML view localizes metadata and links while preserving original records and evidence', async () => {
  for (const language of LANGUAGES) {
    for (const path of ['/','/guides','/guides/virtual-cell-models','/briefings','/topics/virtual-cell','/companies/fixture-company','/records/record-1','/events/event-1','/digest/2026-10-08','/connect']) {
      const response = await publication(new Request(base+path+'?lang='+language+'&utm_source=fixture'),env,sql,read);
      assert.equal(response.status,200,path);
      assert.equal(response.headers.get('content-language'),language);
      const html = await response.text(), canonical = base+path+'?lang='+language;
      assert.ok(html.includes(`lang="${language}"`),path);
      assert.ok(html.includes(`<link rel="canonical" href="${canonical}">`),path);
      assert.equal((html.match(/rel="canonical"/g)||[]).length,1);
      assert.doesNotMatch(html,/data-i18n="BioAI 日知 · 问象"|wrong\.example|utm_source|data-i18n-content="home"/);
      const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
      assert.equal(schema.inLanguage,language);
      assert.equal(schema.url,canonical);
      if (path === '/records/record-1') {
        assert.match(html,/<h1 data-source-original>专题指南<\/h1>/);
        assert.match(html,/<p data-source-original>条件性上限不等于当前交易现金。<\/p>/);
        assert.ok(html.includes('https://source.example/article?x=1&amp;lang=original'));
      }
      if (path === '/events/event-1') {
        assert.match(html,/<h1 data-source-original>事件说明<\/h1>/);
        assert.ok(html.includes(event.summary));
        assert.ok(html.includes('<span data-source-original>公开证据与原始出处</span>'));
        assert.ok(html.includes('Source &amp; &lt;name&gt;'));
      }
    }
  }
});

test('hostile locale values fall back safely, and localized RSS keeps source text and external links', async () => {
  const html = await (await publication(new Request(base+'/guides?lang='+encodeURIComponent('en"><script>alert(1)</script>')),env,sql,read)).text();
  assert.match(html,/lang="zh-CN"/);
  assert.doesNotMatch(html,/<script>alert|data-language="en"/);
  const rss = await (await publication(new Request(base+'/feed.xml?topic=virtual-cell&lang=en'),env,sql,read)).text();
  assert.match(rss,/<language>en<\/language>/);
  assert.match(rss,/<title>BioAI Daily/);
  assert.match(rss,/<title>专题指南<\/title>/);
  assert.ok(rss.includes('https://source.example/article?x=1&amp;lang=original'));
});

test('public API topic and journal copy localizes without database access or enum translation', async () => {
  const noDB = {query(){throw new Error('Public definitions do not query the database');}};
  const en = await apiRead('/api/topics',{lang:'en'},noDB), hant = await apiRead('/api/topics',{lang:'zh-Hant'},noDB);
  assert.equal(en.items[0].id,'virtual-cell');
  assert.equal(en.items[0].label,'AI virtual cells');
  assert.equal(hant.items[0].label,'AI 虛擬細胞');
  const journals = await apiRead('/api/journals',{lang:'en'},noDB);
  assert.equal(journals.tier,'selected');
  assert.equal(journals.items[0].id,'nature');
  assert.equal(journals.items[0].title,'Nature');
  assert.equal(journals.items[0].focus,'General science');
  assert.match(journals.selection_basis,/fixed editorial selection/);
  const error = await handleApi(new Request(base+'/api/records?lang=en&topic=invalid'),{},noDB);
  assert.equal(error.status,422);
  assert.deepEqual(await error.json(),{detail:'Unknown topic'});
  assert.equal(ownedText('arbitrary original source text','en'),'arbitrary original source text');
  assert.equal(controlledLabel('专题指南','en'),'专题指南', 'An unknown directory value must not match UI copy');
  assert.equal(controlledLabel('AI与模型数据','en'),'AI, models, and data');
});
