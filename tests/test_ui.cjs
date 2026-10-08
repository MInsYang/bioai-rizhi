// API contracts are covered in pytest; this guards against legacy-data regressions in the public shell.
const assert=require('node:assert/strict');const fs=require('node:fs');
const html=fs.readFileSync('dist/index.html','utf8');const js=fs.readFileSync('dist/app.js','utf8');
for(const route of ['overview','timeline','hot','academic','directory','sources','saved','admin','news','daily','connect'])assert(html.includes(`data-nav="${route}"`));
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
console.log('Unified shell: API routes, brand and no legacy snapshot fallback verified.');
