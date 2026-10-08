window.RegistryPanel = {
  mount(root, slug, onTitle) {
    root.innerHTML =
      '<div id="intro"><p>公司、技术与一手信息源。主题筛选基于已收录的关联原文，不推断公司的技术能力。</p><div class="filters"><input id="q" type="search" placeholder="搜索中文名、英文名或历史别名" aria-label="搜索公司"><select id="track" aria-label="公司类别"><option value="">全部公司类别</option><option>测序与多组学</option><option>AI与模型数据</option><option>生物医药</option></select><select id="company-topic" aria-label="关联原文主题"><option value="">全部关联主题</option><option value="virtual-cell">AI 虚拟细胞</option><option value="organoid">类器官</option><option value="virtual-embryo">虚拟胚胎</option><option value="virtual-organ">虚拟器官</option><option value="drug-discovery">AI 制药</option></select><select id="region" aria-label="地区与布局"><option value="">全部地区与布局</option><option value="cn">中国大陆</option><option value="hk">中国香港</option><option value="global">海外</option><option value="cross">跨地区布局</option></select><label><input id="history" type="checkbox"> 包含历史实体</label></div></div><div id="registry-result" aria-live="polite">正在读取数据库…</div>';
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
    const link = (u, t) =>
      u && /^https:\/\//.test(u)
        ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)} ↗</a>`
        : "尚无官网";
    const title = (c) => c.name_zh || c.name_en;
    let request = 0;
    let followed = [];
    try {
      followed = JSON.parse(localStorage.getItem("bioai-followed") || "[]");
      if (!Array.isArray(followed)) followed = [];
    } catch {}
    async function api(url) {
      const r = await fetch(url);
      if (!r.ok) throw Error("数据库服务暂不可用，请稍后重试。");
      return r.json();
    }
    function follow(c) {
      return `<button data-follow="${c.slug}" aria-pressed="${followed.includes(c.slug)}">${followed.includes(c.slug) ? "已关注" : "关注"}</button>`;
    }
    async function list() {
      window.RegistryPanel.state = {
        q: $("#q").value,
        track: $("#track").value,
        region: $("#region").value,
        "company-topic": $("#company-topic").value,
        history: $("#history").checked,
      };
      const seq = ++request;
      const p = new URLSearchParams({
        q: $("#q").value,
        track: $("#track").value,
        topic: $("#company-topic").value,
        region_group: $("#region").value,
        history: $("#history").checked,
        limit: 200,
      });
      try {
        const d = await api("/api/companies?" + p);
        if (seq !== request) return;
        if (!root.isConnected) return;
        $("#registry-result").innerHTML =
          `<p>${d.total} 家实体 · 关注仅保存在当前浏览器</p><div class="wall">${d.items.map((c) => `<article class="card"><div class="monogram" aria-hidden="true">${esc(title(c).slice(0, 2))}</div><h2><a href="#company/${encodeURIComponent(c.slug)}">${esc(title(c))}</a></h2><small>${esc(c.name_en)} · ${esc(c.region)}</small><p>${esc(c.track)}</p><div class="tags">${c.focus.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}${c.status !== "active" ? `<span class="tag">${esc(c.status)}</span>` : ""}</div><p class="event">${c.latest_event ? esc(c.latest_event) : "尚无已核验事件"}<br>近 30 天 ${c.events_30d} 条已核验事件</p><footer>${link(c.official_website, "官网")}${follow(c)}</footer></article>`).join("") || '<div class="empty">没有匹配的公司，试试其他名称或地区。</div>'}</div>`;
      } catch (e) {
        if (seq !== request || !root.isConnected) return;
        $("#registry-result").innerHTML =
          `<div class="error">${esc(e.message)}</div>`;
      }
    }
    async function detail(slug) {
      $("#intro").hidden = true;
      try {
        const c = await api("/api/companies/" + encodeURIComponent(slug));
        if (!root.isConnected) return;
        document.title = title(c) + " · BioAI 日知 · 问象";
        onTitle?.(title(c));
        if (!root.isConnected) return;
        $("#registry-result").innerHTML =
          `<a href="#directory">← 返回公司黄页</a><p>${esc(c.name_en)} · ${esc(c.region)} · ${esc(c.track)} · ${esc(c.status)}</p><div class="tags">${c.focus.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div><p>${link(c.official_website, "官方网站")} ${follow(c)}</p><div class="grid"><div><section class="panel"><h2>公司档案与历史名称</h2><p>${esc(c.notes || "暂未收录公司简介。")}</p><div class="tags">${c.alias_records.map((a) => `<span class="tag">${esc(a.alias)} · ${a.alias_type === "historical_brand" ? "历史品牌 / " : ""}${a.verification_status === "seed_unverified" ? "资料待复核" : "已复核"}</span>`).join("")}</div>${c.identity_links.map((l) => `<p>归属记录：${esc(l.related_name)} · ${l.verification_status === "pending" ? "待人工核验" : esc(l.verification_status)}<br><small>${esc(l.notes)}</small></p>`).join("")}</section><section class="panel"><h2>独立进展时间线</h2>${c.events.map((e) => `<article><time>${esc(e.occurred_at || e.published_at || "日期待核验")}</time><h3><button data-event="${e.id}">${esc(e.title)}</button></h3><p>${esc(e.summary)}</p></article>`).join("") || '<p class="empty">尚无已核验进展。</p>'}</section><section class="panel"><h2>合作网络</h2>${c.relations.length ? c.relations.map((r) => `<p><button data-event="${r.event_id}">${esc(r.predicate)} · 查看事件证据</button></p>`).join("") : "<p>暂无附有证据的关系记录。</p>"}</section><section class="panel"><h2>相关药物、模型、数据集与论文</h2><p>相关实体与版本关联尚未接入。</p></section></div><aside><section class="panel"><h2>官方来源与健康状态</h2>${c.sources.map((s) => `<div class="source">${link(s.url, s.name)}<br><span class="status">${s.verified ? "归属已验证" : s.verification_status === "rejected" ? "验证已拒绝" : "待验证"} · ${s.adapter === "unsupported" ? "采集适配未接入" : s.enabled && s.cloud_runtime_enabled ? "已接入自动采集" : "待接入自动更新"}</span><br><small>最近成功：${s.last_success_at ? esc(new Date(s.last_success_at).toLocaleString()) : "尚无"}<br>连续失败：${s.consecutive_failures}${s.consecutive_failures >= 3 ? " · 需要复核" : ""}</small></div>`).join("") || "<p>暂无来源。</p>"}<small>未验证的社交账号只在管理后台显示。</small></section></aside></div>`;
      } catch (e) {
        if (!root.isConnected) return;
        $("#registry-result").innerHTML =
          `<div class="error">${esc(e.message)}</div>`;
      }
    }
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-follow]");
      if (!b) return;
      const id = b.dataset.follow;
      followed = followed.includes(id)
        ? followed.filter((x) => x !== id)
        : [...followed, id];
      try {
        localStorage.setItem("bioai-followed", JSON.stringify(followed));
      } catch {}
      b.textContent = followed.includes(id) ? "已关注" : "关注";
      b.setAttribute("aria-pressed", followed.includes(id));
    });
    const state = window.RegistryPanel.state || {};
    for (const id of ["q", "track", "region", "company-topic"])
      $("#" + id).value = state[id] || "";
    $("#history").checked = !!state.history;
    let timer;
    $("#q").addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(list, 200);
    });
    for (const id of ["track", "region", "history", "company-topic"])
      $("#" + id).addEventListener("change", list);
    slug ? detail(slug) : list();
  },
};
