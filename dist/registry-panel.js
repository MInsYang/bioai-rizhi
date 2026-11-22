window.RegistryPanel = {
  mount(root, slug, onTitle) {
    const l = window.BioAILocale, tr = (key, vars) => l.t(key, vars);
    root.innerHTML =
      `<div id="intro"><p>${tr("公司、技术与一手信息源。主题筛选基于已收录的关联原文，不推断公司的技术能力。")}</p><div class="filters"><input id="q" type="search" placeholder="${tr("搜索中文名、英文名或历史别名")}" aria-label="${tr("搜索公司")}"><select id="track" aria-label="${tr("公司类别")}"><option value="">${tr("全部公司类别")}</option><option value="测序与多组学">${tr("测序与多组学")}</option><option value="AI与模型数据">${tr("AI与模型数据")}</option><option value="生物医药">${tr("生物医药")}</option></select><select id="company-topic" aria-label="${tr("关联原文主题")}"><option value="">${tr("全部关联主题")}</option><option value="virtual-cell">${tr("AI 虚拟细胞")}</option><option value="organoid">${tr("类器官")}</option><option value="virtual-embryo">${tr("虚拟胚胎")}</option><option value="virtual-organ">${tr("虚拟器官")}</option><option value="drug-discovery">${tr("AI 制药")}</option></select><select id="region" aria-label="${tr("地区与布局")}"><option value="">${tr("全部地区与布局")}</option><option value="cn">${tr("中国大陆")}</option><option value="hk">${tr("中国香港")}</option><option value="global">${tr("海外")}</option><option value="cross">${tr("跨地区布局")}</option></select><label><input id="history" type="checkbox"> ${tr("包含历史实体")}</label></div></div><div id="registry-result" aria-live="polite">${tr("正在读取数据库…")}</div>`;
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
        : tr("尚无官网");
    const title = (c) => l.companyName(c);
    let request = 0;
    let followed = [];
    try {
      followed = JSON.parse(localStorage.getItem("bioai-followed") || "[]");
      if (!Array.isArray(followed)) followed = [];
    } catch {}
    async function api(url) {
      let r;
      try { r = await fetch(l.url(url)); }
      catch { throw Error(tr("网络连接失败，请检查连接后重试。")); }
      if (!r.ok) throw Error(tr("数据库服务暂不可用，请稍后重试。"));
      try { return await r.json(); }
      catch { throw Error(tr("数据库服务暂不可用，请稍后重试。")); }
    }
    function follow(c) {
      return `<button data-follow="${c.slug}" aria-pressed="${followed.includes(c.slug)}">${followed.includes(c.slug) ? tr("已关注") : tr("关注")}</button>`;
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
          `<p>${tr("公司数：{count} · 关注仅保存在当前浏览器", {count: d.total})}</p><div class="wall">${d.items.map((c) => `<article class="card"><div class="monogram" aria-hidden="true">${esc(title(c).slice(0, 2))}</div><h2><a href="#company/${encodeURIComponent(c.slug)}">${esc(title(c))}</a></h2><small>${esc(c.name_en)} · ${esc(l.label(c.region))}</small><p>${esc(l.label(c.track))}</p><div class="tags">${c.focus.map((t) => `<span class="tag">${esc(l.label(t))}</span>`).join("")}${c.status !== "active" ? `<span class="tag">${esc(l.label(c.status))}</span>` : ""}</div><p class="event" data-source-original>${c.latest_event ? esc(c.latest_event) : tr("尚无已核验事件")}<br>${tr("近 30 天已核验事件：{count}", {count: c.events_30d})}</p><footer>${link(c.official_website, tr("官网"))}${follow(c)}</footer></article>`).join("") || `<div class="empty">${tr("没有匹配的公司，试试其他名称或地区。")}</div>`}</div>`;
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
        const records = slug === "iambic-therapeutics" ? await api("/api/records?" + new URLSearchParams({company:slug,days:0,limit:40})) : {items:[]};
        if (!root.isConnected) return;
        document.title = title(c) + tr(" · BioAI 日知 · 问象");
        onTitle?.(title(c));
        if (!root.isConnected) return;
        $("#registry-result").innerHTML =
          `<a href="#directory">${tr("← 返回公司黄页")}</a><p>${esc(c.name_en)} · ${esc(l.label(c.region))} · ${esc(l.label(c.track))} · ${esc(l.label(c.status))}</p><div class="tags">${c.focus.map((t) => `<span class="tag">${esc(l.label(t))}</span>`).join("")}</div><p>${link(c.official_website, tr("官方网站"))} ${follow(c)}</p><div class="grid"><div><section class="panel"><h2>${tr("公司档案与历史名称")}</h2><p data-source-original>${esc(c.notes || tr("暂未收录公司简介。"))}</p><div class="tags">${c.alias_records.map((a) => `<span class="tag">${esc(a.alias)} · ${a.alias_type === "historical_brand" ? tr("历史品牌 / ") : ""}${a.verification_status === "seed_unverified" ? tr("资料待复核") : tr("已复核")}</span>`).join("")}</div>${c.identity_links.map((l) => `<p>${tr("归属记录：")}${esc(l.related_name)} · ${l.verification_status === "pending" ? tr("待人工核验") : esc(window.BioAILocale.label(l.verification_status))}<br><small>${esc(l.notes)}</small></p>`).join("")}</section>${slug === "iambic-therapeutics" ? `<section class="panel"><h2>${tr("公开来源记录与官方目录")}</h2><p class="source-note">${tr("目录信息与已保存正文分别标注；历史正文保留，目录条目不用于研究摘要或事件证据。")}</p>${records.items.map(r=>`<article class="record"${r.content_level === "index_metadata" ? ' data-content-level="index_metadata"' : ""}><p class="record-meta">${r.content_level === "index_metadata" ? `<span class="pill gold">${tr("官方目录信息，正文未采集")}</span>` : ""}<span>${esc(r.source_name)}</span><time>${esc(r.content_level === "index_metadata" && r.provenance?.publication_date_raw ? r.provenance.publication_date_raw : l.date(r.published_at || r.fetched_at))}</time></p><h3 data-source-original><button data-record="${esc(r.id)}">${esc(r.title)}</button></h3>${r.content_level !== "index_metadata" && r.excerpt ? `<p data-source-original>${esc(r.excerpt.slice(0,220))}</p>` : ""}<p>${link(r.canonical_url,tr(r.content_level === "index_metadata" ? "官方链接" : "原始出处"))} · <a href="${esc(l.url("/records/" + encodeURIComponent(r.id)))}">${tr("分享页 ↗")}</a></p></article>`).join("")}</section>` : ""}<section class="panel"><h2>${tr("独立进展时间线")}</h2>${c.events.map((e) => `<article><time>${esc(l.date(e.occurred_at || e.published_at))}</time><h3><button data-event="${e.id}">${esc(e.title)}</button></h3><p>${esc(e.summary)}</p></article>`).join("") || `<p class="empty">${tr("尚无已核验进展。")}</p>`}</section><section class="panel"><h2>${tr("合作网络")}</h2>${c.relations.length ? c.relations.map((r) => `<p><button data-event="${r.event_id}">${esc(l.label(r.predicate))} ${tr("· 查看事件证据")}</button></p>`).join("") : `<p>${tr("暂无附有证据的关系记录。")}</p>`}</section><section class="panel"><h2>${tr("相关药物、模型、数据集与论文")}</h2><p>${tr("相关实体与版本关联尚未接入。")}</p></section></div><aside><section class="panel"><h2>${tr("官方来源与健康状态")}</h2>${c.sources.map((s) => `<div class="source">${link(s.url, s.name)}<br><span class="status">${s.verified ? tr("归属已验证") : s.verification_status === "rejected" ? tr("验证已拒绝") : tr("待验证")} · ${s.adapter === "unsupported" ? tr("采集适配未接入") : s.enabled && s.cloud_runtime_enabled ? tr("已接入自动采集") : tr("待接入自动更新")}</span><br><small>${tr("最近成功：")}${s.last_success_at ? esc(l.date(s.last_success_at, true)) : tr("尚无")}<br>${tr("连续失败：")}${s.consecutive_failures}${s.consecutive_failures >= 3 ? tr(" · 需要复核") : ""}${s.collection_mode === "index_metadata" ? `<br>${tr("官方目录采集；不采集正文")}` : ""}${s.registry_key ? `<br><a href="#source/${esc(encodeURIComponent(s.registry_key))}">${tr("浏览已收录条目")}</a>` : ""}</small></div>`).join("") || `<p>${tr("暂无来源。")}</p>`}<small>${tr("未验证的社交账号只在管理后台显示。")}</small></section></aside></div>`;
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
      b.textContent = followed.includes(id) ? tr("已关注") : tr("关注");
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
