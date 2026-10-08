// API contracts are covered in pytest; this guards against legacy-data regressions in the public shell.
const assert=require('node:assert/strict');const fs=require('node:fs');
const html=fs.readFileSync('dist/index.html','utf8');const js=fs.readFileSync('dist/app.js','utf8');
for(const route of ['frontpage','overview','timeline','hot','academic','directory','sources','saved','admin','news','daily','connect'])assert(html.includes(`data-nav="${route}"`));
for(const legacy of ['company-data.js','research.js','socials.js','foundation.css'])assert(!html.includes(legacy));
for(const snapshot of ['news.json','feeds.json','BIOAI_DATA','BIOAI_RESEARCH'])assert(!js.includes(snapshot));
assert(html.includes('/assets/wenxiang-mark.png'));
assert(html.includes('AI × LIFE SCIENCE'));
for(const url of ['/api/overview','/api/events','/api/records','/api/graph','/api/companies','/api/sources'])assert(js.includes(url));
assert(js.includes('r.ok')&&js.includes('content-type'));
assert(js.includes('setInterval(autoRefresh,300000)'));
assert(js.includes('virtual-cell') && js.includes('virtual-embryo') && js.includes('drug-discovery'));
assert(!js.includes('a.version || "1"'), 'Unknown preprint versions must stay unknown');
assert(html.includes('application/rss+xml'));
assert(js.includes(" : 'frontpage'"), 'The root page opens the newspaper, while #overview remains available');
assert(js.includes('async function frontpage(n)'), 'The newspaper must be part of the existing app');
assert(js.includes('/api/records?academic=false&days=30&limit=20'), 'Industry news is primary on the front page');
assert(js.includes('/api/records?academic=true&journal_tier=selected&days=30&limit=2'), 'Front-page research must use the selected-journal policy');
assert(js.includes('p.set("journal_tier", paperState.journal_tier)'), 'Research selection must be enforced by the data API');
assert(js.includes('api("/api/journals")') && js.includes('policy.items.map'), 'The journal policy and list must come from the actual backend');
assert(!js.includes('<option value="openalex"'), 'Unconnected indexes must not be presented as selectable live sources');
assert(js.includes('newspaperRecord(industryHeadlines[0], true)'), 'Newspaper headlines must come from fetched records');
assert(js.includes('frontpage-view') && js.includes('href="#overview"'), 'Readers must be able to move between newspaper and working dashboard');
const vm=require('node:vm');
const loadFunction=name=>vm.runInNewContext('('+js.match(new RegExp('function '+name+'\\([^]*?\\n  \\}'))[0]+')');
const parseWatchlist=loadFunction('parseWatchlist');
assert.equal(JSON.stringify(parseWatchlist(JSON.stringify({schema:'bioai-watchlist',version:1,company_slugs:['company-a','company-a','company-b']}))),JSON.stringify(['company-a','company-b']));
for(const invalid of [null,[],{schema:'other',version:1,company_slugs:[]},{schema:'bioai-watchlist',version:2,company_slugs:[]},{schema:'bioai-watchlist',version:1,company_slugs:[{}]},{schema:'bioai-watchlist',version:1,company_slugs:Array(1001).fill('company-a')}])assert.throws(()=>parseWatchlist(JSON.stringify(invalid)));
const headlines=loadFunction('selectIndustryHeadlines');
const stories=[
  {id:'general',published_at:'2026-10-08',fetched_at:'2026-10-08'},
  {id:'older-deal',published_at:'2026-10-03',fetched_at:'2026-10-03',industry_classification:{event_types:['partnership']}},
  {id:'recent-product',published_at:'2026-10-07',fetched_at:'2026-10-07',industry_classification:{event_types:['product']}},
  {id:'future-issue',published_at:'2027-01-01',fetched_at:'2026-10-02',industry_classification:{event_types:['clinical']}},
];
assert.equal(JSON.stringify(headlines(stories).map(r=>r.id)),JSON.stringify(['recent-product','older-deal','future-issue','general']));
assert.equal(stories[0].id,'general','Headline selection must not mutate the API record list');
assert(js.includes('file.size > 65536') && js.includes('new Set(previous.filter'), 'Watchlist imports are bounded and merge existing choices');
assert(js.includes("$('#rss-topic').onchange") && js.includes('rss-url'), 'RSS has a usable per-topic copy workflow');
console.log('Unified shell: API routes, brand and no legacy snapshot fallback verified.');
