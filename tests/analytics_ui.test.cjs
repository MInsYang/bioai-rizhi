const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const {normalizePath, referrerHost, actionFor, createCollector} = require('../dist/analytics.js');

const RESOURCE_ID = 'd2aa1f0d-5053-4465-a3c4-499354d4ff11';
const turn = () => new Promise(resolve => setImmediate(resolve));
function environment({privacy = {}, url = 'https://bioai.example/?analytics_test=1', storageBlocked = false, storage = new Map()} = {}) {
  let time = 1_000_000, serial = 0;
  const posts = [], values = storage, events = new Map(), documentEvents = new Map();
  const notice = {textContent: ''};
  const env = {
    location: new URL(url), navigator: privacy,
    Date: {now: () => time},
    crypto: {randomUUID: () => '00000000-0000-4000-8000-' + String(++serial).padStart(12, '0')},
    sessionStorage: {getItem(key) {if (storageBlocked) throw Error('Blocked'); return values.get(key) || null;}, setItem(key, value) {if (storageBlocked) throw Error('Blocked'); values.set(key, value);}},
    document: {referrer: 'https://source.example/private/query?q=secret#private', addEventListener: (name, handler) => documentEvents.set(name, handler), getElementById: () => notice},
    addEventListener: (name, handler) => events.set(name, handler),
    fetch: (url, options) => {posts.push({url, options, payload: JSON.parse(options.body)}); return Promise.resolve({status: 202});},
  };
  return {env, posts, values, events, documentEvents, notice, advance: ms => {time += ms;}};
}
function element({href, resource, copy, admin = false, disabled = false} = {}) {
  const link = href === undefined ? null : {getAttribute: () => href};
  return {disabled, closest(selector) {
    if (selector === '#admin-root') return admin ? {} : null;
    if (selector === '[data-record],[data-event]') return resource ? {dataset: resource} : null;
    if (selector === '[data-copy]') return copy === undefined ? null : {dataset: {copy}};
    if (selector === 'a[href]') return link;
    return null;
  }};
}

test('Public route normalization removes queries and rejects admin/arbitrary paths', () => {
  const cases = [
    ['/', '/'], ['/#frontpage', '/'], ['/#news?search=secret', '/#news'],
    ['/#company/seekgene', '/companies/seekgene'], ['/companies/seekgene?token=secret', '/companies/seekgene'],
    ['/#topic/virtual-cell', '/topics/virtual-cell'], ['/#models', '/#academic'],
    ['/#daily/2026-10-08', '/digest/2026-10-08'], ['/guides/virtual-cell-models', '/guides/virtual-cell-models'],
    ['/briefings', '/briefings'], [`/#record/${RESOURCE_ID}`, `/records/${RESOURCE_ID}`],
    ['/#admin', null], ['/admin#news', null], ['/private?email=secret', null],
    ['/#topic/not-a-topic', null], ['/#company/secret%2fcontent', null], ['/#record/no-id', null],
    ['/api/admin/analytics', null], ['/#main', null], ['/guides/not-approved', null],
    ['/#company/' + 'a'.repeat(121), null],
    ['/#daily/2026-02-30', null], ['/#record/00000000-0000-0000-0000-000000000000', null],
  ];
  for (const [path, expected] of cases) assert.equal(normalizePath(new URL(path, 'https://bioai.example')), expected, path);
});

test('Referrer and useful actions never expose full URLs or arbitrary copy/input values', () => {
  assert.equal(referrerHost('https://source.example/private?email=secret#fragment'), 'source.example');
  assert.equal(referrerHost('https://bioai.example/private?q=secret', 'https://bioai.example'), null);
  for (const url of ['https://127.0.0.1/private', 'http://localhost:8000/', 'https://[::1]/', 'https://database.internal/', 'https://host.local/', 'https://test.invalid/', 'https://1.23/', 'file:///secret', 'bad-url']) assert.equal(referrerHost(url), null);
  const location = new URL('https://bioai.example/?q=secret#connect');
  assert.deepEqual(actionFor(element({href: 'https://outside.example/secret?token=private#fragment'}), location), {event_type: 'outbound_click', target: 'outside.example'});
  assert.deepEqual(actionFor(element({href: '#company/seekgene'}), location), {event_type: 'company_open', target: 'seekgene'});
  assert.deepEqual(actionFor(element({resource: {record: RESOURCE_ID}}), location), {event_type: 'resource_open', target: RESOURCE_ID});
  assert.deepEqual(actionFor(element({copy: 'https://bioai.example/mcp'}), location), {event_type: 'mcp_copy', target: 'mcp'});
  assert.deepEqual(actionFor(element({href: '/feed.xml?topic=virtual-cell'}), location), {event_type: 'rss_click', target: 'rss'});
  for (const el of [element({copy: 'private free text'}), element({href: 'https://127.0.0.1/private'}), element({href: 'https://user:password@outside.example/private'}), element({href: 'javascript:alert(1)'}), element({resource: {record: 'private title'}}), element({admin: true, href: 'https://outside.example/'}), element({disabled: true, href: 'https://outside.example/'})]) assert.equal(actionFor(el, location), null);
});

