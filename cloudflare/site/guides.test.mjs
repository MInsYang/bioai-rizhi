import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIDES, GUIDE_SOURCES, GUIDE_REVIEW_DATE, guidePage, guideSchema } from './guides.js';
import { publication } from './publication.js';

const base = 'https://bioai.example.test';
const shell = '<html lang="zh-CN"><head><title>Old</title><meta name="description" content="Old"><link rel="canonical" href="https://wrong.example/"><meta property="og:url" content="https://wrong.example/"><meta name="google-site-verification" content="PLACEHOLDER"></head><body><div id="content" aria-live="polite"></div></body></html>';
const env = { SITE_ORIGIN: base, ASSETS: { fetch: async () => new Response(shell) } };
const noDatabase = { query() { throw new Error('Guides must not query a database'); } };
const noApi = () => { throw new Error('Guides must not query an API'); };

test('guides have complete primary-source references and distinct, dated task boundaries', () => {
  assert.equal(new Set(GUIDES.map(guide => guide.id)).size, 3);
  for (const guide of GUIDES) {
    assert.ok(guide.sections.length >= 4);
    assert.ok(guide.sourceIds.length >= 3);
    for (const id of guide.sourceIds) {
      const source = GUIDE_SOURCES[id];
      assert.ok(source?.title && source.label, id);
      assert.equal(new URL(source.url).protocol, 'https:');
      assert.match(guidePage(guide), new RegExp(source.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    for (const section of guide.sections) {
      for (const content of [...(section.paragraphs || []), ...(section.table?.rows || [])]) {
        for (const id of content.sources || []) assert.ok(guide.sourceIds.includes(id), `${guide.id}: ${id}`);
      }
    }
    const schema = guideSchema(guide, base);
    assert.equal(schema['@type'], 'Article');
    assert.equal(schema.dateModified, GUIDE_REVIEW_DATE);
    assert.equal(schema.url, `${base}/guides/${guide.id}`);
    assert.deepEqual(schema.citation, guide.sourceIds.map(id => GUIDE_SOURCES[id].url));
  }
  assert.match(guidePage(GUIDES[0]), /未配对 CTRL 与 PERT/);
  assert.match(guidePage(GUIDES[1]), /2024 年 1 月 7 日/);
  assert.match(guidePage(GUIDES[1]), /条件性上限不等于当前交易现金/);
  assert.match(guidePage(GUIDES[2]), /不是全行业/);
});

test('guide routes serve visible source-linked HTML and one self canonical without template placeholders', async () => {
  for (const guide of GUIDES) {
    const response = await publication(new Request(`${base}/guides/${guide.id}?utm_source=test`), env, noDatabase, noApi);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /data-publication-view="guide"/);
    assert.match(html, /class="publication-table-wrap"/);
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
    assert.match(html, new RegExp(`href="${base}/guides/${guide.id}"`));
    assert.doesNotMatch(html, /wrong\.example|PLACEHOLDER|utm_source|NewsArticle/);
    assert.doesNotMatch(html, /google-site-verification|msvalidate\.01/);
    const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(schema.url, `${base}/guides/${guide.id}`);
    assert.equal(schema.headline, guide.title);
  }
  const response = await publication(new Request(base + '/guides'), env, noDatabase, noApi);
  const html = await response.text();
  assert.match(html, /data-publication-view="guides"/);
  for (const guide of GUIDES) assert.match(html, new RegExp(`href="/guides/${guide.id}"`));
});

test('missing guides are real 404s; HEAD keeps headers and drops body', async () => {
  const missing = await publication(new Request(base + '/guides/not-a-guide'), env, noDatabase, noApi);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('x-robots-tag'), 'noindex');
  const response = await publication(new Request(base + '/guides/virtual-cell-models', { method: 'HEAD' }), env, noDatabase, noApi);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.equal(await response.text(), '');
  assert.equal(await publication(new Request(base + '/guides', { method: 'POST' }), env, noDatabase, noApi), null);
});

test('only real configured verification values are emitted and HTML escaped', async () => {
  const response = await publication(new Request(base + '/guides'), { ...env, GOOGLE_SITE_VERIFICATION: 'value"><script>alert(1)</script>', BING_SITE_VERIFICATION: 'BING&CODE' }, noDatabase, noApi);
  const html = await response.text();
  assert.match(html, /name="google-site-verification" content="value&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
  assert.match(html, /name="msvalidate\.01" content="BING&amp;CODE"/);
  assert.doesNotMatch(html, /<script>alert|PLACEHOLDER/);
});
