/* One application, one database API. Historical JSON snapshots are never loaded. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s),
    content = $("#content");
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
    overview: "今日概览",
    news: "新闻与文章",
    daily: "每日摘要",
    connect: "连接你的 AI",
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
  const topicName = (id) => focusTopics.find(t => t[0] === id)?.[1] || id;
  const topicLinks = () => `<div class="topic-grid">${focusTopics.map(([id, label, text], i) => `<a class="topic-card" href="#topic/${id}"><small>0${i+1} / RESEARCH TRACK</small><strong>${label}</strong><span>${text}</span><b aria-hidden="true">↗</b></a>`).join("")}</div>`;
  const newsState = { q: "", topic: "", kind: "", days: "30" };
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
    current = "overview";
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
  const paperState = { q: "", source: "", days: "30", picked: false };
  function date(s, full = false) {
    if (!s) return "日期未提供";
    const d = new Date(s);
    return Number.isNaN(d.getTime())
      ? "日期待核验"
      : d.toLocaleString(
          "zh-CN",
          full
            ? {
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              }
            : { year: "numeric", month: "2-digit", day: "2-digit" },
        );
  }
  function anchor(u, t) {
    return /^https:\/\//.test(u || "")
      ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)} ↗</a>`
      : esc(t);
  }
  async function api(path) {
    const r = await fetch(path, { headers: { Accept: "application/json" } });
    if (!r.headers.get("content-type")?.includes("application/json"))
      throw Error("数据服务暂不可用。请确认后端已启动，再刷新重试。");
    const d = await r.json();
    if (!r.ok)
      throw Error(
        typeof d.detail === "string" ? d.detail : "请求未成功，请稍后重试。",
      );
    return d;
  }
  function heading(title, kicker, desc) {
    return `<div class="page-heading"><div><p class="eyebrow">${kicker}</p><h1>${esc(title)}</h1><p class="lede">${esc(desc)}</p></div></div>`;
  }
  function empty(title, desc, link = "#directory", label = "浏览公司黄页") {
    return `<div class="empty"><div class="empty-mark">⌁</div><strong>${esc(title)}</strong><p>${esc(desc)}</p>${link ? `<a class="text-link" href="${link}">${esc(label)} →</a>` : ""}</div>`;
  }
  function pager(total, limit) {
    return total > limit
      ? `<div class="pager"><button data-page="${page - 1}" ${page === 0 ? "disabled" : ""}>上一页</button><span>${page + 1} / ${Math.ceil(total / limit)}</span><button data-page="${page + 1}" ${(page + 1) * limit >= total ? "disabled" : ""}>下一页</button></div>`
      : "";
  }
  function recordCard(r) {
    const a = r.academic;
    const recordTopics = r.topics || r.classification?.topic_ids || [];
    return `<article class="record"><div class="record-meta"><span class="pill ${a?.status === "preprint" ? "gold" : "green"}">${a ? (a.status === "preprint" ? "预印本" + (a.version ? " · v" + a.version : " · 版本未标注") : "学术索引收录") : "原文线索"}</span><span>${esc(r.source_name)}</span><time>${r.published_at ? (new Date(r.published_at) > new Date() ? "来源标注日期 " : "") + date(r.published_at) : "收录于 " + date(r.fetched_at)}</time></div><h3><button data-record="${r.id}">${esc(r.title)}</button></h3><p>${esc(r.excerpt?.slice(0, 180) || "摘要暂未提供，点击查看原文。")}</p><div class="record-foot">${r.company_slug ? `<a href="#company/${r.company_slug}">${esc(r.company_name || r.company_name_en)}</a>` : `<small>${a?.doi ? "DOI " + esc(a.doi) : "尚未转为已核验事件"}</small>`}<span>${anchor(r.canonical_url, "原文")} · <a href="/records/${r.id}">分享页 ↗</a></span></div>${recordTopics.length ? `<div class="tags topic-tags">${recordTopics.map(t=>`<a class="tag" href="#topic/${esc(t)}">${esc(topicName(t))}</a>`).join("")}</div>` : ""}</article>`;
  }
  function paperLabels(items) {
    return (items || [])
      .map(
        (a) =>
          `<span class="pill ${a.status === "preprint" ? "gold" : "green"}">${a.status === "preprint" ? "预印本" + (a.version ? " · v" + a.version : " · 版本未标注") : "学术索引收录"}</span>`,
      )
      .join("");
  }
  function eventCard(e) {
    return `<article class="card"><div class="record-meta"><span class="pill green">${esc(types[e.event_type] || e.event_type)}</span><time>${date(e.display_date)}</time>${paperLabels(e.academic)}</div><h3><button class="text-link" data-event="${e.id}" style="padding:0;border:0;text-align:left;font:inherit;color:inherit;background:none">${esc(e.title)}</button></h3><p class="lede">${esc(e.summary?.slice(0, 160))}</p>${e.details?.amount || e.details?.stage ? `<p class="source-note">${esc(e.details.amount)} ${esc(e.details.stage)}</p>` : ""}<div class="tags" style="margin:14px 0">${e.companies.map((c) => `<a class="tag" href="#company/${c.slug}">${esc(c.name)}</a>`).join("")}</div><div class="record-foot"><small>${e.evidence_count} 条证据${e.editor_pick ? " · 编辑精选" : ""}</small><button data-event="${e.id}">查看证据 ↗</button></div></article>`;
  }
  function filters() {
    return `<div class="filter-panel"><div class="filters"><div class="segmented">${[
      ["7", "7 天"],
      ["30", "30 天"],
      ["90", "90 天"],
      ["365", "1 年"],
      ["0", "全部"],
    ]
      .map(
        ([v, t]) =>
          `<button data-days="${v}" class="${state.days === v ? "active" : ""}" aria-pressed="${state.days === v}">${t}</button>`,
      )
      .join(
        "",
      )}</div><label>从 <input type="date" id="date-start" value="${state.start}" aria-label="开始日期"></label><label>至 <input type="date" id="date-end" value="${state.end}" aria-label="结束日期"></label></div><div class="filters"><input type="search" id="event-query" value="${esc(state.q)}" placeholder="搜索进展关键词" aria-label="搜索进展"><select id="event-region" aria-label="公司地区"><option value="">全部地区</option>${[
      ["cn", "中国大陆"],
      ["hk", "中国香港"],
      ["global", "海外"],
      ["cross", "跨地区布局"],
    ]
      .map(
        ([v, t]) =>
          `<option value="${v}" ${state.region === v ? "selected" : ""}>${t}</option>`,
      )
      .join(
        "",
      )}</select><select id="event-type" aria-label="事件类型"><option value="">全部类型</option>${Object.entries(
      types,
    )
      .map(
        ([v, t]) =>
          `<option value="${v}" ${state.event_type === v ? "selected" : ""}>${t}</option>`,
      )
      .join("")}</select>${
      current === "timeline"
        ? `${tracks
            .slice(0, 3)
            .map(
              (t) =>
                `<label><input type="checkbox" name="lane" value="${t}" ${state.lanes.includes(t) ? "checked" : ""}> ${t}</label>`,
            )
            .join(
              "",
            )}<label><input type="checkbox" id="with-academic" ${state.academic ? "checked" : ""}> 叠加学术进展</label>`
        : ""
    }<button id="apply-filters">应用筛选</button></div></div>`;
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
        $("#date-end").setCustomValidity("结束日期不能早于开始日期");
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
      api("/api/records?days=0&limit=4"),
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
    content.innerHTML = `<section class="hero"><div><p class="eyebrow">BIOAI INTELLIGENCE · 问象</p><h1>探索虚拟生命，<br>看见研究与产业的下一步。</h1><p class="lede">聚焦虚拟细胞、类器官、虚拟胚胎、虚拟器官与 AI 制药。连接文献、公司与可追溯的进展。</p></div><aside class="hero-note"><b>每一步进展，都保留来处</b>从官方披露与公共学术索引出发，<br>区分原文收录与核验后的事实。<br><br><a href="#sources" class="text-link">查看来源接入状态 ↗</a></aside></section>${topicLinks()}<section class="stats">${[
      [o.companies, "公司档案", "收录公司与相关技术提供方"],
      [o.cloud_connected_sources ?? o.connected_sources, "自动采集来源", "官网与公共订阅"],
      [o.records, "主题原文", "自动归类 · 保留出处"],
      [o.events, "已核验事件", "附可追溯证据"],
    ]
      .map(
        ([num, t, s]) =>
          `<div class="stat"><div class="stat-label"><i class="dot"></i>${t}</div><strong>${num}</strong><small>${s}</small></div>`,
      )
      .join(
        "",
      )}</section><div class="two-col"><section><div class="section-head"><h2>最新原文 <small>SOURCE DISPATCHES</small></h2><a class="text-link" href="#news">全部新闻与文章 ↗</a></div><div class="panel">${raw.items.map(recordCard).join("") || empty("原文正在积累", "已验证来源完成抓取后，原始记录会出现在这里。", "#sources", "查看信息来源")}</div><p class="source-note">最近成功采集 ${o.last_success_at ? date(o.last_success_at, true) : "尚无记录"} · 原文线索经复核后，才进入产业进展与关系图。</p></section><aside><div class="section-head"><h2>国内公司速览</h2><a class="text-link" href="#directory">全部公司 ↗</a></div><div class="panel">${featured.map((c) => `<div class="mini-company"><div class="monogram" aria-hidden="true">${esc((c.name_zh || c.name_en).slice(0, 2))}</div><div><h3><a href="#company/${c.slug}">${esc(c.name_zh || c.name_en)}</a></h3><small>${esc(c.name_en)}</small></div><a href="#company/${c.slug}" aria-label="查看${esc(c.name_zh || c.name_en)}">↗</a></div>`).join("")}</div><div class="section-head"><h2>产业覆盖</h2></div><div class="panel">${o.tracks.map((t) => `<div class="mini-company"><span>${esc(t.track)}</span><span style="margin-left:auto">${t.count} <small>家公司</small></span></div>`).join("")}<p class="source-note">地区按种子库登记的所在地与布局分类，不推断内外资股权性质。</p></div></aside></div><div class="section-head"><h2>近期已核验进展</h2><a class="text-link" href="#timeline">查看进展树 ↗</a></div>${ev.items.length ? `<div class="timeline-grid">${ev.items.map(eventCard).join("")}</div>` : empty("尚无近期已核验事件", "已采集原文保留在来源库；复核通过的事件会同步到公司时间线。", "#sources", "查看原始来源")}`;
  }
  async function news(n, selectedTopic) {
    if (selectedTopic) newsState.topic = selectedTopic;
    const theme = focusTopics.find(t => t[0] === newsState.topic);
    content.innerHTML = heading(theme?.[1] || "新闻与文章", "VIRTUAL LIFE SCIENCES", theme?.[2] || "按主题汇集官方动态与公共学术索引。自动主题标签仅用于检索，原文收录不等于事件复核。") +
      `<div class="filters"><input id="news-q" type="search" aria-label="搜索新闻文章" placeholder="关键词、模型名、公司名" value="${esc(newsState.q)}"><select id="news-topic" aria-label="研究主题"><option value="">全部主题</option>${focusTopics.map(([id,label]) => `<option value="${id}" ${newsState.topic===id?'selected':''}>${label}</option>`).join('')}</select><select id="news-kind" aria-label="内容类型"><option value="">全部内容</option><option value="false" ${newsState.kind==='false'?'selected':''}>公司与行业原文</option><option value="true" ${newsState.kind==='true'?'selected':''}>学术文章</option></select><select id="news-days" aria-label="日期范围">${[['7','7 天'],['30','30 天'],['90','90 天'],['0','全部']].map(([v,t])=>`<option value="${v}" ${newsState.days===v?'selected':''}>${t}</option>`).join('')}</select><button id="news-search">搜索</button><a href="/feed.xml${newsState.topic?'?topic='+newsState.topic:''}" target="_blank" rel="noopener" class="text-link">订阅 RSS ↗</a></div><div id="results" class="loading">正在读取主题原文…</div>`;
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
    $('#results').className='';$('#results').innerHTML=`<p class="source-state">${d.total} 条主题原文 · 保留来源时间与收录时间 · 主题按关键词自动归类</p><div class="panel">${d.items.map(recordCard).join('') || empty('当前筛选下暂无收录','可以扩大日期范围，或检查来源的实际接入状态。','#sources','查看信息来源')}</div>${pager(d.total,20)}`;
  }
  async function daily(n, day) {
    const d=await api('/api/digest'+(day?'?date='+encodeURIComponent(day):''));if(n!==epoch)return;
    content.innerHTML=heading('每日摘要','THE DAILY BRIEF','北京时间每天 08:00 汇集前 24 小时新入库的主题原文。保留出处，不自动编造新闻或研究结论。')+
      (d?`<div class="section-head"><h2>${esc(String(d.digest_date).slice(0,10))}</h2><button data-copy="${location.origin+'/digest/'+String(d.digest_date).slice(0,10)}">复制日报链接</button></div><p class="source-state">窗口 ${date(d.window_start,true)} — ${date(d.window_end,true)} · 当前公开 ${d.items.length} 条（最多选入 100 条）</p><div class="panel">${d.items.map(recordCard).join('') || empty('这一期没有新增主题原文','来源无更新时保留空日报，不重复旧文章填充。','#news','浏览历史原文')}</div>`:empty('首份日报尚未生成','调度运行到北京时间 08:00 后，这里会出现当天的摘要。','#news','先浏览原文'));
  }
  async function connect(n) {
    const config=await api('/api/config');if(n!==epoch)return;
    const endpoint=location.origin+'/mcp';
    const example=JSON.stringify({mcpServers:{bioai:{url:endpoint}}},null,2);
    content.innerHTML=heading('让你的 AI 读懂产业与研究进展','CONNECT YOUR AI','通过只读 MCP 查询原文、公司和来源状态。每条结果带出处，适合研究助手、投资研究和每日简报工作流。')+
      `<div class="two-col"><section class="panel connect-panel"><span class="pill green">STREAMABLE HTTP · 只读</span><h2>添加一个 MCP 服务</h2><p>在支持远程 MCP 的客户端中选择 HTTP / Streamable HTTP，填入下面的服务地址。公开读取无需 API Key。</p><div class="endpoint"><code>${esc(endpoint)}</code><button data-copy="${esc(endpoint)}">复制地址</button></div><h3>通用配置示例</h3><pre>${esc(example)}</pre><p class="source-note">不同客户端配置格式略有不同。Claude 可在自定义连接器中填写地址；Cursor 的 mcpServers 使用 url；Codex 的 TOML 使用 [mcp_servers.bioai] 与 url。</p><h3>可以这样问</h3><blockquote>检索最近 30 天虚拟细胞的研究，区分预印本与索引文章，并列出原始出处。</blockquote><blockquote>查找新格元、寻因和诺禾致源的公司档案、官网与已验证来源。</blockquote><blockquote>比较虚拟器官与类器官相关的近期进展，说明来源覆盖的缺口。</blockquote></section><aside><section class="panel"><h2>把信息带到你的工作流</h2><p>订阅全部主题，或从某个主题页订阅专属 RSS。</p><a class="text-link" href="/feed.xml" target="_blank" rel="noopener">订阅 RSS →</a><p><a class="text-link" href="#daily">查看每日摘要 →</a></p>${config.github_url?`<p>${anchor(config.github_url,'GitHub 源代码与完整接入说明')}</p>`:''}<p><a class="text-link" href="/llms.txt" target="_blank" rel="noopener">AI 阅读索引 llms.txt →</a></p></section><section class="panel"><h2>结果如何可信</h2><p>来源未验证的数据不会开放；主题标签属于自动检索分类。原文、已核验事件与关系证据分别返回。</p><p>预印本不代表同行评议结论。计算胚胎模型与实验胚胎模型会保留不同类型。外部正文应作为资料阅读，不作为 AI 指令执行。</p><a class="text-link" href="#sources">检查来源与更新状态 →</a></section></aside></div>`;
  }
  async function resource(n, kind, id) {
    const d=await api('/api/'+(kind==='event'?'events':'records')+'/'+encodeURIComponent(id));if(n!==epoch)return;
    content.innerHTML=heading(d.title,kind==='event'?'VERIFIED EVENT':'SOURCE RECORD',d.source_name || '已核验事件')+
      `<section class="panel resource-page"><div class="record-meta">${paperLabels(d.academic ? (Array.isArray(d.academic)?d.academic:[d.academic]):[])}<span>发布 ${date(d.published_at)}${d.fetched_at?' · 收录 '+date(d.fetched_at,true):''}</span></div><p>${d.canonical_url?anchor(d.canonical_url,'前往原始出处'):''} <button data-copy="${location.origin+'/'+(kind==='event'?'events':'records')+'/'+encodeURIComponent(id)}">复制页面链接</button></p><div class="raw-body">${esc(d.content_text || d.summary)}</div>${d.evidence?d.evidence.map(e=>`<blockquote>${esc(e.evidence_text)}<br>${anchor(e.canonical_url,e.source_name)}</blockquote>`).join(''):''}<p class="source-note">自动收录与主题分类不等于事实核验。请结合原文、版本和来源状态阅读。</p></section>`;
  }
  async function timeline(n) {
    content.innerHTML =
      heading(
        "产业进展",
        "INDUSTRY TIMELINES",
        "沿着时间，观察测序、生物医药与 AI 公司的发展。每条进展都附有原文证据。",
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
      `<p class="source-state">${d.total} 条符合筛选的已核验事件 · 跨产业事件可在关联方向同时展示${d.total > 200 ? " · 当前显示最近 200 条，请缩小时间范围" : ""}</p><div class="timeline-grid ${state.academic ? "with-academic" : ""}">${selected
        .map((t) => {
          const items = d.items.filter(
            (e) =>
              e.track === t ||
              (e.track !== "学术进展" &&
                e.companies.some((c) => c.track === t)),
          );
          return `<section class="lane"><div class="lane-header">${t}<small>${items.length}</small></div>${items.map(eventCard).join("") || empty("暂无已核验进展", "尝试其他日期，或先浏览公司与来源。", "#directory", "浏览公司")}</section>`;
        })
        .join("")}</div>`;
  }
  async function hot(n) {
    content.innerHTML =
      heading(
        "Hot 关系图",
        "RELATIONSHIP ATLAS",
        "从一条有证据的合作出发，观察公司之间的联系。当前关系节点为公司。",
      ) +
      filters() +
      '<div id="results" class="loading">正在读取关系…</div>';
    wireFilters();
    const d = await api("/api/graph?" + eventParams());
    if (n !== epoch) return;
    $("#results").className = "";
    if (!d.edges.length) {
      $("#results").innerHTML = empty(
        "还没有附有事件证据的关系",
        "合作、投资与授权关系将在事件核验后出现。",
        "#timeline",
        "查看产业进展",
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
      `<p class="source-state">${d.nodes.length} 个公司 · ${d.edges.length} 条关系${d.edges.length === 300 ? " · 最多展示最近 300 条" : ""} · 点击关系查看证据</p><div class="graph-layout"><svg class="network" viewBox="0 0 560 420" role="img" aria-label="公司合作关系图，所有关系也列在右侧"><defs><marker id="arrow" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10" fill="#839b89"/></marker></defs>${d.edges
        .map((e) => {
          const a = nodes.get(e.subject_id),
            b = nodes.get(e.object_id);
          return `<line class="edge-hit" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" data-event="${e.event_id}"/><line class="edge" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" data-event="${e.event_id}" marker-end="url(#arrow)"/>`;
        })
        .join(
          "",
        )}${[...nodes.values()].map((c) => `<a href="#company/${c.slug}"><circle class="node-hit" cx="${c.x}" cy="${c.y}" r="34"/><circle cx="${c.x}" cy="${c.y}" r="20"/><text x="${c.x}" y="${c.y + 36}" text-anchor="middle">${esc(c.name_zh || c.name_en)}</text></a>`).join("")}</svg><div>${d.edges.map((e) => `<button class="edge-card" data-event="${e.event_id}">${esc(nodes.get(e.subject_id).name_zh || nodes.get(e.subject_id).name_en)} <span style="color:var(--muted)">→ ${esc(predicates[e.predicate] || e.predicate)} →</span> ${esc(nodes.get(e.object_id).name_zh || nodes.get(e.object_id).name_en)}<small>${date(e.display_date)} · ${e.evidence_count} 条证据</small></button>`).join("")}</div></div>`;
  }
  async function academic(n) {
    content.innerHTML =
      heading(
        "学术进展",
        "RESEARCH OBSERVATORY",
        "关注生物 AI 的论文与预印本。索引收录不等于质量背书，预印本与正式发表状态分别标注。",
      ) +
      `<div class="filters"><input type="search" id="paper-q" placeholder="搜索虚拟细胞、organoid、digital twin…" value="${esc(paperState.q)}" aria-label="搜索学术原文"><select id="paper-source" aria-label="学术来源" ${paperState.picked ? "disabled" : ""}><option value="">全部学术来源</option><option value="pubmed" ${paperState.source === "pubmed" ? "selected" : ""}>PubMed</option><option value="biorxiv" ${paperState.source === "biorxiv" ? "selected" : ""}>bioRxiv 直连</option><option value="europe-pmc" ${paperState.source === "europe-pmc" ? "selected" : ""}>Europe PMC（含预印本）</option></select><select id="paper-days" aria-label="学术时间范围">${[
        ["7", "最近 7 天"],
        ["30", "最近 30 天"],
        ["90", "最近 90 天"],
        ["0", "全部收录"],
      ]
        .map(
          ([v, t]) =>
            `<option value="${v}" ${paperState.days === v ? "selected" : ""}>${t}</option>`,
        )
        .join(
          "",
        )}</select><label><input type="checkbox" id="paper-picked" ${paperState.picked ? "checked" : ""}> 编辑精选</label><button id="paper-search">搜索</button></div><div id="results" class="loading">正在读取学术记录…</div>`;
    const search = () => {
      paperState.q = $("#paper-q").value;
      paperState.source = $("#paper-source").value;
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
      d = await api("/api/records?" + p);
    }
    if (n !== epoch) return;
    $("#results").className = "";
    $("#results").innerHTML =
      `<p class="academic-count">${d.total} 条${paperState.picked ? "已核验精选" : "学术原始记录"} · 展示实际收录的原始资料</p><div class="panel">${d.items.map(paperState.picked ? eventCard : recordCard).join("") || empty("当前筛选下暂无学术记录", "可以扩大日期范围，或查看公共订阅的接入状态。", "#sources", "查看信息来源")}</div>${pager(d.total, 20)}`;
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
        "信息来源",
        "SOURCE REGISTRY",
        "从官网身份与原文出处确认消息来源。来源归属验证、抓取成功和事件复核是三个独立步骤。",
      ) +
      `<div class="note-banner">自动更新计划：已接入主题来源每小时检查；使用页面时每 5 分钟检查更新（闲置 2 分钟后暂停）；每日 08:00（北京时间）汇总前 24 小时新入库原文。是否已运行以下方实际调度时间为准。</div><div class="filters"><input type="search" id="source-q" placeholder="搜索公司、来源或网址" aria-label="搜索来源"><select id="source-state" aria-label="来源状态"><option value="all">全部来源</option><option value="connected">已接入自动采集</option><option value="pending">待验证</option><option value="unsupported">适配未接入</option><option value="failed">连续失败 ≥ 3 次</option></select></div><p class="source-state">最近成功采集：${date(o.last_success_at, true)} · 最近成功调度：${date(o.scheduler_last_dispatch_at, true)}${o.scheduler_latest_run?.status === "failed" ? " · 最近调度失败，正在等待恢复" : ""}</p><div id="source-list"></div>`;
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
        `<p class="academic-count">${filtered.length} 条来源</p><div class="table-wrap"><table><thead><tr><th>来源 / 公司</th><th>归属与接入</th><th>最近成功</th><th>原文</th></tr></thead><tbody>${filtered.map((s) => `<tr><td class="url">${anchor(s.url, s.name)}${s.company_slug ? `<br><a class="text-link" href="#company/${s.company_slug}">${esc(s.name_zh || s.name_en)}</a>` : ""}</td><td><span class="pill ${s.verified ? "green" : ""}">${s.verified ? "归属已验证" : s.verification_status === "rejected" ? "验证已拒绝" : "待验证"}</span><br><small>${s.adapter === "unsupported" ? "采集适配未接入" : s.enabled && s.cloud_runtime_enabled ? "已接入自动采集" : "待接入自动更新"} · ${s.ttl_hours} h${s.registry_key === "biorxiv" ? " · 直连暂不可用，可从 Europe PMC 查找预印本" : ""}</small></td><td>${s.last_success_at ? date(s.last_success_at, true) : "尚无记录"}<br><small>${s.consecutive_failures} 次连续失败</small></td><td>${s.raw_count}</td></tr>`).join("")}</tbody></table></div>`;
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
        "我的关注",
        "YOUR WATCHLIST",
        "把关心的公司留在这里。关注保存在当前浏览器，不会向你发送消息。",
      ) +
      (items.length
        ? `<div class="wall">${items.map((c) => `<article class="card"><h2><a href="#company/${c.slug}">${esc(c.name_zh || c.name_en)}</a></h2><small>${esc(c.name_en)}</small><p>${esc(c.track)}</p><p class="event">${esc(c.latest_event || "尚无已核验进展")}</p><footer><a href="#company/${c.slug}">公司详情 →</a>${anchor(c.official_website, "官网")}</footer></article>`).join("")}</div>`
        : empty(
            "尚未关注公司",
            "在公司黄页点击“关注”，即可建立自己的观察名单。",
          ));
  }
  async function showDetail(kind, id) {
    const n = ++dialogEpoch;
    $("#evidence-content").innerHTML =
      '<div class="loading">正在读取证据…</div>';
    if (!$("#evidence-dialog").open) $("#evidence-dialog").showModal();
    try {
      const d = await api(
        "/api/" + (kind === "event" ? "events" : "records") + "/" + id,
      );
      if (n !== dialogEpoch) return;
      $("#evidence-content").innerHTML =
        kind === "event"
          ? `<p class="eyebrow">VERIFIED EVENT · 已核验事件</p><h2>${esc(d.title)}</h2><div class="tags">${paperLabels(d.academic)}</div><p>${esc(d.summary)}</p>${d.details?.amount || d.details?.stage ? `<p>${esc(d.details.amount)} ${esc(d.details.stage)}</p>` : ""}<p class="raw-meta">发生日期 ${date(d.occurred_at)} · 发布日期 ${date(d.published_at)}<br>${esc(d.track)} · ${esc(types[d.event_type] || d.event_type)} · ${d.evidence_count} 条证据</p><div class="tags">${d.companies.map((c) => `<a class="tag" data-close-dialog href="#company/${c.slug}">${esc(c.name)} ↗</a>`).join("")}</div>${d.evidence.map((v) => `<section class="evidence-source"><span class="pill green">${esc(v.source_name)}</span><blockquote>${esc(v.evidence_text)}</blockquote>${anchor(v.canonical_url, "查看原始出处")}<p class="raw-meta">正文位置 ${v.evidence_start}—${v.evidence_end} · 采集内容哈希 ${esc(v.content_hash)}</p></section>`).join("")}`
          : `<p class="eyebrow">SOURCE RECORD · 原始记录</p><h2>${esc(d.title)}</h2><p class="raw-meta">${esc(d.source_name)} · 发布 ${date(d.published_at)} · 收录 ${date(d.fetched_at, true)}</p><p>${anchor(d.canonical_url, "前往原文")}</p>${d.academic?.status === "preprint" ? '<p class="note-banner">预印本：未经期刊同行评议。请结合原文和后续版本判断。</p>' : '<p class="source-note">以下为来源中保存的正文或摘要，尚未作为已核验事件发布。</p>'}${d.academic?.journal_doi ? `<p>${anchor("https://doi.org/" + d.academic.journal_doi, "来源提供的正式发表 DOI")}</p>` : ""}<div class="raw-body">${esc(d.content_text)}</div>`;
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
    const pathRoute = pathParts.length ? [pathAliases[pathParts[0]] || pathParts[0], ...pathParts.slice(1)].join('/') : 'overview';
    const hash = location.hash.slice(1) || pathRoute;
    const [route, slug] = hash.split("/");
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
              : "overview";
    const title = names[current];
    document.title = title + " · BioAI 日知 · 问象";
    $("#crumb").textContent = title;
    document.querySelectorAll("[data-nav]").forEach((a) => {
      a.classList.toggle("active", a.dataset.nav === current);
      if (a.dataset.nav === current) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    content.innerHTML = '<div class="loading">正在连接数据服务…</div>';
    try {
      if (current === "directory") {
        content.innerHTML =
          heading(
            route === "company" ? "公司档案" : "公司黄页",
            "COMPANY DIRECTORY",
            "覆盖 130 家公司与历史主体，连接官方来源和发展进展。支持中英文、别名与历史品牌检索。",
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
            "管理工作台",
            "EDITORIAL WORKSPACE",
            "核验来源、审阅原文，将有证据的事件发布到全站。",
          ) + '<div id="admin-root"></div>';
        window.AdminPanel.mount($("#admin-root"));
        return;
      }
      if (route === 'record' || route === 'event') await resource(n,route,slug || '');
      else if (current === 'news') await news(n,route==='topic'?slug:null);
      else if (current === 'daily') await daily(n,slug);
      else await { overview, timeline, hot, academic, sources, saved, connect }[current](n);
    } catch (e) {
      if (n === epoch)
        content.innerHTML =
          heading(title, "BIOAI · 问象", "") +
          `<div class="error">${esc(e.message)} <button id="retry-load">重试</button></div>`;
      $("#retry-load")?.addEventListener("click", render);
    }
  }
  content.addEventListener("click", (e) => {
    const ev = e.target.closest("[data-event]"),
      r = e.target.closest("[data-record]"),
      p = e.target.closest("[data-page]");
    if (ev) showDetail("event", ev.dataset.event);
    if (r) showDetail("record", r.dataset.record);
    const copy=e.target.closest('[data-copy]');
    if(copy)navigator.clipboard.writeText(copy.dataset.copy).then(()=>{copy.textContent='已复制';}).catch(()=>{copy.textContent='请复制上方地址';});
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
  });
  $("#reload").onclick = render;
  const mobileMenu = $("#mobile-menu"), sidebar = $(".sidebar");
  const closeMobileMenu = () => {
    sidebar.classList.remove('nav-open');mobileMenu.setAttribute('aria-expanded','false');mobileMenu.textContent='全部栏目 ☰';
  };
  mobileMenu.onclick = () => {
    const open = sidebar.classList.toggle('nav-open');
    mobileMenu.setAttribute('aria-expanded',String(open));mobileMenu.textContent=open?'收起菜单 ×':'全部栏目 ☰';
  };
  sidebar.addEventListener('click',e=>{if(e.target.closest('a'))closeMobileMenu();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && sidebar.classList.contains('nav-open')){closeMobileMenu();mobileMenu.focus();}});

  // Refresh passive views only; never discard an admin edit, typed query, or open article.
  let lastRefresh = Date.now(), lastActivity = Date.now();
  const active = () => { lastActivity = Date.now(); };
  for (const event of ["pointerdown","keydown","scroll"]) window.addEventListener(event, active, {passive:true});
  const autoRefresh = () => {
    if(document.hidden || Date.now()-lastActivity>120000 || current==='admin' || $('#evidence-dialog').open || document.activeElement?.matches('input,textarea,select') || /^(record|event)\//.test(location.hash.slice(1)))return;
    if(Date.now()-lastRefresh<300000)return;
    lastRefresh=Date.now();render();
  };
  setInterval(autoRefresh,300000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)active();autoRefresh();});
  $("#today").textContent = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  render();
})();
