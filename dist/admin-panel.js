window.AdminPanel = {
  analyticsMarkup(data, days = 7) {
    const esc = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
    const numeric = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
    const count = value => numeric(value) ? value.toLocaleString("zh-CN") : "—";
    const duration = value => numeric(value) ? Math.round(value).toLocaleString("zh-CN") + " ms" : "—";
    const stamp = value => {
      const date = new Date(value || "");
      return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("zh-CN", {timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short"}).format(date) : "尚未开始";
    };
    const summary = data.summary || {}, mcp = data.mcp || {}, excluded = data.excluded || {};
    const daily = Array.isArray(data.daily) ? data.daily.slice(0, 30) : [];
    const actionLabels = {outbound_click: "原始出处 / 外链", company_open: "公司档案打开", resource_open: "原文 / 事件打开", mcp_copy: "MCP 复制按钮点击", rss_click: "RSS 查看 / 复制按钮点击"};
    const pageLabels = {"/": "日知头版", "/#overview": "全站看板", "/#timeline": "产业进展", "/#hot": "Hot 关系图", "/#academic": "学术进展", "/#directory": "公司黄页", "/#sources": "信息来源", "/#saved": "我的关注", "/#news": "新闻与文章", "/#daily": "每日摘要", "/#connect": "连接你的 AI", "/guides": "专题指南", "/briefings": "本周收录"};
    const pageLabel = path => pageLabels[path] || (/^\/companies\//.test(path) ? "公司档案" : /^\/topics\//.test(path) ? "赛道主题" : /^\/records\//.test(path) ? "原文分享页" : /^\/events\//.test(path) ? "事件分享页" : /^\/digest\//.test(path) ? "日报分享页" : /^\/guides\//.test(path) ? "专题指南" : "公开页面");
    const card = (label, value, note) => `<article class="analytics-card"><h3>${label}</h3><strong>${count(value)}</strong><p>${note}</p></article>`;
    const rankTable = (title, headers, rows, emptyText) => `<section class="analytics-ranking"><h3>${title}</h3>${rows.length ? `<div class="analytics-table-wrap"><table><thead><tr>${headers.map(h => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>` : `<p class="analytics-empty">${emptyText}</p>`}</section>`;
    const max = Math.max(1, ...daily.flatMap(row => [row.page_views || 0, row.clicks || 0, row.mcp_tool_calls || 0]));
    const x = i => daily.length > 1 ? 48 + i * 640 / (daily.length - 1) : 368;
    const y = value => 164 - (numeric(value) ? value : 0) * 136 / max;
    const series = [{key: "page_views", label: "页面浏览", color: "#355747"}, {key: "clicks", label: "点击", color: "#a17d42"}, {key: "mcp_tool_calls", label: "MCP 执行", color: "#617997"}];
    const chart = daily.length ? `<svg viewBox="0 0 720 210" role="img" aria-label="每日页面浏览、点击及 MCP 工具执行次数"><title>每日页面浏览、点击及 MCP 工具执行次数；详细数据见下表</title>${[0, .5, 1].map(f => `<line class="analytics-gridline" x1="48" y1="${164 - 136 * f}" x2="688" y2="${164 - 136 * f}"/><text class="analytics-axis" x="38" y="${168 - 136 * f}" text-anchor="end">${count(Math.round(max * f))}</text>`).join("")}${series.map(s => `<polyline fill="none" stroke="${s.color}" stroke-width="2.5" points="${daily.map((row, i) => `${x(i)},${y(row[s.key])}`).join(" ")}"/>${daily.map((row, i) => `<circle cx="${x(i)}" cy="${y(row[s.key])}" r="3" fill="${s.color}"><title>${esc(row.date)} · ${s.label} ${count(row[s.key])}</title></circle>`).join("")}`).join("")}${daily.map((row, i) => i === 0 || i === daily.length - 1 || (daily.length > 7 ? i % 7 === 0 : i % 2 === 0) ? `<text class="analytics-axis" x="${x(i)}" y="193" text-anchor="middle">${esc(String(row.date).slice(5))}</text>` : "").join("")}</svg>` : '<p class="analytics-empty">逐日记录尚未积累。</p>';
    const noData = summary.page_views === 0 && summary.clicks === 0 && mcp.tool_calls === 0;
    return `<section class="analytics-dashboard" aria-label="访问与 MCP 统计">
      <header class="analytics-heading"><div><p class="analytics-kicker">BIOAI 日知 · STATISTICS</p><h2>访问与 MCP 统计</h2><p>${esc(data.period?.start_date || "")} — ${esc(data.period?.end_date || "")} · 北京时间</p></div><div class="analytics-toolbar"><div class="analytics-range" role="group" aria-label="统计时间范围">${[[1, "今日"], [7, "近 7 天"], [30, "近 30 天"]].map(([value, label]) => `<button data-analytics-days="${value}" aria-pressed="${value === Number(days)}">${label}</button>`).join("")}</div><button id="analytics-refresh">刷新统计 ↻</button></div></header>
      <p class="analytics-provenance">统计起点：${esc(stamp(data.collected_since))} · 更新：${esc(stamp(data.generated_at))} · 起点前的数据没有补录</p>
      ${noData ? '<p class="analytics-empty analytics-empty-banner">所选期间尚无符合统计口径的访问或工具执行记录。新采集的数据会逐步显示在这里。</p>' : ""}
      <div class="analytics-cards">${card("页面浏览 · PV", summary.page_views, "公开页面进入次数")}${card("匿名会话", summary.sessions, "当前标签页标识，不代表独立人数")}${card("内容与链接点击", summary.clicks, "指定内容打开、外链与连接按钮")}${card("MCP 工具执行", mcp.tool_calls, "由服务端记录的实际执行")}</div>
      <section class="analytics-mcp-summary"><h3>MCP 执行质量</h3><dl><div><dt>成功</dt><dd>${count(mcp.successes)}</dd></div><div><dt>错误</dt><dd>${count(mcp.errors)}</dd></div><div><dt>错误率</dt><dd>${numeric(mcp.error_rate) ? (mcp.error_rate * 100).toLocaleString("zh-CN", {maximumFractionDigits: 1}) + "%" : "—"}</dd></div><div><dt>平均耗时</dt><dd>${duration(mcp.avg_duration_ms)}</dd></div><div><dt>P95 耗时</dt><dd>${duration(mcp.p95_duration_ms)}</dd></div></dl><p>只计算实际执行的工具；连接握手、工具清单查询和网页地址复制分别处理。暂无执行时，错误率和耗时显示「—」。</p></section>
      <section class="analytics-trend"><div class="analytics-section-head"><h3>每日趋势</h3><div class="analytics-legend">${series.map(s => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join("")}</div></div>${chart}<details><summary>查看逐日数据</summary><div class="analytics-table-wrap"><table><thead><tr><th scope="col">日期</th><th scope="col">PV</th><th scope="col">匿名会话</th><th scope="col">点击</th><th scope="col">MCP 执行</th><th scope="col">成功</th><th scope="col">错误</th></tr></thead><tbody>${daily.map(row => `<tr><th scope="row">${esc(row.date)}</th>${["page_views", "sessions", "clicks", "mcp_tool_calls", "mcp_successes", "mcp_errors"].map(key => `<td>${count(row[key])}</td>`).join("")}</tr>`).join("") || '<tr><td colspan="7">暂无逐日记录</td></tr>'}</tbody></table></div><p>每日会话在当天去重，逐日相加可能大于整个期间的会话数。</p></details></section>
      <div class="analytics-rankings">${rankTable("热门页面", ["页面", "PV", "会话"], (data.top_pages || []).slice(0, 10).map(row => `<tr><td><strong>${esc(pageLabel(row.path))}</strong><small>${esc(row.path)}</small></td><td>${count(row.page_views)}</td><td>${count(row.sessions)}</td></tr>`), "暂无页面访问记录。")}${rankTable("访问来源", ["来源域名", "PV", "会话"], (data.top_referrers || []).slice(0, 10).map(row => `<tr><td>${esc(!row.referrer_host || row.referrer_host === "(direct)" ? "直接访问 / 未提供外部来源" : row.referrer_host)}</td><td>${count(row.page_views)}</td><td>${count(row.sessions)}</td></tr>`), "暂无访问来源记录。")}${rankTable("内容与连接动作", ["动作 / 目标", "次数"], (data.top_actions || []).slice(0, 10).map(row => `<tr><td><strong>${esc(actionLabels[row.event_type] || row.event_type)}</strong><small>${esc(row.target || "")}</small></td><td>${count(row.count)}</td></tr>`), "暂无指定动作记录。")}${rankTable("MCP 工具排名", ["工具", "执行", "成功 / 错误", "平均耗时"], (mcp.tools || []).slice(0, 10).map(row => `<tr><td><code>${esc(row.tool)}</code></td><td>${count(row.tool_calls)}</td><td>${count(row.successes)} / ${count(row.errors)}</td><td>${duration(row.avg_duration_ms)}</td></tr>`), "暂无实际 MCP 工具执行记录。")}</div>
      <details class="analytics-methodology"><summary>统计口径与采集说明</summary><p>匿名会话标识保存在当前标签页，30 分钟没有活动后更新。页面切换和会话过期后重新活动计入 PV，数据刷新不重复计入；公司、原文或事件打开、指定外链、MCP 复制按钮点击及 RSS 查看或复制按钮点击计入点击。按钮点击不证明剪贴板复制成功。</p><p>网页统计按 User-Agent 启发式识别浏览器，排除测试、已识别自动化及未知客户端。该分类存在误差，匿名会话不能解释为实际人数。MCP 统计只计已执行的注册工具，包括正常的 AI 自动化客户端，排除标记为测试的调用。</p><p>本期排除：测试网页事件 ${count(excluded.test_events)}，已识别自动化网页事件 ${count(excluded.automated_web_events)}，未知客户端网页事件 ${count(excluded.unknown_web_events)}，测试 MCP 调用 ${count(excluded.test_mcp_calls)}。统计事件保留 ${count(data.retention_days)} 天。</p><p>统计记录仅含允许的页面路径、动作标识和来源域名，不含搜索词、表单内容、完整链接或原始 IP。同站点来源不作为外部来源上报；直接访问与未提供外部来源合并显示。浏览器 DNT / GPC 信号会停止网页事件采集。管理页面与管理操作不纳入访问统计。</p></details>
    </section>`;
  },
  mount(root) {
    root.innerHTML =
      '<p>查看访问与 MCP 统计，核验来源并审阅原文；验证记录与修改均保存审计。</p><div class="filters admin-auth"><input type="password" id="token" placeholder="管理员访问密钥（仅本次页面有效）" aria-label="管理员访问密钥" autocomplete="off"><button id="login" class="primary">连接后台</button><button id="logout">退出</button></div><div id="controls" hidden><div class="filters admin-tools"><button id="analytics" aria-pressed="false">访问与 MCP 统计</button><button id="refresh" aria-pressed="false">来源核验</button><button id="add">添加候选来源</button><button id="company-edit">编辑公司与别名</button><button id="jobs">任务与失败重试</button><button id="raw-review">原文与事件复核</button><button id="candidate-review">行业候选事件</button></div><div class="filters" id="source-filters" hidden><select id="status" aria-label="验证状态"><option value="pending">待验证</option><option value="verified">已验证</option><option value="rejected">已拒绝</option><option value="">全部</option></select><label><input type="checkbox" id="social"> 只看社交账号</label></div></div><div id="message" role="status"></div><div id="admin-content"></div><dialog id="dialog" aria-label="管理操作与核验"><button id="close" class="admin-dialog-close" aria-label="关闭管理弹窗">关闭 ×</button><div id="dialog-content"></div></dialog>';
    const $ = (s) => root.querySelector(s),
      esc = (s) =>
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
    let token = "",
      sources = [],
      generation = 0,
      authGeneration = 0,
      view = "",
      analyticsDays = 7;
    const anchor = (u, t) =>
      /^https:\/\//.test(u || "")
        ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)} ↗</a>`
        : esc(t);
    async function api(url, method = "GET", data) {
      const session = token;
      const auth = authGeneration;
      const r = await fetch(url, {
        method,
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: data ? JSON.stringify(data) : undefined,
      });
      const d = await r.json();
      if (session !== token || auth !== authGeneration || !root.isConnected) {
        const cancelled = Error("请求已取消");
        cancelled.cancelled = true;
        throw cancelled;
      }
      if (!r.ok)
        throw Error(
          typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail),
        );
      return d;
    }
    function error(e) {
      if (e.cancelled || !root.isConnected || !token) return;
      $("#message").innerHTML = `<p class="error">${esc(e.message)}</p>`;
    }
    function beginView(name) {
      view = name;
      const g = ++generation;
      $("#source-filters").hidden = name !== "sources";
      $("#analytics").setAttribute("aria-pressed", String(name === "analytics"));
      $("#refresh").setAttribute("aria-pressed", String(name === "sources"));
      return g;
    }
    const activeView = (g) => g === generation && !!token && root.isConnected;
    async function loadAnalytics(days = analyticsDays) {
      analyticsDays = [1, 7, 30].includes(Number(days)) ? Number(days) : 7;
      const g = beginView("analytics");
      $("#message").textContent = "正在读取统计…";
      $("#admin-content").innerHTML = '<div class="loading">正在读取访问与 MCP 统计…</div>';
      try {
        const data = await api("/api/admin/analytics?days=" + analyticsDays);
        if (!activeView(g)) return;
        $("#controls").hidden = false;
        $("#message").textContent = "";
        $("#admin-content").innerHTML = window.AdminPanel.analyticsMarkup(data, analyticsDays);
        $("#analytics-refresh").onclick = () => loadAnalytics();
        for (const button of root.querySelectorAll("[data-analytics-days]")) button.onclick = () => loadAnalytics(button.dataset.analyticsDays);
      } catch (e) {
        if (!activeView(g)) return;
        error(e);
        $("#admin-content").innerHTML = '<p class="analytics-empty">统计暂时无法读取。<button id="analytics-retry">重试统计</button></p>';
        $("#analytics-retry").onclick = () => loadAnalytics();
      }
    }
    async function load() {
      const g = beginView("sources");
      try {
        const loaded = await api(
          "/api/admin/sources?" +
            new URLSearchParams({
              status: $("#status").value,
              social: $("#social").checked,
            }),
        );
        if (!activeView(g)) return;
        sources = loaded;
        $("#controls").hidden = false;
        $("#message").textContent =
          sources.length + " 条来源（最多显示 1000 条）";
        $("#admin-content").innerHTML =
          `<div class="table-wrap"><table><thead><tr><th>公司 / 来源</th><th>原始入口</th><th>验证与采集</th><th>健康</th><th>操作</th></tr></thead><tbody>${sources.map((s) => `<tr><td>${esc(s.name_zh || s.name_en || "公共来源")}<br><small>${esc(s.name)} · ${esc(s.source_type)}</small></td><td class="url">${anchor(s.url, s.url)}${s.config.provenance ? "<br><small>发现于 " + anchor(s.config.provenance.discovered_on, s.config.provenance.discovered_on) + "</small>" : ""}</td><td>${esc(s.verification_status)}<br><small>${s.adapter === "unsupported" ? "适配器未接入" : s.enabled ? "任务已启用" : "未启用任务"} · ${esc(s.poll_profile)}</small></td><td class="${s.consecutive_failures >= 3 ? "health-alert" : ""}">${s.consecutive_failures} 次连续失败<br><small>${s.last_success_at ? esc(new Date(s.last_success_at).toLocaleString()) : "尚无成功记录"}</small></td><td><button data-review="${s.id}">验证</button><button data-history="${s.id}">审计</button></td></tr>`).join("")}</tbody></table></div>`;
      } catch (e) {
        if (activeView(g)) error(e);
      }
    }
    function modal(html) {
      $("#dialog-content").innerHTML = html;
      $("#dialog").showModal();
    }
    function review(id) {
      const s = sources.find((x) => x.id === id);
      modal(
        `<h2>验证 ${esc(s.name)}</h2><p>${anchor(s.url, s.url)}</p><p>社交账号验证只确认归属。没有官方 API 或可用适配器时，不能启用帖子采集。</p><form id="review-form"><label>决定<select name="decision"><option value="verified">验证通过</option><option value="pending">保持待核验</option><option value="rejected">拒绝</option></select></label><label>依据<select name="method"><option value="manual_review">人工核验</option><option value="official_backlink">官网反向链接（需匹配已发现出处）</option><option value="platform_badge">平台官方认证</option></select></label><label>证据页面 URL<input name="evidence_url" type="url" required value="${esc(s.config.provenance?.discovered_on || "")}"></label><label>核验说明（至少 10 字符）<textarea name="evidence_text" required minlength="10"></textarea></label><label><input type="checkbox" name="enable_ingestion" ${s.enabled ? "checked" : ""} ${s.adapter === "unsupported" ? "disabled" : ""}> 同时启用采集 / 发现任务</label><button class="primary">保存验证记录</button><p id="form-error"></p></form>`,
      );
      $("#review-form").onsubmit = async (e) => {
        e.preventDefault();
        const g = generation;
        const f = new FormData(e.target);
        try {
          await api("/api/admin/sources/" + id + "/review", "POST", {
            decision: f.get("decision"),
            method: f.get("method"),
            evidence_url: f.get("evidence_url"),
            evidence_text: f.get("evidence_text"),
            enable_ingestion: f.has("enable_ingestion"),
          });
          if (!activeView(g)) return;
          $("#dialog").close();
          if (view === "sources") load();
        } catch (e) {
          if (activeView(g)) $("#form-error").textContent = e.message;
        }
      };
    }
    $("#login").onclick = () => {
      token = $("#token").value.trim();
      authGeneration++;
      $("#token").value = "";
      $("#controls").hidden = true;
      $("#dialog").close();
      sources = [];
      $("#admin-content").innerHTML = "";
      if (!token) { $("#message").textContent = "请填写管理员访问密钥。"; return; }
      loadAnalytics();
    };
    $("#logout").onclick = () => {
      generation++;
      authGeneration++;
      token = "";
      sources = [];
      $("#controls").hidden = true;
      $("#token").value = "";
      $("#admin-content").innerHTML = "";
      $("#message").textContent = "已退出";
      $("#dialog").close();
    };
    $("#close").onclick = () => $("#dialog").close();
    $("#analytics").onclick = () => loadAnalytics();
    $("#refresh").onclick = load;
    $("#status").onchange = load;
    $("#social").onchange = load;
    root.addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (b?.dataset.review) review(b.dataset.review);
      if (b?.dataset.history) {
        const g = generation;
        try {
          const rows = await api(
            "/api/admin/sources/" + b.dataset.history + "/reviews",
          );
          if (!activeView(g)) return;
          modal(
            "<h2>验证审计</h2>" +
              rows
                .map(
                  (r) =>
                    `<p>${esc(r.decision)} · ${esc(r.reviewer)}<br>${esc(r.created_at)}<br>${anchor(r.evidence_url, r.evidence_url)}<br>${esc(r.evidence_text)}</p>`,
                )
                .join("") +
              (rows.length ? "" : "尚无验证记录"),
          );
        } catch (e) {
          if (activeView(g)) error(e);
        }
      }
    });

    let rawRows = [],
      rawPage = 0;
    $("#candidate-review").onclick = async () => {
      const g = beginView("candidates");
      try {
        await api('/api/admin/candidates/generate','POST',{});
        if (!activeView(g)) return;
        const rows = await api('/api/admin/candidates');
        if (!activeView(g)) return;
        rawRows = rows;
        $('#admin-content').innerHTML = '<h2>行业候选事件</h2><p>以下由规则提出，尚未发布。请阅读原文，核实事件类型、公司和证据后再发布。</p>' + (rawRows.length ? rawRows.map(r=>`<article class="admin-raw"><small>${esc(r.source_name)} · 建议类型 ${esc(r.suggested_type)} · ${esc(r.published_at || '日期待核')}</small><h3>${esc(r.title)}</h3><p>${esc((r.content_text || '').slice(0,250))}</p>${anchor(r.canonical_url,'原始出处')} <button data-publish="${r.id}">复核并发布</button><button data-dismiss-candidate="${r.candidate_id}">忽略</button></article>`).join('') : '<p>暂无待复核候选。</p>');
      } catch(e) { if (activeView(g)) error(e); }
    };
    root.addEventListener('click',async e=>{
      const b=e.target.closest('[data-dismiss-candidate]');if(!b)return;
      const g = generation;
      try {
        await api('/api/admin/candidates/'+b.dataset.dismissCandidate+'/dismiss','POST',{});
        if (activeView(g) && view === 'candidates') $('#candidate-review').click();
      } catch(e) { if (activeView(g) && view === 'candidates') error(e); }
    });
    $("#raw-review").onclick = async () => {
      const g = beginView("records");
      try {
        const rows = await api(
          "/api/admin/records?limit=51&offset=" + rawPage * 50,
        );
        if (!activeView(g)) return;
        rawRows = rows;
        $("#admin-content").innerHTML =
          '<h2>原文与事件复核</h2><p class="source-note">核验原文事实并标注证据句后发布。发布后同步更新产业进展、公司详情和关系图。</p>' +
          rawRows
            .slice(0, 50)
            .map(
              (r) =>
                `<article class="admin-raw"><small>${esc(r.source_name)} · ${esc(r.published_at || "日期未提供")} · ${r.event_count} 条关联事件</small><h3>${esc(r.title)}</h3><p>${esc((r.content_text || "").slice(0, 200))}</p>${anchor(r.canonical_url, "查看原文")} <button data-publish="${r.id}" ${r.verified ? "" : "disabled"}>${r.verified ? "复核并发布" : "请先验证来源"}</button></article>`,
            )
            .join("") +
          `<div class="pager"><button id="raw-prev" ${rawPage === 0 ? "disabled" : ""}>上一页</button><span>第 ${rawPage + 1} 页</span><button id="raw-next" ${rawRows.length <= 50 ? "disabled" : ""}>下一页</button></div>`;
        $("#raw-prev").onclick = () => {
          rawPage--;
          $("#raw-review").click();
        };
        $("#raw-next").onclick = () => {
          rawPage++;
          $("#raw-review").click();
        };
      } catch (e) {
        if (activeView(g)) error(e);
      }
    };
    root.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-publish]");
      if (!b) return;
      const g = generation;
      try {
        const r = rawRows.find((x) => x.id === b.dataset.publish),
          cs = (await api("/api/companies?history=true&limit=200")).items;
        if (!activeView(g)) return;
        const opts = cs
          .map(
            (c) =>
              `<option value="${c.id}" ${c.id === r.company_id ? "selected" : ""}>${esc(c.name_zh || c.name_en)}</option>`,
          )
          .join("");
        const requestId = crypto.randomUUID();
        modal(
          `<h2>复核事件</h2><p class="source-note">提交代表你已阅读原文，并确认摘要、公司归属和关系事实。没有明确关系证据时留空。</p><details><summary>展开已保存原文</summary><div class="raw-body">${esc(r.content_text)}</div></details><form id="publish-form"><label>事件标题<input name="title" value="${esc(r.title)}" required minlength="5" maxlength="500"></label><label>事实摘要<textarea name="summary" required minlength="10"></textarea></label><label>原文证据句（完整复制，至少20字符）<textarea name="evidence_text" required minlength="20"></textarea></label><label>进展方向<select name="track">${["测序与多组学", "生物医药", "AI与模型数据", "学术进展"].map((t) => `<option>${t}</option>`).join("")}</select></label><label>事件类型<select name="event_type">${Object.entries(
            {
              funding: "融资",
              partnership: "合作",
              acquisition: "并购",
              licensing: "授权",
              product: "产品",
              clinical: "临床",
              regulatory: "监管",
              strategy: "战略",
              paper: "论文",
              model: "模型",
              dataset: "数据集",
              other: "其他",
            },
          )
            .map(([v, t]) => `<option value="${v}">${t}</option>`)
            .join(
              "",
            )}</select></label><label>发生日期（来源未说明可留空）<input name="occurred_at" type="date"></label><label>涉及公司（可多选）<select name="company_ids" multiple size="6">${opts}</select></label><label>金额（保留原文币种，可空）<input name="amount"></label><label>阶段（可空）<input name="stage"></label><label><input type="checkbox" name="editor_pick"> 编辑精选</label><details><summary>添加一条明确公司关系（可选）</summary><label>主体<select name="subject_id"><option value="" selected>不添加关系</option>${opts.replaceAll("selected", "")}</select></label><label>关系<select name="predicate"><option value="collaborates_with">合作</option><option value="invests_in">投资</option><option value="acquires">收购</option><option value="licenses_from">获得授权</option><option value="co_develops">共同开发</option><option value="adopts_platform">采用平台</option><option value="co_publishes">共同发表</option></select></label><label>对象<select name="object_id"><option value="" selected>选择另一公司</option>${opts.replaceAll("selected", "")}</select></label><label>明确关系证据（必须在上述证据句内）<textarea name="relation_evidence"></textarea></label></details><button class="primary" id="publish-submit">确认核验并发布</button><p id="form-error"></p></form>`,
        );
        if(r.suggested_type) {
          $('#publish-form [name="event_type"]').value=r.suggested_type;
          $('#publish-form [name="track"]').value='生物医药';
        }
        $("#publish-form").onsubmit = async (e) => {
          e.preventDefault();
          const submitted = generation;
          const f = new FormData(e.target);
          const body = {
            request_id: requestId,
            raw_item_id: r.id,
            title: f.get("title"),
            summary: f.get("summary"),
            evidence_text: f.get("evidence_text"),
            track: f.get("track"),
            event_type: f.get("event_type"),
            occurred_at: f.get("occurred_at")
              ? f.get("occurred_at") + "T00:00:00Z"
              : null,
            company_ids: f.getAll("company_ids"),
            editor_pick: f.has("editor_pick"),
            amount: f.get("amount"),
            stage: f.get("stage"),
            relations: [],
          };
          if (f.get("subject_id") && f.get("relation_evidence").trim())
            body.relations.push({
              subject_id: f.get("subject_id"),
              object_id: f.get("object_id"),
              predicate: f.get("predicate"),
              evidence_text: f.get("relation_evidence"),
            });
          $("#publish-submit").disabled = true;
          try {
            const published = await api("/api/admin/events", "POST", body);
            let candidateWarning='';
            if(r.candidate_id) {
              try {await api('/api/admin/candidates/'+r.candidate_id+'/complete','POST',{event_id:published.id});}
              catch {candidateWarning='<p class="source-note">事件已成功发布，候选状态同步暂未成功。请刷新候选列表核对，无需重复发布。</p>';}
            }
            if (!activeView(submitted)) return;
            modal(
              `<h2>事件已发布</h2>${candidateWarning}<p>时间线、公司详情与关系图已同步使用该事件。</p><button id="unpublish">撤回该事件</button>`,
            );
            $("#unpublish").onclick = async () => {
              const retracting = generation;
              try {
                await api(
                  "/api/admin/events/" + published.id + "/unpublish",
                  "POST",
                  {},
                );
                if (!activeView(retracting)) return;
                $("#dialog").close();
                if (view === "records") $("#raw-review").click();
                else if (view === "candidates") $("#candidate-review").click();
              } catch (e) {
                if (activeView(retracting)) error(e);
              }
            };
            if (view === "records") $("#raw-review").click();
            else if (view === "candidates") $("#candidate-review").click();
          } catch (e) {
            if (!activeView(submitted)) return;
            $("#form-error").textContent = e.message;
            $("#publish-submit").disabled = false;
          }
        };
      } catch (e) {
        if (activeView(g)) error(e);
      }
    });
    $("#jobs").onclick = async () => {
      const g = beginView("jobs");
      try {
        const rows = await api("/api/admin/jobs");
        if (!activeView(g)) return;
        $("#admin-content").innerHTML =
          '<h2>最近任务</h2><p>按连续失败次数退避，重试上限以任务记录为准；成功分页不消耗失败预算。租约过期后可重新领取。</p><div class="table-wrap"><table><tr><th>来源</th><th>状态</th><th>处理轮次 / 连续失败</th><th>HTTP / 耗时 / 字节</th><th>错误</th></tr>' +
          rows
            .map(
              (j) =>
                `<tr><td>${esc(j.name)}</td><td>${esc(j.status)}</td><td>${j.attempts} 次 / ${j.failure_count ?? 0} / ${j.max_attempts}</td><td>${esc(j.last_attempt?.http_status ?? "—")} / ${esc(j.last_attempt?.duration_ms ?? "—")} ms / ${esc(j.last_attempt?.bytes_fetched ?? "—")}</td><td>${esc(j.last_error || "")}</td></tr>`,
            )
            .join("") +
          "</table></div>";
      } catch (e) {
        if (activeView(g)) error(e);
      }
    };
    $("#add").onclick = async () => {
      const g = generation;
      try {
        const cs = await api("/api/companies?history=true&limit=200");
        if (!activeView(g)) return;
        modal(
          `<h2>添加候选来源</h2><form id="add-form"><label>公司<select name="company_id">${cs.items.map((c) => `<option value="${c.id}">${esc(c.name_zh || c.name_en)}</option>`).join("")}</select></label><label>名称<input name="name" required></label><label>HTTPS URL<input name="url" type="url" required></label><label>来源类型<select name="source_type">${["homepage", "newsroom", "investor_relations", "blog", "rss", "sitemap", "social"].map((t) => `<option>${t}</option>`).join("")}</select></label><label>社交平台（如适用）<input name="platform"></label><button class="primary">保存待验证来源</button><p id="form-error"></p></form>`,
        );
        $("#add-form").onsubmit = async (e) => {
          e.preventDefault();
          const submitted = generation;
          try {
            await api(
              "/api/admin/sources",
              "POST",
              Object.fromEntries(new FormData(e.target)),
            );
            if (!activeView(submitted)) return;
            $("#dialog").close();
            if (view === "sources") load();
            else $("#message").textContent = "候选来源已保存。可在来源核验中查看。";
          } catch (e) {
            if (activeView(submitted)) $("#form-error").textContent = e.message;
          }
        };
      } catch (e) {
        if (activeView(g)) error(e);
      }
    };
    $("#company-edit").onclick = async () => {
      const g = generation;
      try {
        const cs = await api("/api/companies?history=true&limit=200");
        if (!activeView(g)) return;
        modal(
          `<h2>公司与别名</h2><select id="company-pick"><option value="">选择公司</option>${cs.items.map((c) => `<option value="${c.slug}">${esc(c.name_zh || c.name_en)}</option>`).join("")}</select><div id="edit-fields"></div>`,
        );
        let selection = 0;
        $("#company-pick").onchange = async (e) => {
          const seq = ++selection;
          $("#edit-fields").innerHTML = "";
          if (!e.target.value) {
            $("#edit-fields").innerHTML = "";
            return;
          }
          const slug = e.target.value;
          try {
            const c = await api("/api/companies/" + slug);
            if (
              !activeView(g) ||
              seq !== selection ||
              !$("#company-pick") ||
              $("#company-pick").value !== slug
            )
              return;
            $("#edit-fields").innerHTML =
              `<form id="edit-form">${["name_zh", "name_en", "official_website", "priority"].map((k) => `<label>${{ name_zh: "中文名称", name_en: "英文名称", official_website: "官网", priority: "优先级 P0 / P1 / P2" }[k]}<input name="${k}" value="${esc(c[k])}"></label>`).join("")}<label>别名（每行一个；重名时保留候选，不自动合并）<textarea name="aliases">${esc(c.aliases.join("\n"))}</textarea></label><label>历史与归属说明<textarea name="notes">${esc(c.notes)}</textarea></label><button class="primary">保存并记录审计</button><p id="form-error"></p></form>`;
            $("#edit-form").onsubmit = async (e) => {
              e.preventDefault();
              const submitted = generation;
              const data = Object.fromEntries(new FormData(e.target));
              data.aliases = data.aliases
                .split("\n")
                .map((x) => x.trim())
                .filter(Boolean);
              try {
                await api("/api/admin/companies/" + slug, "PUT", data);
                if (!activeView(submitted)) return;
                $("#dialog").close();
                if (view === "sources") load();
                else $("#message").textContent = "公司与别名已保存。";
              } catch (e) {
                if (activeView(submitted)) $("#form-error").textContent = e.message;
              }
            };
          } catch (e) {
            if (activeView(g)) error(e);
          }
        };
      } catch (e) {
        if (activeView(g)) error(e);
      }
    };
  },
};
