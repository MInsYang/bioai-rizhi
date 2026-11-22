/* Shared visitor-local-time appearance. No network, location or account data. */
(function (global) {
  'use strict';
  const MODES = ['auto', 'day', 'night'];
  const COPY = {
    'zh-CN': { label: '配色', auto: '跟随时间', day: '日间', night: '夜间', hint: '自动：按你设备的当地时间，07:00–19:00 使用日间配色；其他时间使用夜间配色。手动选择会在此浏览器记住。' },
    'zh-Hant': { label: '配色', auto: '隨時間', day: '日間', night: '夜間', hint: '自動：依你裝置的當地時間，07:00–19:00 使用日間配色；其他時間使用夜間配色。手動選擇會在此瀏覽器記住。' },
    en: { label: 'Appearance', auto: 'Automatic', day: 'Day', night: 'Night', hint: 'Automatic uses your device’s local time: day from 07:00 to 19:00, night otherwise. Manual choices are remembered in this browser.' }
  };
  function automaticTheme(date) {
    const hour = date.getHours();
    return hour >= 7 && hour < 19 ? 'day' : 'night';
  }
  function createTheme(env, options = {}) {
    const doc = env.document;
    const root = doc.documentElement;
    const script = options.script || doc.currentScript;
    const key = options.key || script?.dataset.themeKey || 'wanxiang.theme';
    const colors = { day: options.dayColor || script?.dataset.dayColor || '#f5f0e7', night: options.nightColor || script?.dataset.nightColor || '#141310' };
    let mode = 'auto';
    let theme = null;
    let started = false;
    let timer;
    const now = options.now || (() => new env.Date());
    try { const saved = env.localStorage.getItem(key); if (MODES.includes(saved)) mode = saved; } catch { /* Still works when storage is blocked. */ }
    function refresh() {
      const copy = COPY[root.lang] || COPY['zh-CN'];
      for (const label of doc.querySelectorAll('[data-theme-label]')) {
        if (label.textContent !== copy.label) label.textContent = copy.label;
      }
      for (const select of doc.querySelectorAll('select[data-theme-select]')) {
        select.value = mode;
        select.setAttribute('aria-label', copy.label);
        select.setAttribute('title', copy.hint);
        for (const option of select.options) {
          if (copy[option.value] && option.textContent !== copy[option.value]) option.textContent = copy[option.value];
        }
      }
      for (const hint of doc.querySelectorAll('[data-theme-hint]')) {
        if (hint.textContent !== copy.hint) hint.textContent = copy.hint;
      }
      for (const img of doc.querySelectorAll('img[data-theme-day][data-theme-night]')) {
        const source = img.getAttribute('data-theme-' + theme);
        if (source && img.getAttribute('src') !== source) img.setAttribute('src', source);
        img.setAttribute('data-theme-ready', 'true');
      }
      const meta = doc.querySelector('meta[name="theme-color"]');
      if (meta && theme) meta.setAttribute('content', colors[theme]);
    }
    function apply() {
      const next = mode === 'auto' ? automaticTheme(now()) : mode;
      const changed = next !== theme;
      theme = next;
      root.setAttribute('data-theme', theme);
      root.setAttribute('data-theme-mode', mode);
      root.style.colorScheme = theme === 'day' ? 'light' : 'dark';
      refresh();
      if (changed && started) env.dispatchEvent(new env.CustomEvent('wxthemechange', { detail: { theme, mode } }));
    }
    function schedule() {
      if (timer) env.clearTimeout(timer);
      if (mode !== 'auto') return;
      // Check at each local minute and on returning to the page. This catches
      // the 07:00/19:00 boundaries and device timezone/clock changes.
      const current = now();
      const delay = 60000 - current.getSeconds() * 1000 - current.getMilliseconds();
      timer = env.setTimeout(() => { apply(); schedule(); }, Math.max(25, delay));
    }
    function setMode(next) {
      if (!MODES.includes(next)) return;
      mode = next;
      try { if (mode === 'auto') env.localStorage.removeItem(key); else env.localStorage.setItem(key, mode); } catch { /* In-memory choice still applies. */ }
      apply(); schedule();
    }
    function resume() { apply(); schedule(); }
    function start() {
      if (started) return;
      started = true;
      refresh();
      doc.addEventListener('change', event => {
        if (event.target.matches?.('select[data-theme-select]')) setMode(event.target.value);
      });
      doc.addEventListener('visibilitychange', () => { if (doc.visibilityState !== 'hidden') resume(); });
      env.addEventListener('pageshow', resume);
      env.addEventListener('focus', resume);
      env.addEventListener('storage', event => {
        if (event.storageArea) {
          try { if (event.storageArea !== env.localStorage) return; } catch { return; }
        }
        if (event.key !== key && event.key !== null) return;
        if (event.key === null || event.newValue === null) mode = 'auto';
        else mode = MODES.includes(event.newValue) ? event.newValue : 'auto';
        resume();
      });
      if (env.MutationObserver) {
        new env.MutationObserver(refresh).observe(root, { attributes: true, attributeFilter: ['lang'] });
        new env.MutationObserver(records => {
          if (records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches?.('[data-theme-select],[data-theme-label],[data-theme-hint],img[data-theme-day],meta[name="theme-color"]') || node.querySelector?.('[data-theme-select],[data-theme-label],[data-theme-hint],img[data-theme-day],meta[name="theme-color"]'))))) refresh();
        }).observe(doc.body, { childList: true, subtree: true });
      }
      schedule();
    }
    // Runs synchronously in <head>, before styles, to avoid a wrong-palette flash.
    apply();
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
    return { get mode() { return mode; }, get theme() { return theme; }, setMode, refresh, update: resume };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { automaticTheme, createTheme };
  else global.WXTheme = createTheme(global);
})(typeof window !== 'undefined' ? window : globalThis);
