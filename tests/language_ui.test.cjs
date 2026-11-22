const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const {createLocale, messages, labels, supportedLanguages} = require('../dist/locale.js');
const {createCollector} = require('../dist/analytics.js');

function environment(href = 'https://bioai.example/?lang=en#news', stored = null) {
  let location = new URL(href);
  const values = new Map(stored ? [['bioai-language', stored]] : []);
  const events = new Map(), redirected = [], emitted = [];
  const notice = {textContent: ''};
  const env = {
    get location() { return location; },
    history: {state: {test: true}, replaceState(state, title, url) { location = new URL(url); }},
    localStorage: {getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value)},
    sessionStorage: {getItem: () => null, setItem() {}},
    document: {documentElement: {lang: 'zh-CN', dataset: {}}, body: {}, referrer: '', querySelectorAll: () => [], addEventListener() {}, getElementById: () => notice},
    addEventListener: (name, handler) => events.set(name, handler),
    dispatchEvent(event) { emitted.push(event); events.get(event.type)?.(event); },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    navigator: {}, crypto: {randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},
  };
  location.assign = url => redirected.push({kind: 'assign', url});
  location.replace = url => redirected.push({kind: 'replace', url});
  return {env, values, events, redirected, emitted, notice};
}

test('explicit language wins; stored selection and default are bounded to the supported contract', () => {
  assert.equal(createLocale(environment('https://bioai.example/?lang=en', 'zh-Hant').env).language, 'en');
  assert.equal(createLocale(environment('https://bioai.example/?lang=invalid', 'zh-Hant').env).language, 'zh-Hant');
  assert.equal(createLocale(environment('https://bioai.example/', 'invalid').env).language, 'zh-CN');
  const fixture = environment('https://bioai.example/');
  fixture.env.localStorage.getItem = () => { throw new Error('Storage disabled'); };
  assert.equal(createLocale(fixture.env).language, 'zh-CN');
  assert.deepEqual(supportedLanguages, ['zh-CN', 'zh-Hant', 'en']);
});

test('interface dictionaries are complete while unknown original text remains unchanged', () => {
  assert(Object.keys(messages).length > 400);
  for (const [key, value] of Object.entries(messages)) {
    assert.equal(value.length, 2, key);
    assert(value.every(text => typeof text === 'string' && text.length), key);
  }
  for (const value of Object.values(labels)) assert.equal(value.length, 3);
  const en = createLocale(environment().env), hant = createLocale(environment('https://bioai.example/?lang=zh-Hant').env);
  assert.equal(en.t('公司黄页'), 'Company directory');
  assert.equal(hant.t('公司黄页'), '公司黃頁');
  assert.equal(en.t('未收录原文标题：虚拟细胞'), '未收录原文标题：虚拟细胞');
  assert.equal(hant.t('未收录原文标题：虚拟细胞'), '未收录原文标题：虚拟细胞');
  assert.equal(en.t('近 30 天已核验事件：{count}', {count: 1}), 'Verified events in the past 30 days: 1');
});

test('company display names prefer supplied English; controlled labels do not alter source values', () => {
  const en = createLocale(environment().env);
  const company = {name_zh: '原始中文公司', name_en: 'Original Company', track: '测序与多组学', region: '中国/美国'};
  const frozen = JSON.stringify(company);
  assert.equal(en.companyName(company), 'Original Company');
  assert.equal(en.companyName({name_zh: '只有原始中文名称'}), '只有原始中文名称');
  assert.equal(en.companyName({company_name: '公司原文', company_name_en: 'Company Source'}), 'Company Source');
  assert.equal(en.label(company.track), 'Sequencing & multiomics');
  assert.equal(en.label(company.region), 'China / United States');
  assert.equal(en.label('单细胞扰动数据'), 'Single-cell perturbation data');
  assert.equal(en.label('未知作者提供分类'), '未知作者提供分类');
  assert.equal(en.label('新闻与文章'), '新闻与文章', 'An interface phrase is not automatically a controlled classification');
  assert.equal(en.label('产品发布'), 'Product launch');
  assert.equal(JSON.stringify(company), frozen);
});

test('dates and missing dates use the selected locale with the Beijing time contract', () => {
  const en = createLocale(environment().env), cn = createLocale(environment('https://bioai.example/?lang=zh-CN').env);
  assert.equal(en.date(null), 'Date not provided');
  assert.equal(en.date('invalid'), 'Date awaiting verification');
  assert.equal(cn.date(null), '日期未提供');
  assert(en.date('2026-10-09T00:00:00Z').includes('2026'));
  assert(en.date('2026-10-09T00:00:00Z', true).includes('08:00'));
});