test('Collector counts navigation once, avoids refresh/admin, and marks browser QA as test', async () => {
  const e = environment(), collector = createCollector(e.env);
  collector.start(); collector.start(); collector.pageView();
  await turn();
  assert.equal(e.posts.length, 1);
  const initial = e.posts[0];
  assert.equal(initial.url, '/api/telemetry');
  assert.equal(initial.options.keepalive, true);
  assert.equal(initial.options.mode, 'same-origin');
  assert.equal(initial.payload.referrer_host, 'source.example');
  assert.equal(initial.payload.traffic_type, 'test');
  assert.deepEqual(Object.keys(initial.payload).sort(), ['event_id', 'session_id', 'event_type', 'path', 'referrer_host', 'traffic_type'].sort());
  assert(!initial.options.body.includes('secret'));
  e.env.location.hash = '#news'; e.events.get('hashchange')(); e.events.get('popstate')();
  await turn();
  assert.equal(e.posts.length, 2);
  assert.equal(e.posts[1].payload.session_id, initial.payload.session_id);
  e.env.location.hash = '#admin'; e.events.get('hashchange')();
  collector.recordAction({target: element({href: 'https://outside.example/private?q=secret'})});
  await turn(); assert.equal(e.posts.length, 2);
  e.env.location.hash = '#news'; e.events.get('hashchange')();
  await turn(); assert.equal(e.posts.length, 3, 'Returning from admin is a new public page entry');
});

test('DNT/GPC suppress posts and browser session storage, including signals enabled later', async () => {
  for (const privacy of [{doNotTrack: '1'}, {doNotTrack: 'yes'}, {globalPrivacyControl: true}]) {
    const e = environment({privacy}), collector = createCollector(e.env);
    collector.start(); collector.recordAction({target: element({copy: 'https://bioai.example/mcp'})}); collector.touch();
    await turn(); assert.equal(e.posts.length, 0); assert.equal(e.values.size, 0);
    assert(e.notice.textContent.includes('不采集'));
  }
  const e = environment(), collector = createCollector(e.env);
  collector.start(); await turn();
  e.env.navigator.globalPrivacyControl = true; e.env.location.hash = '#news'; collector.pageView();
  await turn(); assert.equal(e.posts.length, 1);
});

test('Idle sessions rotate at 30 minutes, activity extends them, and storage denial stays usable', async () => {
  const e = environment(), collector = createCollector(e.env);
  collector.start(); await turn(); const first = e.posts[0].payload.session_id;
  e.advance(29 * 60000); collector.touch();
  e.advance(29 * 60000); collector.recordAction({target: element({href: '/feed.xml'})});
  await turn(); assert.equal(e.posts[1].payload.session_id, first);
  e.advance(30 * 60000); collector.recordAction({target: element({href: '/feed.xml'})});
  await turn(); assert.notEqual(e.posts[2].payload.session_id, first);
  assert.equal(e.posts[2].payload.event_type, 'page_view', 'A resumed session needs a PV before its first action');
  assert.equal(e.posts[3].payload.event_type, 'rss_click');
  assert.equal(e.posts[3].payload.session_id, e.posts[2].payload.session_id);
  assert.notEqual(e.posts[3].payload.event_id, e.posts[2].payload.event_id);
  const blocked = environment({storageBlocked: true}), fallback = createCollector(blocked.env);
  fallback.start(); await turn(); fallback.recordAction({target: element({href: '/feed.xml'})});
  await turn(); assert.equal(blocked.posts[0].payload.session_id, blocked.posts[1].payload.session_id);
});

