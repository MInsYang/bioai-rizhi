(function () {
  "use strict";
  const IDLE_MS = 30 * 60 * 1000;
  const STORAGE_KEY = "bioai-analytics-session-v1";
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const SLUG = /^[a-z0-9][a-z0-9_-]{0,119}$/;
  const GUIDES = new Set(["virtual-cell-models", "ai-drug-discovery-collaborations", "weekly-reading-method"]);
  const TOPICS = new Set(["virtual-cell", "organoid", "virtual-embryo", "virtual-organ", "drug-discovery"]);
  const ROUTES = new Set(["overview", "timeline", "hot", "academic", "directory", "sources", "saved", "news", "daily", "connect"]);

  function dateIdentifier(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + "T00:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function routePath(raw) {
    if (typeof raw !== "string" || raw.length > 256) return null;
    const parts = raw.split("/");
    const name = ({models: "academic", companies: "directory", favorites: "saved"})[parts[0]] || parts[0];
    if (parts.length === 1) {
      if (name === "frontpage" || name === "") return "/";
      return ROUTES.has(name) ? "/#" + name : null;
    }
    if (parts.length !== 2) return null;
    const id = parts[1];
    if (name === "topic" && TOPICS.has(id)) return "/topics/" + id;
    if (name === "company" && SLUG.test(id)) return "/companies/" + id;
    if (name === "record" && UUID.test(id)) return "/records/" + id.toLowerCase();
    if (name === "event" && UUID.test(id)) return "/events/" + id.toLowerCase();
    if (name === "daily" && dateIdentifier(id)) return "/digest/" + id;
    return null;
  }

  // Only the application's public routes are accepted. Query strings never leave the page.
  function normalizePath(location) {
    const pathname = String(location.pathname || "/");
    if (pathname.length > 256 || /[?#]/.test(pathname)) return null;
    if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;
    if (location.hash) return routePath(String(location.hash).replace(/^#/, "").split(/[?&]/, 1)[0]);
    if (pathname === "/" || pathname === "/index.html") return "/";
    if (pathname === "/guides" || pathname === "/briefings") return pathname;
    if (pathname.startsWith("/guides/") && GUIDES.has(pathname.slice(8))) return pathname;
    const parts = pathname.slice(1).split("/");
    if (parts.length === 1) return routePath(parts[0]);
    const aliases = {topics: "topic", companies: "company", records: "record", events: "event", digest: "daily"};
    return aliases[parts[0]] ? routePath(aliases[parts[0]] + "/" + parts.slice(1).join("/")) : null;
  }

  function hostname(value) {
    const host = String(value || "").toLowerCase();
    if (host.length > 253 || /(?:^|\.)(?:localhost|local|internal|invalid)$/.test(host) || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host)) return null;
    if (/^\d+(?:\.\d+){3}$/.test(host) || !host.includes(".") || host.split(".").some(part => !part || part.length > 63 || part.startsWith("-") || part.endsWith("-"))) return null;
    if (!/[a-z]/.test(host.split(".").pop())) return null;
    return host;
  }

  function referrerHost(referrer, origin) {
    try {
      const url = new URL(referrer);
      if (origin && url.origin === origin) return null;
      return /^(https?:)$/.test(url.protocol) ? hostname(url.hostname) : null;
    } catch { return null; }
  }

  function actionFor(element, location) {
    if (!element || !normalizePath(location) || element.closest?.("#admin-root") || element.disabled) return null;
    const resource = element.closest?.("[data-record],[data-event]");
    const id = resource?.dataset.record || resource?.dataset.event;
    if (UUID.test(id || "")) return {event_type: "resource_open", target: id.toLowerCase()};
    const copy = element.closest?.("[data-copy]");
    if (copy) {
      try {
        const url = new URL(copy.dataset.copy, location.origin);
        if (url.origin === location.origin && url.pathname === "/mcp") return {event_type: "mcp_copy", target: "mcp"};
        if (url.origin === location.origin && url.pathname === "/feed.xml") return {event_type: "rss_click", target: "rss"};
      } catch { /* A copied value is never sent to the collector. */ }
    }
    const link = element.closest?.("a[href]");
    if (!link) return null;
    try {
      const url = new URL(link.getAttribute("href"), location.origin + location.pathname);
      if (!/^(https?:)$/.test(url.protocol) || url.username || url.password) return null;
      if (url.origin !== location.origin) {
        const host = hostname(url.hostname);
        return host ? {event_type: "outbound_click", target: host} : null;
      }
      if (url.pathname === "/feed.xml") return {event_type: "rss_click", target: "rss"};
      const path = normalizePath(url);
      const company = path?.match(/^\/companies\/([a-z0-9_-]+)$/);
      if (company) return {event_type: "company_open", target: company[1]};
      const resourcePath = path?.match(/^\/(?:records|events)\/([0-9a-f-]+)$/);
      if (resourcePath) return {event_type: "resource_open", target: resourcePath[1]};
    } catch { /* Unrecognized links are outside the telemetry schema. */ }
    return null;
  }

  function createCollector(env) {
    let state = null, loaded = false, lastPage = null, started = false, activeRequests = 0;
    let rateStart = 0, rateCount = 0, lastStorageWrite = 0;
    const now = () => env.Date ? env.Date.now() : Date.now();
    const allowed = () => env.navigator?.doNotTrack !== "1" && env.navigator?.doNotTrack !== "yes" && env.doNotTrack !== "1" && env.navigator?.globalPrivacyControl !== true;
    const randomId = () => {
      if (env.crypto?.randomUUID) return env.crypto.randomUUID();
      if (!env.crypto?.getRandomValues) return null;
      const bytes = env.crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
      return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
    };
    function persist(at, force = false) {
      if (!force && at - lastStorageWrite < 5000) return;
      try { env.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Storage may be disabled. */ }
      lastStorageWrite = at;
    }
    function session(at) {
      if (!loaded) {
        loaded = true;
        try { state = JSON.parse(env.sessionStorage.getItem(STORAGE_KEY)); } catch { state = null; }
      }
      if (!state || !UUID.test(state.id || "") || !Number.isFinite(state.last_activity) || at - state.last_activity >= IDLE_MS || state.last_activity > at) {
        const id = randomId();
        if (!id) return null;
        state = {id, last_activity: at};
      }
      state = {id: state.id, last_activity: at, ...(state.traffic_type === "test" ? {traffic_type: "test"} : {})};
      persist(at, true);
      return state.id;
    }
    function touch() {
      if (!allowed() || !normalizePath(env.location) || !state) return;
      const at = now();
      if (at - state.last_activity >= IDLE_MS) { pageView(); return; }
      state.last_activity = at;
      persist(at);
    }
    function send(event) {
      if (!allowed()) return false;
      const path = normalizePath(env.location);
      if (!path || typeof env.fetch !== "function") return false;
      const at = now();
      if (at - rateStart >= 60000) { rateStart = at; rateCount = 0; }
      if (rateCount >= 45 || activeRequests >= 4) return false;
      const eventId = randomId(), sessionId = session(at);
      if (!eventId || !sessionId) return false;
      const payload = {event_id: eventId, session_id: sessionId, event_type: event.event_type, path};
      if (event.target) payload.target = event.target;
      const referrer = referrerHost(env.document.referrer, env.location.origin);
      if (referrer) payload.referrer_host = referrer;
      if (new URLSearchParams(env.location.search).get("analytics_test") === "1") {
        state.traffic_type = "test";
        persist(at, true);
      }
      if (state.traffic_type === "test") payload.traffic_type = "test";
      const body = JSON.stringify(payload);
      if (body.length > 2048) return false;
      rateCount++; activeRequests++;
      try {
        Promise.resolve(env.fetch("/api/telemetry", {method: "POST", credentials: "same-origin", mode: "same-origin", cache: "no-store", headers: {"Content-Type": "application/json"}, body, keepalive: true})).catch(() => {}).finally(() => { activeRequests--; });
      } catch { activeRequests--; }
      return true;
    }
    function pageView() {
      const path = normalizePath(env.location);
      if (!path) { lastPage = null; return; }
      const expired = !state || now() - state.last_activity >= IDLE_MS;
      if ((path !== lastPage || expired) && send({event_type: "page_view"})) lastPage = path;
    }
    function recordAction(event) {
      const action = actionFor(event.target, env.location);
      if (action) { pageView(); send(action); }
    }
    function start() {
      if (started) return;
      started = true;
      pageView();
      env.addEventListener("hashchange", pageView);
      env.addEventListener("popstate", pageView);
      env.document.addEventListener("click", recordAction, {capture: true});
      for (const event of ["pointerdown", "keydown", "scroll"]) env.addEventListener(event, touch, {passive: true});
      const notice = env.document.getElementById?.("analytics-privacy-state");
      if (notice) notice.textContent = allowed() ? "当前浏览器未发出 DNT / GPC 停止统计信号。" : "当前浏览器已发出 DNT / GPC 信号，网页事件不采集。";
    }
    return {start, pageView, recordAction, touch};
  }

  if (typeof module !== "undefined" && module.exports) module.exports = {normalizePath, referrerHost, actionFor, createCollector};
  else if (typeof window !== "undefined") createCollector(window).start();
})();