test('read and API links preserve all filters, parameters and anchors, while external source URLs stay exact', () => {
  const en = createLocale(environment().env);
  const link = new URL(en.url('/records/id?topic=virtual-cell&limit=20#evidence'), 'https://bioai.example');
  assert.equal(link.searchParams.get('lang'), 'en');
  assert.equal(link.searchParams.get('topic'), 'virtual-cell');
  assert.equal(link.searchParams.get('limit'), '20');
  assert.equal(link.hash, '#evidence');
  const api = new URL(en.url('/api/companies?track=' + encodeURIComponent('测序与多组学')), 'https://bioai.example');
  assert.equal(api.searchParams.get('track'), '测序与多组学');
  assert.equal(en.url('#topic/virtual-cell'), '#topic/virtual-cell');
  assert.equal(en.url('https://source.example/paper?lang=original#results'), 'https://source.example/paper?lang=original#results');
  assert.equal(en.url('https://bioai.example/mcp'), 'https://bioai.example/mcp');
  assert.equal(en.url('mailto:source@example.org'), 'mailto:source@example.org');
});

test('company website handoff uses its existing language paths', () => {
  const en = createLocale(environment().env), hant = createLocale(environment('https://bioai.example/?lang=zh-Hant').env), cn = createLocale(environment('https://bioai.example/?lang=zh-CN').env);
  assert.equal(en.url('https://wanxiang-shengyuan.pages.dev/'), 'https://wanxiang-shengyuan.pages.dev/en/');
  assert.equal(hant.url('https://wanxiang-shengyuan.pages.dev/en/?ref=bioai#products'), 'https://wanxiang-shengyuan.pages.dev/zh-hant/?ref=bioai#products');
  assert.equal(cn.url('https://wanxiang-shengyuan.pages.dev/zh-hant/'), 'https://wanxiang-shengyuan.pages.dev/');
});

test('language changes on hash views preserve the URL state and emit one render event', () => {
  const fixture = environment('https://bioai.example/?lang=en&analytics_test=1&query=unchanged#topic/virtual-cell');
  const l = createLocale(fixture.env);
  l.setLanguage('zh-Hant');
  assert.equal(fixture.env.location.hash, '#topic/virtual-cell');
  assert.equal(fixture.env.location.searchParams.get('analytics_test'), '1');
  assert.equal(fixture.env.location.searchParams.get('query'), 'unchanged');
  assert.equal(fixture.env.location.searchParams.get('lang'), 'zh-Hant');
  assert.equal(fixture.values.get('bioai-language'), 'zh-Hant');
  assert.equal(fixture.emitted.length, 1);
  assert.equal(fixture.redirected.length, 0);
  l.setLanguage('unsupported');
  assert.equal(fixture.emitted.length, 1);
});

test('server-rendered routes reload to retain localized editorial content and metadata', () => {
  for (const path of ['/', '/guides', '/guides/virtual-cell-models', '/briefings', '/companies/company-a', '/records/id', '/events/id', '/topics/virtual-cell', '/digest/2026-10-09', '/connect']) {
    const fixture = environment('https://bioai.example' + path + '?lang=en&analytics_test=1');
    createLocale(fixture.env).setLanguage('zh-Hant');
    assert.equal(fixture.redirected.length, 1, path);
    assert.equal(new URL(fixture.redirected[0].url).searchParams.get('analytics_test'), '1');
    assert.equal(new URL(fixture.redirected[0].url).searchParams.get('lang'), 'zh-Hant');
  }
  const initial = environment('https://bioai.example/guides?ref=company', 'en');
  createLocale(initial.env).init();
  assert.equal(initial.redirected[0].kind, 'replace');
  assert.equal(new URL(initial.redirected[0].url).searchParams.get('ref'), 'company');
});

test('both application and newspaper controls expose native language names and accessible minimum targets', () => {
  const l = createLocale(environment().env), html = fs.readFileSync('dist/index.html', 'utf8'), app = fs.readFileSync('dist/app.js', 'utf8'), css = fs.readFileSync('dist/style.css', 'utf8');
  assert(l.control('frontpage-language').includes('for="frontpage-language"'));
  for (const name of ['简体中文', '繁體中文', 'English']) assert(l.control().includes(name));
  assert(l.control().includes('<select'));
  assert(l.control().includes('value="en" selected'));
  assert(app.includes('l.control("frontpage-language")'));
  assert(html.includes('data-language-select'));
  assert(css.includes('.language-control select { min-height:44px;'));
  assert(css.includes('.language-control select:focus-visible'));
  for (const asset of ['locale.js', 'app.js', 'registry-panel.js', 'analytics.js']) assert(html.includes('/' + asset + '?v='));
});

