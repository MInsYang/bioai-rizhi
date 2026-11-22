const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('dist/index.html');
const app = read('dist/app.js');
const css = read('dist/style.css');

function themeControl(markup, id) {
  const select = markup.match(new RegExp('<select\\b[^>]*id="' + id + '"[^>]*>([^]*?)</select>'));
  assert(select, 'A native theme select must be available in this view');
  assert(select[0].includes('data-theme-select'));
  assert(select[0].includes('aria-label='));
  assert(markup.includes('for="' + id + '"'), 'The control retains its associated label');
  assert(markup.includes('data-theme-label'));
  assert.deepEqual([...select[1].matchAll(/value="([^"]+)"/g)].map(match => match[1]), ['auto', 'day', 'night']);
}

test('the initial shell resolves appearance before CSS and exposes the shared controller contract', () => {
  const script = html.match(/<script\b[^>]*src="\/theme\.js[^]*?<\/script>/)[0];
  assert(script.includes('data-theme-key="bioai.theme"'));
  assert(script.includes('data-day-color="#f3f0e5"'));
  assert(script.includes('data-night-color="#171d1b"'));
  assert(!/\b(?:async|defer)\b/.test(script));
  assert(html.indexOf(script) < html.indexOf('rel="stylesheet"'));
  themeControl(html, 'site-theme');
});

test('the rendered newspaper offers the same automatic and manual modes beside language', async () => {
  const content = {innerHTML: ''};
  const frontpage = vm.runInNewContext('(' + app.match(/async function frontpage\(n\) \{[^]*?\n  \}/)[0] + ')', {
    api: async () => ({items: [], last_success_at: null}),
    content, epoch: 1, focusTopics: [],
    selectIndustryHeadlines: rows => rows,
    tr: text => text,
    esc: value => String(value ?? ''), newspaperRecord: () => '',
    l: {locale: 'en', control: id => '<select id="' + id + '" data-language-select></select>'},
  });
  await frontpage(1);
  themeControl(content.innerHTML, 'frontpage-theme');
  assert(content.innerHTML.includes('data-language-select'));
  for (const link of ['#daily', '#connect', '#overview']) assert(content.innerHTML.includes('href="' + link + '"'));
  const controlStyle = css.match(/\.theme-control select\s*\{([^}]+)\}/)[1];
  assert(/min-height:\s*44px/.test(controlStyle), 'Native controls retain a 44px pointer target');
  assert(css.includes('.theme-control select:focus-visible'));
});

function tokens(block) {
  return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]));
}

function resolve(values, key) {
  const value = values[key];
  assert(value, 'Missing color role: ' + key);
  const alias = value.match(/^var\((--[\w-]+)\)$/);
  return alias ? resolve(values, alias[1]) : value;
}

function luminance(value) {
  let hex = value.replace('#', '');
  if (hex.length === 3) hex = [...hex].map(char => char + char).join('');
  assert(/^[\da-f]{6}$/i.test(hex), 'Expected an opaque color, received ' + value);
  const rgb = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = rgb.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (values[1] + 0.05) / (values[0] + 0.05);
}

test('both palettes retain readable text, primary states, controls and graph data', () => {
  const day = tokens(css.match(/:root\s*\{([^}]+)\}/)[1]);
  const night = {...day, ...tokens(css.match(/html\[data-theme="night"\]\s*\{([^}]+)\}/)[1])};
  const textPairs = [
    ['--ink', '--bg'], ['--muted', '--bg'], ['--muted', '--paper'],
    ['--muted', '--mint'], ['--muted', '--soft-bg'], ['--muted', '--surface'],
    ['--muted', '--news-bg'], ['--green', '--paper'], ['--nav-ink', '--surface'],
    ['--gold-ink', '--gold-bg'], ['--error-ink', '--error-bg'],
    ['--news-ink', '--news-bg'], ['--news-muted', '--news-bg'],
    ['--news-accent', '--news-bg'], ['--news-excerpt', '--news-bg'],
    ['--on-action', '--action-bg'], ['--on-action', '--action-hover'],
    ['--muted', '--analytics-bg'],
  ];
  const graphicsPairs = [
    ['--control-line', '--paper'], ['--control-line', '--news-bg'], ['--focus', '--bg'],
    ['--graph-edge', '--bg'], ['--graph-node-border', '--graph-node'],
    ['--series-page', '--analytics-bg'], ['--series-clicks', '--analytics-bg'],
    ['--series-mcp', '--analytics-bg'],
  ];
  for (const [name, values] of [['day', day], ['night', night]]) {
    for (const [pairs, minimum] of [[textPairs, 4.5], [graphicsPairs, 3]]) {
      for (const [foreground, background] of pairs) {
        const ratio = contrast(resolve(values, foreground), resolve(values, background));
        assert(ratio >= minimum, name + ': ' + foreground + '/' + background + ' contrast ' + ratio.toFixed(2) + ' is below ' + minimum);
      }
    }
  }
  assert(css.includes('color-scheme: dark'));
  assert(!/filter:\s*invert\(/.test(css), 'Brand and source images retain their original colors');
});