test('Resuming activity after idle records exactly one PV for the new same-page session', async () => {
  const e = environment(), collector = createCollector(e.env);
  collector.start(); await turn();
  const previous = e.posts[0].payload.session_id;
  e.advance(30 * 60000); collector.touch(); await turn();
  assert.equal(e.posts.length, 2);
  assert.equal(e.posts[1].payload.event_type, 'page_view');
  assert.notEqual(e.posts[1].payload.session_id, previous);
  collector.touch(); collector.pageView();
  collector.recordAction({target: element({copy: 'https://bioai.example/mcp'})}); await turn();
  assert.equal(e.posts.filter(p => p.payload.event_type === 'page_view').length, 2);
  assert.equal(e.posts[2].payload.session_id, e.posts[1].payload.session_id);
});

test('The QA test marker survives full-path navigation only for the current idle session', async () => {
  const first = environment(), initial = createCollector(first.env);
  initial.start(); await turn();
  const next = environment({url: 'https://bioai.example/guides', storage: first.values});
  createCollector(next.env).start(); await turn();
  assert.equal(next.posts[0].payload.traffic_type, 'test');
  assert.equal(next.posts[0].payload.session_id, first.posts[0].payload.session_id);
  const expired = environment({url: 'https://bioai.example/briefings', storage: next.values});
  expired.advance(30 * 60000); createCollector(expired.env).start(); await turn();
  assert(!Object.hasOwn(expired.posts[0].payload, 'traffic_type'));
});

test('Collector bounds burst traffic and does not retry failed telemetry', async () => {
  const e = environment(), collector = createCollector(e.env);
  e.env.fetch = (url, options) => {e.posts.push({url, options}); return Promise.reject(Error('Offline'));};
  collector.start();
  for (let i = 0; i < 100; i++) {collector.recordAction({target: element({href: '/feed.xml'})}); await turn();}
  assert.equal(e.posts.length, 45);
  e.advance(60000); collector.recordAction({target: element({href: '/feed.xml'})}); await turn();
  assert.equal(e.posts.length, 46);
});

const adminSource = fs.readFileSync('dist/admin-panel.js', 'utf8');
function statistics(days = 7) {
  return {days, timezone: 'Asia/Shanghai', generated_at: '2026-10-08T05:00:00Z', collected_since: '2026-10-08T00:00:00Z', period: {start_date: '2026-10-08', end_date: '2026-10-08'}, retention_days: 90,
    summary: {page_views: 0, sessions: 0, clicks: 0, mcp_copies: 0},
    mcp: {tool_calls: 0, successes: 0, errors: 0, error_rate: null, avg_duration_ms: null, p95_duration_ms: null, tools: []},
    daily: [{date: '2026-10-08', page_views: 0, sessions: 0, clicks: 0, mcp_tool_calls: 0, mcp_successes: 0, mcp_errors: 0}], top_pages: [], top_referrers: [], top_actions: [],
    excluded: {test_events: 0, automated_web_events: 0, unknown_web_events: 0, test_mcp_calls: 0}};
}
function adminEnvironment() {
  const pending = [], nodes = new Map(), clickHandlers = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {innerHTML: '', textContent: '', hidden: false, value: '', checked: false, open: false, dataset: {}, attributes: {}, setAttribute(name, value) {this.attributes[name] = value;}, close() {this.open = false;}, showModal() {this.open = true;}, click() {this.onclick?.();}});
    return nodes.get(id);
  };
  const ranges = [1, 7, 30].map(value => ({dataset: {analyticsDays: String(value)}}));
  const root = {innerHTML: '', isConnected: true, querySelector: node, querySelectorAll: () => ranges, addEventListener(name, handler) {if (name === 'click') clickHandlers.push(handler);}};
  class TestFormData {
    constructor(form) {this.values = form.values || {};}
    get(name) {const value = this.values[name]; return Array.isArray(value) ? value[0] : value ?? null;}
    getAll(name) {const value = this.values[name]; return value === undefined ? [] : Array.isArray(value) ? value : [value];}
    has(name) {return Object.hasOwn(this.values, name);}
    *[Symbol.iterator]() {for (const [name, value] of Object.entries(this.values)) for (const item of Array.isArray(value) ? value : [value]) yield [name, item];}
  }
  const context = {window: {}, Date, Intl, URLSearchParams, FormData: TestFormData, crypto: {randomUUID: () => RESOURCE_ID}, fetch: (url, options) => new Promise(resolve => pending.push({url, options, respond: (data, ok = true) => resolve({ok, json: async () => data})}))};
  vm.runInNewContext(adminSource, context);
  const click = dataset => {
    const button = {dataset, closest(selector) {if (selector === 'button') return this; if (selector === '[data-dismiss-candidate]' && this.dataset.dismissCandidate) return this; if (selector === '[data-publish]' && this.dataset.publish) return this; return null;}};
    return Promise.all(clickHandlers.map(handler => handler({target: button})));
  };
  return {panel: context.window.AdminPanel, pending, node, root, ranges, click};
}

