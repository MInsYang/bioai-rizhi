/* One application, one database API. Historical JSON snapshots are never loaded. */
(() => {
  "use strict";
  const l = window.BioAILocale, tr = (key, vars) => l.t(key, vars);
  const $ = (s) => document.querySelector(s),
    content = $("#content");
  const publicationSnapshot = content.querySelector('[data-publication-view]')
    ? { html: content.innerHTML, title: document.title }
    : null;
  const searchEditorial = content.querySelector('[data-search-editorial]')?.outerHTML || '';
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const names = {
    frontpage: "日知头版",
    overview: "全站看板",
    news: "新闻与文章",
    daily: "每日摘要",
    connect: "连接你的 AI",
    guides: "专题指南",
    briefings: "本周收录",
    timeline: "产业进展",
    hot: "Hot 关系图",
    academic: "学术进展",
    directory: "公司黄页",
    sources: "信息来源",
    saved: "我的关注",
    admin: "管理工作台",
  };
  const tracks = ["测序与多组学", "生物医药", "AI与模型数据", "学术进展"];
  const focusTopics = [
    ["virtual-cell", "AI 虚拟细胞", "细胞基础模型、扰动预测与数字细胞"],
    ["organoid", "类器官", "类器官模型、计算分析与 AI 药物筛选"],
    ["virtual-embryo", "虚拟胚胎", "计算发育模型与相关胚胎模型研究"],
    ["virtual-organ", "虚拟器官", "器官数字孪生、计算建模与仿真"],
    ["drug-discovery", "AI 制药", "生成式分子设计、药物发现与虚拟筛选"],
  ];
  const topicName = (id) => { const topic = focusTopics.find(t => t[0] === id); return topic ? tr(topic[1]) : id; };
  const topicLinks = () => `<div class="topic-grid">${focusTopics.map(([id, label, text], i) => `<a class="topic-card" href="#topic/${id}"><small>0${i+1} / RESEARCH TRACK</small><strong>${tr(label)}</strong><span>${tr(text)}</span><b aria-hidden="true">↗</b></a>`).join("")}</div>`;
  const newsState = { q: "", topic: "", kind: "false", days: "30" };
  const types = {
    funding: "融资",
    partnership: "合作",
    acquisition: "并购",
    licensing: "授权",
    product: "产品发布",
    clinical: "临床进展",
    regulatory: "监管",
    strategy: "战略布局",
    paper: "论文",
    model: "模型",
    dataset: "数据集",
    other: "其他进展",
  };
  const predicates = {
    collaborates_with: "合作",
    invests_in: "投资",
    acquires: "收购",
    licenses_from: "获得授权",
    co_develops: "共同开发",
    adopts_platform: "采用平台",
    co_publishes: "共同发表",
  };
  let epoch = 0,
    dialogEpoch = 0,
    page = 0,
    sourceRows = [],
    current = "frontpage";
  const state = {
    days: "30",
    q: "",
    region: "",
    event_type: "",
    start: "",
    end: "",
    academic: false,
    lanes: tracks.slice(0, 3),
  };
  const paperState = { q: "", source: "", days: "30", picked: false, journal_tier: "selected" };
  let watchlistNotice = null;
  function watchlistMessage() {
    if (!watchlistNotice) return "";
    return watchlistNotice.type === "export"
      ? tr("已导出关注名单。公司数：{count}。请在另一台设备的“我的关注”导入此文件。", {count: watchlistNotice.count})
      : tr("导入完成，新增公司：{added}{skipped}。现有关注已保留。", {added: watchlistNotice.added, skipped: watchlistNotice.skipped ? tr("；跳过未匹配名称：{count}", {count: watchlistNotice.skipped}) : ""});
  }
  function parseWatchlist(text) {
    const data = JSON.parse(text);
    if (!data || data.schema !== "bioai-watchlist" || data.version !== 1 || !Array.isArray(data.company_slugs) || data.company_slugs.length > 1000 || data.company_slugs.some(slug => typeof slug !== "string" || !slug || slug.length > 200))
      throw Error(tr("文件不是受支持的 BioAI 关注名单，请使用本站导出的 JSON 文件。"));
    return [...new Set(data.company_slugs)];
  }
  function date(s, full = false) { return l.date(s, full); }
  function anchor(u, t) {
    return /^https:\/\//.test(u || "")
      ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)} ↗</a>`
      : esc(t);
  }
  async function api(path) {
    let r;
    try { r = await fetch(l.url(path), { headers: { Accept: "application/json" } }); }
    catch { throw Error(tr("网络连接失败，请检查连接后重试。")); }
    if (!r.headers.get("content-type")?.includes("application/json"))
      throw Error(tr("数据服务暂不可用。请确认后端已启动，再刷新重试。"));
    let d;
    try { d = await r.json(); }
    catch { throw Error(tr("数据服务暂不可用。请确认后端已启动，再刷新重试。")); }
    if (!r.ok)
      throw Error(
        typeof d.detail === "string" ? d.detail : tr("请求未成功，请稍后重试。"),
      );
    return d;
  }
  function heading(title, kicker, desc, sourceOriginal = false) {
    return `<div class="page-heading"><div><p class="eyebrow">${tr(kicker)}</p><h1${sourceOriginal ? " data-source-original" : ""}>${esc(sourceOriginal ? title : tr(title))}</h1><p class="lede">${esc(sourceOriginal ? desc : tr(desc))}</p><p class="original-language-note">${tr("标题、摘要与证据保留原始来源语言。")}</p></div></div>`;
  }
  function empty(title, desc, link = "#directory", label = tr("浏览公司黄页")) {
    return `<div class="empty"><div class="empty-mark">⌁</div><strong>${esc(title)}</strong><p>${esc(desc)}</p>${link ? `<a class="text-link" href="${link}">${esc(label)} →</a>` : ""}</div>`;
  }
  function pager(total, limit) {
    return total > limit
      ? `<div class="pager"><button data-page="${page - 1}" ${page === 0 ? "disabled" : ""}>${tr("上一页")}</button><span>${page + 1} / ${Math.ceil(total / limit)}</span><button data-page="${page + 1}" ${(page + 1) * limit >= total ? "disabled" : ""}>${tr("下一页")}</button></div>`
      : "";
  }
  function recordCard(r) {
    const a = r.academic;
    const recordTopics = r.topics || r.classification?.topic_ids || [];
    return `<article class="record"><div class="record-meta"><span class="pill ${a?.status === "preprint" ? "gold" : "green"}">${a ? (a.status === "preprint" ? tr("预印本") + (a.version ? " · v" + a.version : tr(" · 版本未标注")) : tr("学术索引收录")) : tr("原文线索")}</span><span>${esc(a?.journal || r.source_name)}${a?.journal ? " · " + esc(r.source_name) : ""}</span><time>${r.published_at ? (new Date(r.published_at) > new Date() ? tr("来源刊期（晚于当前日期） ") : "") + date(r.published_at) : tr("收录于 ") + date(r.fetched_at)}</time></div><h3 data-source-original><button data-record="${r.id}">${esc(r.title)}</button></h3><p>${esc(r.excerpt?.slice(0, 180) || tr("摘要暂未提供，点击查看原文。"))}</p><div class="record-foot">${r.company_slug ? `<a href="#company/${r.company_slug}">${esc(l.companyName(r))}</a>` : `<small>${a?.doi ? "DOI " + esc(a.doi) : tr("尚未转为已核验事件")}</small>`}<span>${anchor(r.canonical_url, tr("原文"))} · <a href="/records/${r.id}">${tr("分享页 ↗")}</a></span></div>${recordTopics.length ? `<div class="tags topic-tags">${recordTopics.map(t=>`<a class="tag" href="#topic/${esc(t)}">${esc(topicName(t))}</a>`).join("")}</div>` : ""}</article>`;
  }
  function newspaperRecord(r, lead = false) {
    return `<article class="newspaper-story ${lead ? "newspaper-lead" : ""}"><p class="newspaper-byline"><span>${esc(r.academic?.journal || l.companyName(r) || r.source_name)}</span><time>${r.published_at && new Date(r.published_at) <= new Date() ? date(r.published_at) : tr("收录 ") + date(r.fetched_at)}</time></p><h${lead ? "2" : "3"}><button data-record="${esc(r.id)}">${esc(r.title)}</button></h${lead ? "2" : "3"}>${lead ? `<p class="newspaper-excerpt">${esc(r.excerpt?.slice(0, 250) || tr("从公司官方披露与原始报道，追踪这条进展的细节与出处。"))}</p>` : ""}<div class="newspaper-story-foot"><span>${r.academic ? tr("重点期刊 · 学术原文") : tr("行业原文")}</span>${anchor(r.canonical_url, tr("阅读原文"))}</div></article>`;
  }
  function selectIndustryHeadlines(items) {
    const eventSignal = r => Array.isArray(r.industry_classification?.event_types) && r.industry_classification.event_types.length > 0;
    const recentDate = r => Math.min(Date.parse(r.published_at || r.fetched_at) || 0, Date.parse(r.fetched_at) || Date.now());
    return [...items].sort((a, b) => Number(eventSignal(b)) - Number(eventSignal(a)) || recentDate(b) - recentDate(a)).slice(0, 5);
  }
  async function frontpage(n) {
    const [o, industry, ev, papers] = await Promise.all([
      api("/api/overview"),
      api("/api/records?academic=false&days=30&limit=20"),
      api("/api/events?days=30&limit=3"),
      api("/api/records?academic=true&journal_tier=selected&days=30&limit=2"),
    ]);
    if (n !== epoch) return;
    const industryHeadlines = selectIndustryHeadlines(industry.items);
    const edition = new Date().toLocaleDateString(l.locale, { year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Shanghai" });
    const sections = [
      ["01", tr("行业动态"), tr("公司公告、融资消息、产品与临床进展，从原始出处了解产业变化。"), "#news", tr("阅读行业原文")],
      ["02", tr("合作与布局"), tr("沿时间线追踪合作、授权、投资与并购，在 Hot 图中查看公司联系。"), "#timeline", tr("打开产业进展")],
      ["03", "学术进展", tr("重点期刊与主题相关研究，为生物医药产业方向提供证据与新方法。"), "#academic", tr("浏览重点期刊")],
      ["04", tr("公司黄页"), tr("检索中国与海外公司、历史品牌、官方网站及其最新动态。"), "#directory", tr("查找公司档案")],
    ];
    content.innerHTML = `<div class="newspaper">
      <header class="newspaper-masthead">
        <div class="newspaper-utility"><span>${tr("问象 · WENXIANG")}</span><nav aria-label="${tr("头版快捷导航")}"><a href="#daily">${tr("每日摘要")}</a><a href="#connect">${tr("MCP 与订阅")}</a><a href="#overview">${tr("进入全站看板")} <span aria-hidden="true">↗</span></a>${l.control("frontpage-language")}<label class="theme-control" for="frontpage-theme"><span class="visually-hidden" data-theme-label>配色</span><select id="frontpage-theme" data-theme-select aria-label="配色"><option value="auto">跟随时间</option><option value="day">日间</option><option value="night">夜间</option></select></label></nav></div>
        <div class="newspaper-nameplate"><div class="newspaper-mark"><img src="/assets/wenxiang-mark.png" alt="${tr("问象 Logo")}"><div><h1>${tr("BioAI 日知")}</h1><p>AI × LIFE SCIENCE <span>${tr("连接生物与智能，追踪每一步进展。")}</span></p></div></div><p class="newspaper-edition">${tr("生物医药产业观察")}<span>THE BIOAI DAILY</span></p></div>
        <div class="newspaper-dateline"><time>${esc(edition)} ${tr("· 北京时间")}</time><span>${tr("每小时更新 · 保留原始出处")}</span><a href="#sources">${tr("来源与更新状态 ↗")}</a></div>
      </header>
      <section class="newspaper-intro" aria-label="${tr("关于日知")}"><p>${tr("产业是主线，研究是依据。")}</p><span>${tr("关注 AI 如何走进生物医药：从虚拟生命模型，到药物研发与公司合作。")}</span></section>
      <nav class="newspaper-sections" aria-label="${tr("栏目导读")}">${sections.map(([num, title, desc, href, label]) => `<a href="${href}" class="newspaper-section"><span class="newspaper-section-index">${num} ${tr("/ 栏目")}</span><h2>${tr(title)}<span aria-hidden="true">↗</span></h2><p>${tr(desc)}</p><strong>${tr(label)}</strong></a>`).join("")}</nav>
      <div class="newspaper-body">
        <section class="newspaper-industry" aria-labelledby="industry-title"><div class="newspaper-section-title"><h2 id="industry-title">${tr("产业来信")} <small>INDUSTRY DISPATCHES</small></h2><a href="#news">${tr("全部动态 ↗")}</a></div>${industryHeadlines.length ? `<div class="newspaper-stories">${newspaperRecord(industryHeadlines[0], true)}<div class="newspaper-briefs">${industryHeadlines.slice(1).map(r => newspaperRecord(r)).join("")}</div></div>` : `<div class="newspaper-empty"><h3>${tr("等待新的行业来信")}</h3><p>${tr("近 30 天暂未收录符合主题的公司原文。可浏览历史内容，或检查来源更新状态。")}</p><a href="#news">${tr("进入行业栏目 →")}</a></div>`}<p class="newspaper-provenance"><span class="original-language-note">${tr("标题、摘要与证据保留原始来源语言。")}</span> ${tr("原文收录与事件核验分别标注。最近成功采集：")}${o.last_success_at ? date(o.last_success_at, true) : tr("尚无记录")}${tr("。")}</p></section>
        <aside class="newspaper-side"><section aria-labelledby="deals-title"><div class="newspaper-section-title"><h2 id="deals-title">${tr("合作与产业进展")}</h2><span class="newspaper-small-label">${tr("证据核验")}</span></div>${ev.items.length ? ev.items.map(e => `<article class="newspaper-deal"><p class="newspaper-byline"><span>${esc(l.label(types[e.event_type] || e.event_type))}</span><time>${date(e.display_date)}</time></p><h3><button data-event="${esc(e.id)}">${esc(e.title)}</button></h3><p>${esc(e.summary?.slice(0, 105) || tr("查看公司关联与原始证据。"))}</p><small>${tr("原文证据：{count}", {count: e.evidence_count})}</small></article>`).join("") : `<div class="newspaper-empty"><p>${tr("已核验的合作、融资与布局进展将在这里展示。公司公告可先从行业原文阅读。")}</p></div>`}<div class="newspaper-inline-links"><a href="#timeline">${tr("查看时间线 ↗")}</a><a href="#hot">${tr("打开 Hot 关系图 ↗")}</a></div></section><section class="newspaper-research" aria-labelledby="research-title"><div class="newspaper-section-title"><h2 id="research-title">${tr("研究参照")}</h2><a href="#academic">${tr("学术版 ↗")}</a></div>${papers.items.map(r => newspaperRecord(r)).join("") || `<p class="newspaper-empty">${tr("当前窗口暂无收录，学术版可查看历史记录。")}</p>`}</section></aside>
      </div>
      <section class="newspaper-topics" aria-labelledby="topics-title"><div class="newspaper-section-title"><h2 id="topics-title">${tr("持续关注的五个赛道")}</h2><a href="#overview">${tr("打开完整看板 ↗")}</a></div><div class="newspaper-topic-list">${focusTopics.map(([id, label, desc], i) => `<a href="#topic/${id}"><small>0${i + 1}</small><h3>${tr(label)}</h3><p>${tr(desc)}</p></a>`).join("")}</div></section>
      <section class="newspaper-bottom"><a href="#directory"><span class="newspaper-small-label">COMPANY DIRECTORY</span><h2>${tr("一条新闻，连回一家公司的全貌。")}</h2><p>${tr("从新格元、寻因、诺禾致源到海外生物医药公司，检索中英文名称、历史品牌与官方信息。")}</p><strong>${tr("打开公司黄页 →")}</strong></a><a href="#connect"><span class="newspaper-small-label">READ WITH YOUR AI</span><h2>${tr("让日知进入你的阅读工作流。")}</h2><p>${tr("通过 RSS 订阅更新，或用公开只读 MCP，让你的 AI 查询公司、文章与信息来源。")}</p><strong>${tr("查看订阅与 MCP 接入 →")}</strong></a></section>
      <p class="newspaper-colophon">${tr("问象出品 · 以可追溯的原文连接行业动态、公司与研究。")}<a href="#sources">${tr("查看来源覆盖")}</a></p>
    </div>`;
  }
  function paperLabels(items) {
    return (items || [])
      .map(
        (a) =>
          `<span class="pill ${a.status === "preprint" ? "gold" : "green"}">${a.status === "preprint" ? tr("预印本") + (a.version ? " · v" + a.version : tr(" · 版本未标注")) : tr("学术索引收录")}</span>`,
      )
      .join("");
  }
  function eventCard(e) {
    return `<article class="card"><div class="record-meta"><span class="pill green">${esc(l.label(types[e.event_type] || e.event_type))}</span><time>${date(e.display_date)}</time>${paperLabels(e.academic)}</div><h3><button class="text-link" data-event="${e.id}" style="padding:0;border:0;text-align:left;font:inherit;color:inherit;background:none">${esc(e.title)}</button></h3><p class="lede">${esc(e.summary?.slice(0, 160))}</p>${e.details?.amount || e.details?.stage ? `<p class="source-note">${esc(e.details.amount)} ${esc(e.details.stage)}</p>` : ""}<div class="tags" style="margin:14px 0">${e.companies.map((c) => `<a class="tag" href="#company/${c.slug}">${esc(l.companyName(c))}</a>`).join("")}</div><div class="record-foot"><small>${tr("证据：{count}", {count: e.evidence_count})}${e.editor_pick ? tr(" · 编辑精选") : ""}</small><button data-event="${e.id}">${tr("查看证据 ↗")}</button></div></article>`;
  }
  function filters() {
    return `<div class="filter-panel"><div class="filters"><div class="segmented">${[
      ["7", tr("7 天")],
      ["30", tr("30 天")],
      ["90", tr("90 天")],
      ["365", tr("1 年")],
      ["0", tr("全部")],
    ]
      .map(
        ([v, t]) =>
          `<button data-days="${v}" class="${state.days === v ? "active" : ""}" aria-pressed="${state.days === v}">${tr(t)}</button>`,
      )
      .join(
        "",
      )}</div><label>${tr("从")} <input type="date" id="date-start" value="${state.start}" aria-label="${tr("开始日期")}"></label><label>${tr("至")} <input type="date" id="date-end" value="${state.end}" aria-label="${tr("结束日期")}"></label></div><div class="filters"><input type="search" id="event-query" value="${esc(state.q)}" placeholder="${tr("搜索进展关键词")}" aria-label="${tr("搜索进展")}"><select id="event-region" aria-label="${tr("公司地区")}"><option value="">${tr("全部地区")}</option>${[
      ["cn", tr("中国大陆")],
      ["hk", tr("中国香港")],
      ["global", tr("海外")],
      ["cross", tr("跨地区布局")],
    ]
      .map(
        ([v, t]) =>
          `<option value="${v}" ${state.region === v ? "selected" : ""}>${tr(t)}</option>`,
      )
      .join(
        "",
      )}</select><select id="event-type" aria-label="${tr("事件类型")}"><option value="">${tr("全部类型")}</option>${Object.entries(
      types,
    )
      .map(
        ([v, t]) =>
          `<option value="${v}" ${state.event_type === v ? "selected" : ""}>${tr(t)}</option>`,
      )
      .join("")}</select>${
      current === "timeline"
        ? `${tracks
            .slice(0, 3)
            .map(
              (t) =>
                `<label><input type="checkbox" name="lane" value="${t}" ${state.lanes.includes(t) ? "checked" : ""}> ${tr(t)}</label>`,
            )
            .join(
              "",
            )}<label><input type="checkbox" id="with-academic" ${state.academic ? "checked" : ""}> ${tr("叠加学术进展")}</label>`
        : ""
    }<button id="apply-filters">${tr("应用筛选")}</button></div></div>`;
  }
  function eventParams() {
    const p = new URLSearchParams({
      days: state.start || state.end ? "0" : state.days,
      q: state.q,
      region: state.region,
      event_type: state.event_type,
    });
    if (state.start) p.set("start", state.start);
    if (state.end) p.set("end", state.end);
    return p;
  }
  function wireFilters() {
    document.querySelectorAll("[data-days]").forEach(
      (b) =>
        (b.onclick = () => {
          state.days = b.dataset.days;
          state.start = "";
          state.end = "";
          page = 0;
          render();
        }),
    );
    $("#apply-filters").onclick = () => {
      if (
        $("#date-start").value &&
        $("#date-end").value &&
        $("#date-start").value > $("#date-end").value
      ) {
        $("#date-end").setCustomValidity(tr("结束日期不能早于开始日期"));
        $("#date-end").reportValidity();
        return;
      }
      $("#date-end").setCustomValidity("");
      state.q = $("#event-query").value;
      state.region = $("#event-region").value;
      state.event_type = $("#event-type").value;
      state.start = $("#date-start").value;
      state.end = $("#date-end").value;
      state.academic = $("#with-academic")?.checked || false;
      if (current === "timeline")
        state.lanes = [...document.querySelectorAll("[name=lane]:checked")].map(
          (el) => el.value,
        );
      page = 0;
      render();
    };
    $("#date-end").oninput = () => $("#date-end").setCustomValidity("");
    $("#event-query").onkeydown = (e) => {
      if (e.key === "Enter") $("#apply-filters").click();
    };
    document
      .querySelectorAll("[name=lane]")
      .forEach((el) => (el.onchange = () => $("#apply-filters").click()));
    if ($("#with-academic"))
      $("#with-academic").onchange = () => $("#apply-filters").click();
  }
  async function overview(n) {
    const [o, raw, companies, ev] = await Promise.all([
      api("/api/overview"),
      api("/api/records?academic=false&days=0&limit=4"),
      api("/api/companies?region=%E4%B8%AD%E5%9B%BD&limit=200"),
      api("/api/events?days=30&limit=3"),
    ]);
    if (n !== epoch) return;
    const featured = ["寻因", "新格元", "诺禾致源"]
      .map((name) =>
        companies.items.find((c) => (c.name_zh || "").includes(name)),
      )
      .filter(Boolean);
    for (const c of companies.items) {
      if (featured.length >= 5) break;
      if (!featured.includes(c)) featured.push(c);
    }
    content.innerHTML = `<section class="hero"><div><p class="eyebrow">${tr("BIOAI INTELLIGENCE · 问象")}</p><h1>${tr("追踪 AI 与生物医药，")}<br>${tr("看见产业的下一步。")}</h1><p class="lede">${tr("以公司动态、合作与融资为主线，连接虚拟细胞、类器官、虚拟胚胎、虚拟器官与 AI 制药的研究依据。")}</p></div><aside class="hero-note"><b>${tr("每一步进展，都保留来处")}</b>${tr("从官方披露与公共学术索引出发，")}<br>${tr("区分原文收录与核验后的事实。")}<br><br><a href="#sources" class="text-link">${tr("查看来源接入状态 ↗")}</a></aside></section>${topicLinks()}<section class="stats">${[
      [o.companies, tr("公司档案"), tr("收录公司与相关技术提供方")],
      [o.cloud_connected_sources ?? o.connected_sources, tr("自动采集来源"), tr("官网与公共订阅")],
      [o.records, tr("主题原文"), tr("自动归类 · 保留出处")],
      [o.events, tr("已核验事件"), tr("附可追溯证据")],
    ]
      .map(
        ([num, t, s]) =>
          `<div class="stat"><div class="stat-label"><i class="dot"></i>${tr(t)}</div><strong>${num}</strong><small>${tr(s)}</small></div>`,
      )
      .join(
        "",
      )}</section><div class="two-col"><section><div class="section-head"><h2>${tr("最新行业原文")} <small>INDUSTRY DISPATCHES</small></h2><a class="text-link" href="#news">${tr("全部新闻与文章 ↗")}</a></div><div class="panel">${raw.items.map(recordCard).join("") || empty(tr("原文正在积累"), tr("已验证来源完成抓取后，原始记录会出现在这里。"), "#sources", tr("查看信息来源"))}</div><p class="source-note">${tr("最近成功采集")} ${o.last_success_at ? date(o.last_success_at, true) : tr("尚无记录")} ${tr("· 原文线索经复核后，才进入产业进展与关系图。")}</p></section><aside><div class="section-head"><h2>${tr("国内公司速览")}</h2><a class="text-link" href="#directory">${tr("全部公司 ↗")}</a></div><div class="panel">${featured.map((c) => `<div class="mini-company"><div class="monogram" aria-hidden="true">${esc(l.companyName(c).slice(0, 2))}</div><div><h3><a href="#company/${c.slug}">${esc(l.companyName(c))}</a></h3><small>${esc(c.name_en)}</small></div><a href="#company/${c.slug}" aria-label="${tr("查看公司档案")} · ${esc(l.companyName(c))}">↗</a></div>`).join("")}</div><div class="section-head"><h2>${tr("产业覆盖")}</h2></div><div class="panel">${o.tracks.map((t) => `<div class="mini-company"><span>${esc(l.label(t.track))}</span><span style="margin-left:auto"><small>${tr("公司：{count}", {count: t.count})}</small></span></div>`).join("")}<p class="source-note">${tr("地区按种子库登记的所在地与布局分类，不推断内外资股权性质。")}</p></div></aside></div><div class="section-head"><h2>${tr("近期已核验进展")}</h2><a class="text-link" href="#timeline">${tr("查看进展树 ↗")}</a></div>${ev.items.length ? `<div class="timeline-grid">${ev.items.map(eventCard).join("")}</div>` : empty(tr("尚无近期已核验事件"), tr("已采集原文保留在来源库；复核通过的事件会同步到公司时间线。"), "#sources", tr("查看原始来源"))}`;
  }
  async function news(n, selectedTopic) {
    newsState.topic = selectedTopic || "";
    const theme = focusTopics.find(t => t[0] === newsState.topic);
    content.innerHTML = heading(theme?.[1] || tr("新闻与文章"), "VIRTUAL LIFE SCIENCES", theme?.[2] || tr("关注 AI 在生物医药领域的公司动态、融资合作与发展布局。默认展示行业原文；学术文章可在筛选中单独查看。")) +
      `<div class="filters"><input id="news-q" type="search" aria-label="${tr("搜索新闻文章")}" placeholder="${tr("关键词、模型名、公司名")}" value="${esc(newsState.q)}"><select id="news-topic" aria-label="${tr("研究主题")}"><option value="">${tr("全部主题")}</option>${focusTopics.map(([id,label]) => `<option value="${id}" ${newsState.topic===id?'selected':''}>${tr(label)}</option>`).join('')}</select><select id="news-kind" aria-label="${tr("内容类型")}"><option value="">${tr("全部内容")}</option><option value="false" ${newsState.kind==='false'?'selected':''}>${tr("公司与行业原文")}</option><option value="true" ${newsState.kind==='true'?'selected':''}>${tr("学术文章")}</option></select><select id="news-days" aria-label="${tr("日期范围")}">${[['7',tr("7 天")],['30',tr("30 天")],['90',tr("90 天")],['0',tr("全部")]].map(([v,t])=>`<option value="${v}" ${newsState.days===v?'selected':''}>${tr(t)}</option>`).join('')}</select><button id="news-search">${tr("搜索")}</button><a href="/feed.xml${newsState.topic?'?topic='+newsState.topic:''}" target="_blank" rel="noopener" class="text-link">${tr("订阅 RSS ↗")}</a></div><div id="results" class="loading">${tr("正在读取主题原文…")}</div>`;
    const search=()=>{
      newsState.q=$('#news-q').value;newsState.topic=$('#news-topic').value;newsState.kind=$('#news-kind').value;newsState.days=$('#news-days').value;page=0;
      const next=newsState.topic?'#topic/'+newsState.topic:'#news';
      if(location.hash!==next)location.hash=next;else render();
    };
    $('#news-search').onclick=search;$('#news-q').onkeydown=e=>{if(e.key==='Enter')search();};
    for(const id of ['topic','kind','days'])$('#news-'+id).onchange=search;
    const params=new URLSearchParams({q:newsState.q,topic:newsState.topic,days:newsState.days,limit:20,offset:page*20});
    if(newsState.kind)params.set('academic',newsState.kind);
    const d=await api('/api/records?'+params);if(n!==epoch)return;
    $('#results').className='';$('#results').innerHTML=`<p class="source-state">${tr("主题原文：{count} · 保留来源时间与收录时间 · 主题按关键词自动归类", {count: d.total})}</p><div class="panel">${d.items.map(recordCard).join('') || empty(tr("当前筛选下暂无收录"),tr("可以扩大日期范围，或检查来源的实际接入状态。"),'#sources',tr("查看信息来源"))}</div>${pager(d.total,20)}`;
  }
  async function daily(n, day) {
    const d=await api('/api/digest'+(day?'?date='+encodeURIComponent(day):''));if(n!==epoch)return;
    content.innerHTML=heading(tr("每日摘要"),'THE DAILY BRIEF',tr("北京时间每天 08:00 汇集前 24 小时新入库的主题原文。保留出处，不自动编造新闻或研究结论。"))+
      (d?`<div class="section-head"><h2>${date(d.digest_date)}</h2><button data-copy="${location.origin+'/digest/'+String(d.digest_date).slice(0,10)}">${tr("复制日报链接")}</button></div><p class="source-state">${tr("窗口 {start} — {end} · 当前公开：{count} 条（最多选入 100 条）", {start: date(d.window_start,true), end: date(d.window_end,true), count: d.items.length})}</p><div class="panel">${d.items.map(recordCard).join('') || empty(tr("这一期没有新增主题原文"),tr("来源无更新时保留空日报，不重复旧文章填充。"),'#news',tr("浏览历史原文"))}</div>`:empty(tr("首份日报尚未生成"),tr("调度运行到北京时间 08:00 后，这里会出现当天的摘要。"),'#news',tr("先浏览原文")));
  }
  async function connect(n) {
    const config=await api('/api/config');if(n!==epoch)return;
    const endpoint=location.origin+'/mcp';
    const example=JSON.stringify({mcpServers:{bioai:{url:endpoint}}},null,2);
    content.innerHTML=heading(tr("让你的 AI 读懂产业与研究进展"),'CONNECT YOUR AI',tr("通过只读 MCP 查询原文、公司和来源状态。每条结果带出处，适合研究助手、投资研究和每日简报工作流。"))+
      `<div class="two-col"><section class="panel connect-panel"><span class="pill green">${tr("STREAMABLE HTTP · 只读")}</span><h2>${tr("添加一个 MCP 服务")}</h2><p>${tr("在支持远程 MCP 的客户端中选择 HTTP / Streamable HTTP，填入下面的服务地址。公开读取无需 API Key。")}</p><div class="endpoint"><code>${esc(endpoint)}</code><button data-copy="${esc(endpoint)}">${tr("复制地址")}</button></div><h3>${tr("通用配置示例")}</h3><pre>${esc(example)}</pre><p class="source-note">${tr("不同客户端配置格式略有不同。Claude 可在自定义连接器中填写地址；Cursor 的 mcpServers 使用 url；Codex 的 TOML 使用 [mcp_servers.bioai] 与 url。")}</p><h3>${tr("可选语言参数")}</h3><p>${tr("MCP 工具可传入 language：zh-CN、zh-Hant 或 en，用于界面标签与说明。标题、摘要和证据仍保留原文。")}</p><pre>${esc(JSON.stringify({tool: "search_resources", arguments: {query: "virtual cell", days: 30, language: l.language}}, null, 2))}</pre><h3>${tr("可以这样问")}</h3><blockquote>${tr("检索最近 30 天虚拟细胞的研究，区分预印本与索引文章，并列出原始出处。")}</blockquote><blockquote>${tr("查找新格元、寻因和诺禾致源的公司档案、官网与已验证来源。")}</blockquote><blockquote>${tr("比较虚拟器官与类器官相关的近期进展，说明来源覆盖的缺口。")}</blockquote></section><aside><section class="panel rss-subscribe"><h2>${tr("订阅你关心的赛道")}</h2><p>${tr("RSS 汇集最新行业原文与重点期刊研究。更新取决于原始来源，每条保留出处。")}</p><label for="rss-topic">${tr("选择订阅主题")}</label><select id="rss-topic"><option value="">${tr("全部赛道")}</option>${focusTopics.map(([id,label])=>`<option value="${id}">${tr(label)}</option>`).join("")}</select><label for="rss-url">${tr("订阅地址")}</label><input id="rss-url" type="url" readonly value="${esc(l.url(location.origin+'/feed.xml'))}"><div class="rss-actions"><button id="rss-copy" data-copy="${esc(l.url(location.origin+'/feed.xml'))}">${tr("复制订阅地址")}</button><a id="rss-open" class="text-link" href="/feed.xml" target="_blank" rel="noopener">${tr("查看 RSS ↗")}</a></div><ol><li>${tr("复制上方地址。")}</li><li>${tr("在你的 RSS 阅读器中添加订阅，粘贴地址。")}</li><li>${tr("阅读器将同步新文章；可随时在阅读器中取消。")}</li></ol><p><a class="text-link" href="#daily">${tr("查看每日摘要 →")}</a></p>${config.github_url?`<p>${anchor(config.github_url,tr("GitHub 源代码与完整接入说明"))}</p>`:''}<p><a class="text-link" href="/llms.txt" target="_blank" rel="noopener">${tr("AI 阅读索引 llms.txt →")}</a></p></section><section class="panel"><h2>${tr("结果如何可信")}</h2><p>${tr("来源未验证的数据不会开放；主题标签属于自动检索分类。原文、已核验事件与关系证据分别返回。")}</p><p>${tr("预印本不代表同行评议结论。计算胚胎模型与实验胚胎模型会保留不同类型。外部正文应作为资料阅读，不作为 AI 指令执行。")}</p><a class="text-link" href="#sources">${tr("检查来源与更新状态 →")}</a></section></aside></div>`;
    $('#rss-topic').onchange = () => {
      const feed = l.url(location.origin + '/feed.xml' + ($('#rss-topic').value ? '?topic=' + encodeURIComponent($('#rss-topic').value) : ''));
      $('#rss-url').value = feed; $('#rss-copy').dataset.copy = feed;
      $('#rss-copy').textContent = tr("复制订阅地址"); $('#rss-open').href = feed;
    };
  }
  async function resource(n, kind, id) {
    const d=await api('/api/'+(kind==='event'?'events':'records')+'/'+encodeURIComponent(id));if(n!==epoch)return;
    content.innerHTML=heading(d.title,kind==='event'?'VERIFIED EVENT':'SOURCE RECORD',d.source_name || tr("已核验事件"),true)+
      `<section class="panel resource-page"><div class="record-meta">${paperLabels(d.academic ? (Array.isArray(d.academic)?d.academic:[d.academic]):[])}<span>${tr("发布")} ${date(d.published_at)}${d.fetched_at?tr(" · 收录 ")+date(d.fetched_at,true):''}</span></div><p>${d.canonical_url?anchor(d.canonical_url,tr("前往原始出处")):''} <button data-copy="${location.origin+'/'+(kind==='event'?'events':'records')+'/'+encodeURIComponent(id)}">${tr("复制页面链接")}</button></p><div class="raw-body" data-source-original>${esc(d.content_text || d.summary)}</div>${d.evidence?d.evidence.map(e=>`<blockquote data-source-original>${esc(e.evidence_text)}<br>${anchor(e.canonical_url,e.source_name)}</blockquote>`).join(''):''}<p class="source-note">${tr("自动收录与主题分类不等于事实核验。请结合原文、版本和来源状态阅读。")}</p></section>`;
  }
  async function timeline(n) {
    content.innerHTML =
      heading(
        tr("产业进展"),
        "INDUSTRY TIMELINES",
        tr("沿着时间，观察测序、生物医药与 AI 公司的发展。每条进展都附有原文证据。"),
      ) +
      filters() +
      '<div id="results" class="loading">正在读取进展…</div>';
    wireFilters();
    const p = eventParams();
    p.set("limit", "200");
    const d = await api("/api/events?" + p);
    if (n !== epoch) return;
    const selected = [...state.lanes, ...(state.academic ? ["学术进展"] : [])];
    $("#results").className = "";
    $("#results").innerHTML =
      `<p class="source-state">${tr("匹配的已核验事件：{count} · 跨产业事件可在关联方向同时展示", {count: d.total})}${d.total > 200 ? tr(" · 当前显示最近 200 条，请缩小时间范围") : ""}</p><div class="timeline-grid ${state.academic ? "with-academic" : ""}">${selected
        .map((t) => {
          const items = d.items.filter(
            (e) =>
              e.track === t ||
              (e.track !== "学术进展" &&
                e.companies.some((c) => c.track === t)),
          );
          return `<section class="lane"><div class="lane-header">${tr(t)}<small>${items.length}</small></div>${items.map(eventCard).join("") || empty(tr("暂无已核验进展"), tr("尝试其他日期，或先浏览公司与来源。"), "#directory", tr("浏览公司"))}</section>`;
        })
        .join("")}</div>`;
  }
  async function hot(n) {
    content.innerHTML =
      heading(
        tr("Hot 关系图"),
        "RELATIONSHIP ATLAS",
        tr("从一条有证据的合作出发，观察公司之间的联系。当前关系节点为公司。"),
      ) +
      filters() +
      '<div id="results" class="loading">正在读取关系…</div>';
    wireFilters();
    const d = await api("/api/graph?" + eventParams());
    if (n !== epoch) return;
    $("#results").className = "";
    if (!d.edges.length) {
      $("#results").innerHTML = empty(
        tr("还没有附有事件证据的关系"),
        tr("合作、投资与授权关系将在事件核验后出现。"),
        "#timeline",
        tr("查看产业进展"),
      );
      return;
    }
    const nodes = new Map(
      d.nodes.map((v, i) => [
        v.id,
        {
          ...v,
          x: 280 + 210 * Math.cos((2 * Math.PI * i) / d.nodes.length),
          y: 210 + 155 * Math.sin((2 * Math.PI * i) / d.nodes.length),
        },
      ]),
    );
    $("#results").innerHTML =
      `<p class="source-state">${tr("公司：{companies} · 关系：{relations}", {companies: d.nodes.length, relations: d.edges.length})}${d.edges.length === 300 ? tr(" · 最多展示最近 300 条") : ""} ${tr("· 点击关系查看证据")}</p><div class="graph-layout"><svg class="network" viewBox="0 0 560 420" role="img" aria-label="${tr("公司合作关系图，所有关系也列在右侧")}"><defs><marker id="arrow" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path class="edge-arrow" d="M0 0L10 5L0 10"/></marker></defs>${d.edges
        .map((e) => {
          const a = nodes.get(e.subject_id),
            b = nodes.get(e.object_id);
          return `<line class="edge-hit" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" data-event="${e.event_id}"/><line class="edge" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" data-event="${e.event_id}" marker-end="url(#arrow)"/>`;
        })
        .join(
          "",
        )}${[...nodes.values()].map((c) => `<a href="#company/${c.slug}"><circle class="node-hit" cx="${c.x}" cy="${c.y}" r="34"/><circle cx="${c.x}" cy="${c.y}" r="20"/><text x="${c.x}" y="${c.y + 36}" text-anchor="middle">${esc(l.companyName(c))}</text></a>`).join("")}</svg><div>${d.edges.map((e) => `<button class="edge-card" data-event="${e.event_id}">${esc(l.companyName(nodes.get(e.subject_id)))} <span style="color:var(--muted)">→ ${esc(l.label(predicates[e.predicate] || e.predicate))} →</span> ${esc(l.companyName(nodes.get(e.object_id)))}<small>${date(e.display_date)} · ${tr("证据：{count}", {count: e.evidence_count})}</small></button>`).join("")}</div></div>`;
  }
  async function academic(n) {
    const [policy, registeredSources] = await Promise.all([api("/api/journals"), api("/api/sources")]);
    if (n !== epoch) return;
    const availableSources = registeredSources.filter(s => ["pubmed", "europepmc", "biorxiv", "crossref"].includes(s.adapter) && s.verified && (paperState.journal_tier === "all" || s.adapter !== "biorxiv"));
    if (paperState.source && !availableSources.some(s => s.registry_key === paperState.source)) paperState.source = "";
    const sourceOptions = availableSources.map(s => `<option value="${esc(s.registry_key)}" ${paperState.source === s.registry_key ? "selected" : ""}>${esc(s.name)}${s.enabled && s.cloud_runtime_enabled ? "" : tr(" · 暂未自动更新")}</option>`).join("");
    const journalGuide = `<details class="journal-guide"><summary>${tr("收录期刊与筛选规则 · 重点期刊：{count}", {count: policy.items.length})}</summary><p>${esc(policy.selection_basis)}</p><p>${esc(policy.article_rule)}</p><div class="journal-list">${policy.items.map(j => `<a href="${esc(j.url)}" target="_blank" rel="noopener noreferrer"><strong>${esc(j.title)}</strong><small>${esc(j.focus)}</small><span>${tr("期刊官网 ↗")}</span></a>`).join("")}</div><p class="source-note">${tr("期刊元数据来自公共学术索引；本站不提供付费全文。规则版本")} ${esc(policy.policy_version)}${tr("。")}</p></details>`;
    content.innerHTML =
      heading(
        "学术进展",
        "RESEARCH OBSERVATORY",
        tr("默认展示重点期刊中与本站主题相关的已发表研究。期刊名单用于筛选范围，不替代对单篇研究质量与产业价值的判断。"),
      ) + journalGuide +
      `<div class="filters"><input type="search" id="paper-q" placeholder="${tr("搜索虚拟细胞、organoid、digital twin…")}" value="${esc(paperState.q)}" aria-label="${tr("搜索学术原文")}"><select id="paper-source" aria-label="${tr("学术来源")}" ${paperState.picked ? "disabled" : ""}><option value="">${tr("全部学术来源")}</option>${sourceOptions}</select><select id="paper-tier" aria-label="${tr("期刊收录范围")}" ${paperState.picked ? "disabled" : ""}><option value="selected" ${paperState.journal_tier === "selected" ? "selected" : ""}>${tr("重点期刊 · 已发表文献")}</option><option value="all" ${paperState.journal_tier === "all" ? "selected" : ""}>${tr("全部历史索引 · 含预印本")}</option></select><select id="paper-days" aria-label="${tr("学术时间范围")}">${[
        ["7", tr("最近 7 天")],
        ["30", tr("最近 30 天")],
        ["90", tr("最近 90 天")],
        ["0", tr("全部收录")],
      ]
        .map(
          ([v, t]) =>
            `<option value="${v}" ${paperState.days === v ? "selected" : ""}>${tr(t)}</option>`,
        )
        .join(
          "",
        )}</select><label><input type="checkbox" id="paper-picked" ${paperState.picked ? "checked" : ""}> ${tr("编辑精选")}</label><button id="paper-search">${tr("搜索")}</button></div><div id="results" class="loading">${tr("正在读取学术记录…")}</div>`;
    const search = () => {
      paperState.q = $("#paper-q").value;
      paperState.source = $("#paper-source").value;
      paperState.journal_tier = $("#paper-tier").value;
      paperState.days = $("#paper-days").value;
      paperState.picked = $("#paper-picked").checked;
      page = 0;
      render();
    };
    $("#paper-search").onclick = search;
    $("#paper-q").onkeydown = (e) => {
      if (e.key === "Enter") search();
    };
    $("#paper-source").onchange = search;
    $("#paper-tier").onchange = search;
    $("#paper-days").onchange = search;
    $("#paper-picked").onchange = search;
    const p = new URLSearchParams({
      q: paperState.q,
      days: paperState.days,
      limit: 20,
      offset: page * 20,
    });
    let d;
    if (paperState.picked) {
      p.set("track", "学术进展");
      p.set("picked", "true");
      d = await api("/api/events?" + p);
    } else {
      p.set("academic", "true");
      p.set("source", paperState.source);
      p.set("journal_tier", paperState.journal_tier);
      if (paperState.journal_tier === "all") p.set("scope", "all");
      d = await api("/api/records?" + p);
    }
    if (n !== epoch) return;
    $("#results").className = "";
    $("#results").innerHTML =
      `<p class="academic-count">${tr("{label}：{count} · 展示实际收录的原始资料", {count: d.total, label: paperState.picked ? tr("已核验精选") : paperState.journal_tier === "selected" ? tr("重点期刊文献") : tr("历史学术原始记录")})}</p><div class="panel">${d.items.map(paperState.picked ? eventCard : recordCard).join("") || empty(tr("当前筛选下暂无学术记录"), tr("可以扩大日期范围，或查看公共订阅的接入状态。"), "#sources", tr("查看信息来源"))}</div>${pager(d.total, 20)}`;
  }
  async function sources(n) {
    const [rows, o] = await Promise.all([
      api("/api/sources"),
      api("/api/overview"),
    ]);
    if (n !== epoch) return;
    sourceRows = rows;
    content.innerHTML =
      heading(
        tr("信息来源"),
        "SOURCE REGISTRY",
        tr("从官网身份与原文出处确认消息来源。来源归属验证、抓取成功和事件复核是三个独立步骤。"),
      ) +
      `<div class="note-banner">${tr("自动更新计划：已接入主题来源每小时检查；使用页面时每 5 分钟检查更新（闲置 2 分钟后暂停）；每日 08:00（北京时间）汇总前 24 小时新入库原文。是否已运行以下方实际调度时间为准。")}</div><div class="filters"><input type="search" id="source-q" placeholder="${tr("搜索公司、来源或网址")}" aria-label="${tr("搜索来源")}"><select id="source-state" aria-label="${tr("来源状态")}"><option value="all">${tr("全部来源")}</option><option value="connected">${tr("已接入自动采集")}</option><option value="pending">${tr("待验证")}</option><option value="unsupported">${tr("适配未接入")}</option><option value="failed">${tr("连续失败 ≥ 3 次")}</option></select></div><p class="source-state">${tr("最近成功采集：")}${date(o.last_success_at, true)} ${tr("· 最近成功调度：")}${date(o.scheduler_last_dispatch_at, true)}${o.scheduler_latest_run?.status === "failed" ? tr(" · 最近调度失败，正在等待恢复") : ""}</p><div id="source-list"></div>`;
    const redraw = () => {
      const q = $("#source-q").value.toLowerCase(),
        s = $("#source-state").value;
      const filtered = rows
        .filter((r) =>
          (r.name + " " + r.name_zh + " " + r.name_en + " " + r.url)
            .toLowerCase()
            .includes(q),
        )
        .filter(
          (r) =>
            s === "all" ||
            (s === "connected" &&
              r.verified &&
              r.enabled &&
              r.cloud_runtime_enabled &&
              r.adapter !== "unsupported") ||
            (s === "pending" && r.verification_status === "pending") ||
            (s === "unsupported" && r.adapter === "unsupported") ||
            (s === "failed" && r.consecutive_failures >= 3),
        );
      $("#source-list").innerHTML =
        `<p class="academic-count">${tr("来源：{count}", {count: filtered.length})}</p><div class="table-wrap"><table><thead><tr><th>${tr("来源 / 公司")}</th><th>${tr("归属与接入")}</th><th>${tr("最近成功")}</th><th>${tr("原文")}</th></tr></thead><tbody>${filtered.map((s) => `<tr><td class="url">${anchor(s.url, s.name)}${s.company_slug ? `<br><a class="text-link" href="#company/${s.company_slug}">${esc(l.companyName(s))}</a>` : ""}</td><td><span class="pill ${s.verified ? "green" : ""}">${s.verified ? tr("归属已验证") : s.verification_status === "rejected" ? tr("验证已拒绝") : tr("待验证")}</span><br><small>${s.adapter === "unsupported" ? tr("采集适配未接入") : s.enabled && s.cloud_runtime_enabled ? tr("已接入自动采集") : tr("待接入自动更新")} · ${s.ttl_hours} h${s.registry_key === "biorxiv" ? tr(" · 直连暂不可用，可从 Europe PMC 查找预印本") : ""}</small></td><td>${s.last_success_at ? date(s.last_success_at, true) : tr("尚无记录")}<br><small>${tr("连续失败：{count}", {count: s.consecutive_failures})}</small></td><td>${s.raw_count}</td></tr>`).join("")}</tbody></table></div>`;
    };
    $("#source-q").oninput = redraw;
    $("#source-state").onchange = redraw;
    redraw();
  }
  async function saved(n) {
    let ids = [];
    try {
      ids = JSON.parse(localStorage.getItem("bioai-followed") || "[]");
      if (!Array.isArray(ids)) ids = [];
    } catch {}
    const d = await api("/api/companies?history=true&limit=200");
    if (n !== epoch) return;
    const items = d.items.filter((c) => ids.includes(c.slug));
    content.innerHTML =
      heading(
        tr("我的关注"),
        "YOUR WATCHLIST",
        tr("把关心的公司留在这里。可导出名单，在另一台设备导入；关注保存在当前浏览器，需要手动迁移。"),
      ) +
      `<section class="watchlist-tools"><div><h2>${tr("随身带走你的关注名单")}</h2><p>${tr("导入会与现有关注合并。文件仅在浏览器中读取，不上传服务器。")}</p></div><div class="watchlist-actions"><button id="watchlist-export" ${items.length ? "" : "disabled"}>${tr("导出名单")}</button><button id="watchlist-import">${tr("导入名单")}</button><input id="watchlist-file" type="file" accept="application/json,.json" hidden></div></section><p id="watchlist-status" class="source-state" role="status">${esc(watchlistMessage())}</p>` +
      (items.length
        ? `<div class="wall">${items.map((c) => `<article class="card"><h2><a href="#company/${c.slug}">${esc(l.companyName(c))}</a></h2><small>${esc(c.name_en)}</small><p>${esc(l.label(c.track))}</p><p class="event">${esc(c.latest_event || tr("尚无已核验进展"))}</p><footer><a href="#company/${c.slug}">${tr("公司详情 →")}</a>${anchor(c.official_website, tr("官网"))}</footer></article>`).join("")}</div>`
        : empty(
            tr("尚未关注公司"),
            tr("在公司黄页点击“关注”，即可建立自己的观察名单。"),
          ));
    $("#watchlist-export").onclick = () => {
      const data = {schema: "bioai-watchlist", version: 1, exported_at: new Date().toISOString(), company_slugs: items.map(c => c.slug)};
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + "\n"], {type: "application/json"}));
      const link = document.createElement("a");
      link.href = url; link.download = "bioai-watchlist-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      watchlistNotice = {type: "export", count: items.length};
      $("#watchlist-status").textContent = watchlistMessage();
    };
    $("#watchlist-import").onclick = () => $("#watchlist-file").click();
    $("#watchlist-file").onchange = async e => {
      const input = e.target, file = input.files?.[0];
      if (!file) return;
      try {
        if (file.size > 65536) throw Error(tr("关注名单文件不能超过 64 KB。"));
        const imported = parseWatchlist(await file.text());
        if (n !== epoch) return;
        const known = new Set(d.items.map(c => c.slug));
        let previous;
        try { previous = JSON.parse(localStorage.getItem("bioai-followed") || "[]"); } catch { previous = []; }
        if (!Array.isArray(previous)) previous = [];
        const merged = new Set(previous.filter(slug => typeof slug === "string"));
        let added = 0, skipped = 0;
        for (const slug of imported) {
          if (!known.has(slug)) { skipped++; continue; }
          if (!merged.has(slug)) { merged.add(slug); added++; }
        }
        try { localStorage.setItem("bioai-followed", JSON.stringify([...merged])); }
        catch { throw Error(tr("当前浏览器无法保存关注，请检查浏览器的本地存储设置。")); }
        watchlistNotice = {type: "import", added, skipped};
        render();
      } catch (error) {
        if (n === epoch) $("#watchlist-status").textContent = error instanceof SyntaxError ? tr("无法读取 JSON，请选择本站导出的关注名单文件。") : error.message;
      } finally { input.value = ""; }
    };
  }
  async function showDetail(kind, id) {
    const n = ++dialogEpoch;
    $("#evidence-content").innerHTML =
      `<div class="loading">${tr("正在读取证据…")}</div>`;
    if (!$("#evidence-dialog").open) $("#evidence-dialog").showModal();
    try {
      const d = await api(
        "/api/" + (kind === "event" ? "events" : "records") + "/" + id,
      );
      if (n !== dialogEpoch) return;
      $("#evidence-content").innerHTML =
        kind === "event"
          ? `<p class="eyebrow">${tr("VERIFIED EVENT · 已核验事件")}</p><h2 data-source-original>${esc(d.title)}</h2><div class="tags">${paperLabels(d.academic)}</div><p>${esc(d.summary)}</p>${d.details?.amount || d.details?.stage ? `<p>${esc(d.details.amount)} ${esc(d.details.stage)}</p>` : ""}<p class="raw-meta">${tr("发生日期")} ${date(d.occurred_at)} ${tr("· 发布日期")} ${date(d.published_at)}<br>${esc(l.label(d.track))} · ${esc(l.label(types[d.event_type] || d.event_type))} · ${tr("证据：{count}", {count: d.evidence_count})}</p><div class="tags">${d.companies.map((c) => `<a class="tag" data-close-dialog href="#company/${c.slug}">${esc(l.companyName(c))} ↗</a>`).join("")}</div>${d.evidence.map((v) => `<section class="evidence-source"><span class="pill green">${esc(v.source_name)}</span><blockquote data-source-original>${esc(v.evidence_text)}</blockquote>${anchor(v.canonical_url, tr("查看原始出处"))}<p class="raw-meta">${tr("正文位置")} ${v.evidence_start}—${v.evidence_end} ${tr("· 采集内容哈希")} ${esc(v.content_hash)}</p></section>`).join("")}`
          : `<p class="eyebrow">${tr("SOURCE RECORD · 原始记录")}</p><h2 data-source-original>${esc(d.title)}</h2><p class="raw-meta">${esc(d.source_name)} ${tr("· 来源日期")} ${date(d.published_at)} ${tr("· 收录")} ${date(d.fetched_at, true)}</p><p>${anchor(d.canonical_url, tr("前往原文"))}</p>${d.academic?.status === "preprint" ? `<p class="note-banner">${tr("预印本：未经期刊同行评议。请结合原文和后续版本判断。")}</p>` : `<p class="source-note">${tr("以下为来源中保存的正文或摘要，尚未作为已核验事件发布。")}</p>`}${d.academic?.journal_doi ? `<p>${anchor("https://doi.org/" + d.academic.journal_doi, tr("来源提供的正式发表 DOI"))}</p>` : ""}<div class="raw-body" data-source-original>${esc(d.content_text)}</div>`;
    } catch (e) {
      if (n === dialogEpoch)
        $("#evidence-content").innerHTML =
          `<div class="error">${esc(e.message)}</div>`;
    }
  }
  async function render() {
    const n = ++epoch;
    const pathAliases = { topics: "topic", companies: "company", records: "record", events: "event", digest: "daily" };
    const pathParts = location.pathname.split('/').filter(Boolean);
    const pathRoute = pathParts.length ? [pathAliases[pathParts[0]] || pathParts[0], ...pathParts.slice(1)].join('/') : 'frontpage';
    const hash = location.hash.slice(1) || pathRoute;
    const [route, slug] = hash.split("/");
    if (!location.hash && publicationSnapshot && ['guides', 'briefings'].includes(route)) {
      current = route;
      document.body.classList.remove('frontpage-view');
      document.title = publicationSnapshot.title;
      $("#crumb").textContent = tr(names[route]);
      document.querySelectorAll('[data-nav]').forEach(a => {
        const active = a.dataset.nav === route;
        a.classList.toggle('active', active);
        if (active) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
      content.innerHTML = publicationSnapshot.html;
      return;
    }
    current =
      route === "topic" || route === "record" || route === "event"
        ? "news"
        : route === "companies"
        ? "directory"
        : route === "models"
          ? "academic"
          : route === "company"
            ? "directory"
            : names[route]
              ? route
              : "frontpage";
    document.body.classList.toggle("frontpage-view", current === "frontpage");
    const title = tr(names[current]);
    document.title = title + tr(" · BioAI 日知 · 问象");
    $("#crumb").textContent = title;
    document.querySelectorAll("[data-nav]").forEach((a) => {
      a.classList.toggle("active", a.dataset.nav === current);
      if (a.dataset.nav === current) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    content.innerHTML = `<div class="loading">${tr("正在连接数据服务…")}</div>`;
    try {
      if (current === "directory") {
        content.innerHTML =
          heading(
            route === "company" ? tr("公司档案") : tr("公司黄页"),
            "COMPANY DIRECTORY",
            tr("连接公司、历史主体、官方来源与发展进展。支持中英文、别名与历史品牌检索。"),
          ) + '<div id="registry-root"></div>';
        window.RegistryPanel.mount(
          $("#registry-root"),
          route === "company" ? decodeURIComponent(slug || "") : null,
          (t) => {
            content.querySelector("h1").textContent = t;
            $("#crumb").textContent = t;
          },
        );
        return;
      }
      if (current === "admin") {
        content.innerHTML =
          heading(
            tr("管理工作台"),
            "EDITORIAL WORKSPACE",
            tr("核验来源、审阅原文，将有证据的事件发布到全站。"),
          ) + '<div id="admin-root"></div>';
        window.AdminPanel.mount($("#admin-root"));
        return;
      }
      if (route === 'record' || route === 'event') await resource(n,route,slug || '');
      else if (current === 'news') await news(n,route==='topic'?slug:null);
      else if (current === 'daily') await daily(n,slug);
      else await { frontpage, overview, timeline, hot, academic, sources, saved, connect }[current](n);
    } catch (e) {
      if (n === epoch)
        content.innerHTML =
          heading(title, tr("BIOAI · 问象"), "") +
          `<div class="error">${esc(e.message)} <button id="retry-load">${tr("重试")}</button></div>`;
      $("#retry-load")?.addEventListener("click", render);
    } finally {
      if (n === epoch && searchEditorial && l.serverLanguage === l.language && ((route === 'frontpage' && pathRoute === 'frontpage') || (!location.hash && ['topic','company'].includes(route)))) {
        content.insertAdjacentHTML('beforeend', searchEditorial);
      }
    }
  }
  content.addEventListener("click", (e) => {
    const ev = e.target.closest("[data-event]"),
      r = e.target.closest("[data-record]"),
      p = e.target.closest("[data-page]");
    if (ev) showDetail("event", ev.dataset.event);
    if (r) showDetail("record", r.dataset.record);
    const copy=e.target.closest('[data-copy]');
    if(copy)navigator.clipboard.writeText(l.url(copy.dataset.copy)).then(()=>{copy.textContent=tr("已复制");}).catch(()=>{copy.textContent=tr("请复制上方地址");});
    if (p && !p.disabled) {
      page = Number(p.dataset.page);
      render();
      $("#main").scrollIntoView({ behavior: "smooth" });
    }
  });
  $("#close-evidence").onclick = () => {
    $("#evidence-dialog").close();
    dialogEpoch++;
  };
  $("#evidence-dialog").addEventListener("click", (e) => {
    if (e.target.closest("[data-close-dialog]")) $("#evidence-dialog").close();
  });
  $(".skip-link").onclick = (e) => {
    e.preventDefault();
    $("#main").focus();
    $("#main").scrollIntoView();
  };
  window.addEventListener("hashchange", () => {
    page = 0;
    render();
    $("#main").focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "auto" });
  });
  $("#reload").onclick = () => ['guides', 'briefings'].includes(current) ? location.reload() : render();
  const mobileMenu = $("#mobile-menu"), sidebar = $(".sidebar");
  const closeMobileMenu = () => {
    sidebar.classList.remove('nav-open');mobileMenu.setAttribute('aria-expanded','false');mobileMenu.textContent=tr("全部栏目 ☰");
  };
  mobileMenu.onclick = () => {
    const open = sidebar.classList.toggle('nav-open');
    mobileMenu.setAttribute('aria-expanded',String(open));mobileMenu.textContent=open?tr("收起菜单 ×"):tr("全部栏目 ☰");
  };
  sidebar.addEventListener('click',e=>{if(e.target.closest('a'))closeMobileMenu();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && sidebar.classList.contains('nav-open')){closeMobileMenu();mobileMenu.focus();}});

  // Refresh passive views only; never discard an admin edit, typed query, or open article.
  let lastRefresh = Date.now(), lastActivity = Date.now();
  const active = () => { lastActivity = Date.now(); };
  for (const event of ["pointerdown","keydown","scroll"]) window.addEventListener(event, active, {passive:true});
  const autoRefresh = () => {
    if(document.hidden || Date.now()-lastActivity>120000 || ['admin','guides','briefings'].includes(current) || $('#evidence-dialog').open || document.activeElement?.matches('input,textarea,select') || /^(record|event)\//.test(location.hash.slice(1)))return;
    if(Date.now()-lastRefresh<300000)return;
    lastRefresh=Date.now();render();
  };
  setInterval(autoRefresh,300000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)active();autoRefresh();});
  $("#today").textContent = new Date().toLocaleDateString(l.locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  window.addEventListener("bioai-languagechange", async () => {
    $("#today").textContent = new Date().toLocaleDateString(l.locale, {year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Shanghai"});
    if (current === "admin") return; // Do not discard an editorial form.
    const focusId = document.activeElement?.id;
    const drafts = [...content.querySelectorAll("input[id], select[id]")].filter(el => el.type !== "file").map(el => ({id: el.id, value: el.value, checked: el.checked}));
    if (current === "directory" && $("#q")) {
      window.RegistryPanel.state = {q: $("#q").value, track: $("#track").value, region: $("#region").value, "company-topic": $("#company-topic").value, history: $("#history").checked};
    }
    const selectedLanguage = l.language, view = current, renderEpoch = epoch + 1;
    await render();
    if (epoch !== renderEpoch || l.language !== selectedLanguage || current !== view) return;
    for (const draft of drafts) {
      const el = document.getElementById(draft.id);
      if (el) { el.value = draft.value; if (el.type === "checkbox") el.checked = draft.checked; }
    }
    if (current === "sources") $("#source-q")?.dispatchEvent(new Event("input"));
    if (focusId && document.getElementById(focusId)?.matches("[data-language-select]")) document.getElementById(focusId).focus({preventScroll: true});
  });
  render();
})();