test('every explicitly annotated shell phrase and template translation is present in the dictionary', () => {
  const html = fs.readFileSync('dist/index.html', 'utf8');
  for (const match of html.matchAll(/data-i18n(?:-aria-label|-alt|-placeholder|-content)?="([^"]+)"/g)) assert(messages[match[1]], match[1]);
  for (const file of ['dist/app.js', 'dist/registry-panel.js']) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/tr\("((?:[^"\\]|\\.)*)"/g)) {
      const key = JSON.parse('"' + match[1] + '"');
      assert(messages[key], file + ': ' + key);
    }
  }
});

test('resource headings and records preserve original titles even when they equal an interface dictionary key', () => {
  const source = fs.readFileSync('dist/app.js', 'utf8'), l = createLocale(environment().env);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const fn = name => vm.runInNewContext('(' + source.match(new RegExp('function ' + name + '\\([^]*?\\n  \\}'))[0] + ')', {tr: l.t, l, esc, date: l.date, topicName: id => id, anchor: (url, title) => esc(title)});
  const heading = fn('heading');
  assert(heading('新闻与文章', 'SOURCE RECORD', '信息来源', true).includes('>新闻与文章</h1>'));
  assert(heading('新闻与文章', 'SOURCE RECORD', '信息来源', true).includes('>信息来源</p>'));
  assert(heading('新闻与文章', 'SOURCE RECORD', '').includes('>News &amp; articles</h1>'));
  const card = fn('recordCard')({id: 'source-id', title: '产品发布', excerpt: '原始摘要：学术进展', source_name: '原始中文来源', fetched_at: '2026-10-09T00:00:00Z'});
  assert(card.includes('>产品发布</button>'));
  assert(card.includes('原始摘要：学术进展'));
  assert(card.includes('原始中文来源'));
  const topics = [['virtual-cell', 'AI 虚拟细胞', 'description']];
  const frozen = JSON.stringify(topics);
  const topicName = vm.runInNewContext(source.match(/const topicName = ([^\n]+);/)[1], {focusTopics: topics, tr: l.t});
  assert.equal(topicName('virtual-cell'), 'AI virtual cells');
  assert.equal(topicName('新闻与文章'), '新闻与文章');
  assert.equal(JSON.stringify(topics), frozen, 'Displaying topic labels must not rewrite topic identifiers or source arrays');
});

test('watchlist status is rendered anew in the current language from stored counts', () => {
  const source = fs.readFileSync('dist/app.js', 'utf8'), l = createLocale(environment().env);
  const load = watchlistNotice => vm.runInNewContext('(' + source.match(/function watchlistMessage\([^]*?\n  \}/)[0] + ')', {watchlistNotice, tr: l.t});
  assert.equal(load({type: 'import', added: 1, skipped: 2})(), 'Import complete. Companies added: 1; unmatched entries skipped: 2. Existing follows were retained.');
  assert(load({type: 'export', count: 1})().includes('Companies: 1.'));
});

test('privacy status follows language without changing collection semantics or sending language events', () => {
  const fixture = environment('https://bioai.example/?lang=en&analytics_test=1#news');
  fixture.env.BioAILocale = createLocale(fixture.env);
  const posts = [];
  fixture.env.fetch = (url, options) => { posts.push(JSON.parse(options.body)); return Promise.resolve(); };
  createCollector(fixture.env).start();
  assert(fixture.notice.textContent.startsWith('This browser has not sent'));
  assert.equal(posts.length, 1);
  assert.equal(posts[0].path, '/#news');
  assert(!Object.hasOwn(posts[0], 'language'));
  fixture.env.BioAILocale.setLanguage('zh-Hant');
  assert(fixture.notice.textContent.includes('目前') || fixture.notice.textContent.includes('當前'));
  assert.equal(posts.length, 1);
  fixture.env.navigator.globalPrivacyControl = true;
  fixture.env.BioAILocale.setLanguage('en');
  assert.equal(fixture.notice.textContent, 'This browser has sent a DNT / GPC signal. Web events are not collected.');
  assert.equal(posts.length, 1);
});