test('Dashboard shows honest zero data, real tool executions, safe rankings and missing durations', () => {
  const {panel} = adminEnvironment(), data = statistics();
  const zero = panel.analyticsMarkup(data);
  assert(zero.includes('尚无符合统计口径'));
  assert(zero.includes('<dt>平均耗时</dt><dd>—</dd>'));
  assert(zero.includes('<dt>错误率</dt><dd>—</dd>'));
  assert(zero.includes('不代表独立人数'));
  assert(zero.includes('没有补录'));
  assert(zero.includes('role="img"') && zero.includes('查看逐日数据'));
  data.summary.mcp_copies = 18; data.summary.clicks = 18;
  data.mcp = {...data.mcp, tool_calls: 2, successes: 1, errors: 1, error_rate: .5, avg_duration_ms: 120, p95_duration_ms: 200, tools: [{tool: '<img src=x onerror=alert(1)>', tool_calls: 2, successes: 1, errors: 1, avg_duration_ms: 120}]};
  data.top_actions = [{event_type: 'mcp_copy', target: 'mcp', count: 18}];
  const markup = panel.analyticsMarkup(data, 30);
  assert(markup.includes('<h3>MCP 工具执行</h3><strong>2</strong>'));
  assert(markup.includes('<dt>错误率</dt><dd>50%</dd>'));
  assert(markup.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert(!markup.includes('<img src=x'));
  assert(markup.includes('data-analytics-days="30" aria-pressed="true"'));
});

test('Logout and same-token re-login discard prior analytics responses', async () => {
  const e = adminEnvironment(); e.panel.mount(e.root);
  e.node('#token').value = 'example-admin-token'; e.node('#login').onclick();
  assert.equal(e.pending[0].url, '/api/admin/analytics?days=7');
  assert.equal(e.node('#token').value, '');
  e.node('#logout').onclick();
  e.node('#token').value = 'example-admin-token'; e.node('#login').onclick();
  e.pending[0].respond(statistics()); await turn();
  assert(!e.node('#admin-content').innerHTML.includes('analytics-dashboard'));
  e.pending[1].respond(statistics()); await turn();
  assert(e.node('#admin-content').innerHTML.includes('analytics-dashboard'));
  e.node('#analytics').onclick(); e.node('#logout').onclick();
  e.pending[2].respond(statistics()); await turn();
  assert.equal(e.node('#admin-content').innerHTML, '');
  assert.equal(e.node('#controls').hidden, true);
  assert.equal(e.node('#message').textContent, '已退出');
});

test('Rapid range switches and stale source requests cannot overwrite the active dashboard', async () => {
  const e = adminEnvironment(); e.panel.mount(e.root);
  e.node('#token').value = 'example-admin-token'; e.node('#login').onclick();
  e.pending[0].respond(statistics()); await turn();
  e.ranges[0].onclick(); e.ranges[2].onclick();
  e.pending[2].respond(statistics(30)); await turn();
  e.pending[1].respond(statistics(1)); await turn();
  assert(e.node('#admin-content').innerHTML.includes('data-analytics-days="30" aria-pressed="true"'));
  e.node('#refresh').onclick(); e.node('#analytics').onclick();
  e.pending[4].respond(statistics(30)); await turn();
  e.pending[3].respond([]); await turn();
  assert(e.node('#admin-content').innerHTML.includes('analytics-dashboard'));
  assert.equal(e.node('#source-filters').hidden, true);
});

async function connectAdmin(e) {
  e.panel.mount(e.root);
  e.node('#token').value = 'example-admin-token'; e.node('#login').onclick();
  e.pending[0].respond(statistics()); await turn();
}
async function openCandidates(e) {
  e.node('#candidate-review').onclick();
  e.pending[1].respond({}); await turn();
  e.pending[2].respond([]); await turn();
}

test('Pending candidate dismissal cannot restore candidates or stale errors after switching to stats', async () => {
  for (const succeeded of [true, false]) {
    const e = adminEnvironment(); await connectAdmin(e); await openCandidates(e);
    const dismissing = e.click({dismissCandidate: RESOURCE_ID});
    assert(e.pending[3].url.endsWith('/dismiss'));
    e.node('#analytics').onclick();
    e.pending[4].respond(statistics()); await turn();
    const current = e.node('#admin-content').innerHTML;
    e.pending[3].respond(succeeded ? {} : {detail: 'Stale dismissal failure'}, succeeded);
    await dismissing; await turn();
    assert.equal(e.pending.length, 5, 'No hidden candidate regeneration should start');
    assert.equal(e.node('#admin-content').innerHTML, current);
    assert(!e.node('#message').innerHTML.includes('Stale dismissal failure'));
  }
});

test('Candidate dismissal still refreshes the active candidates view', async () => {
  const e = adminEnvironment(); await connectAdmin(e); await openCandidates(e);
  const dismissing = e.click({dismissCandidate: RESOURCE_ID});
  e.pending[3].respond({}); await dismissing; await turn();
  assert.equal(e.pending[4].url, '/api/admin/candidates/generate');
  e.pending[4].respond({}); await turn();
  assert.equal(e.pending[5].url, '/api/admin/candidates');
  e.pending[5].respond([]); await turn();
  assert(e.node('#admin-content').innerHTML.includes('行业候选事件'));
});

test('Source review completion preserves a newly chosen stats view', async () => {
  const e = adminEnvironment(); await connectAdmin(e);
  e.node('#refresh').onclick();
  e.pending[1].respond([{id: 'source-a', name: 'Source', name_zh: 'Example', url: 'https://source.example/', source_type: 'rss', config: {}, verification_status: 'pending', adapter: 'rss', enabled: false, poll_profile: 'daily', consecutive_failures: 0}]); await turn();
  await e.click({review: 'source-a'});
  const form = e.node('#review-form');
  form.values = {decision: 'verified', method: 'manual_review', evidence_url: 'https://source.example/', evidence_text: 'Verified official source'};
  const saving = form.onsubmit({preventDefault() {}, target: form});
  e.node('#close').onclick(); e.node('#analytics').onclick();
  e.pending[3].respond(statistics()); await turn();
  const current = e.node('#admin-content').innerHTML;
  e.pending[2].respond({}); await saving; await turn();
  assert.equal(e.pending.length, 4, 'Stale save must not request the sources view again');
  assert.equal(e.node('#admin-content').innerHTML, current);
});

test('A pending modal loader does not reopen a management dialog over a new stats view', async () => {
  const e = adminEnvironment(); await connectAdmin(e);
  e.node('#add').onclick();
  assert.equal(e.pending[1].url, '/api/companies?history=true&limit=200');
  e.node('#analytics').onclick(); e.pending[2].respond(statistics()); await turn();
  e.pending[1].respond({items: []}); await turn();
  assert.equal(e.node('#dialog').open, false);
  assert(e.node('#admin-content').innerHTML.includes('analytics-dashboard'));
});

test('Stats failure is visible and does not manufacture zero metrics', async () => {
  const e = adminEnvironment(); e.panel.mount(e.root);
  e.node('#token').value = 'expired'; e.node('#login').onclick();
  e.pending[0].respond({detail: 'Invalid admin token'}, false); await turn();
  assert(e.node('#message').innerHTML.includes('Invalid admin token'));
  assert(e.node('#admin-content').innerHTML.includes('重试统计'));
  assert(!e.node('#admin-content').innerHTML.includes('analytics-card'));
});

test('The collector and accessible privacy note are included in the existing application', () => {
  const html = fs.readFileSync('dist/index.html', 'utf8');
  assert(html.includes('<script src="/analytics.js"></script>'));
  assert(html.includes('<details class="statistics-notice">'));
  assert(html.includes('id="analytics-privacy-state"'));
  assert(html.includes('href="/guides" data-nav="guides"'));
  assert(html.includes('href="/briefings" data-nav="briefings"'));
  assert(!/localStorage|sessionStorage/.test(adminSource), 'Admin credentials must not enter browser storage');
});
