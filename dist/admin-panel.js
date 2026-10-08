window.AdminPanel = {
  mount(root) {
    root.innerHTML =
      '<p>人工确认公司来源及社交账号归属；验证记录与修改均保存审计。</p><div class="filters"><input type="password" id="token" placeholder="管理员访问密钥（仅本次页面有效）" aria-label="管理员访问密钥" autocomplete="off"><button id="login" class="primary">连接后台</button><button id="logout">退出</button></div><div id="controls" hidden><div class="filters"><select id="status" aria-label="验证状态"><option value="pending">待验证</option><option value="verified">已验证</option><option value="rejected">已拒绝</option><option value="">全部</option></select><label><input type="checkbox" id="social"> 只看社交账号</label><button id="refresh">刷新来源</button><button id="add">添加候选来源</button><button id="company-edit">编辑公司与别名</button><button id="jobs">任务与失败重试</button><button id="raw-review">原文与事件复核</button><button id="candidate-review">行业候选事件</button></div></div><div id="message" role="status"></div><div id="admin-content"></div><dialog id="dialog" aria-label="管理操作与核验"><button id="close" class="admin-dialog-close" aria-label="关闭管理弹窗">关闭 ×</button><div id="dialog-content"></div></dialog>';
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
      generation = 0;
    const anchor = (u, t) =>
      /^https:\/\//.test(u || "")
        ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)} ↗</a>`
        : esc(t);
    async function api(url, method = "GET", data) {
      const session = token;
      const r = await fetch(url, {
        method,
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: data ? JSON.stringify(data) : undefined,
      });
      const d = await r.json();
      if (session !== token || !root.isConnected) throw Error("请求已取消");
      if (!r.ok)
        throw Error(
          typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail),
        );
      return d;
    }
    function error(e) {
      if (!root.isConnected) return;
      $("#message").innerHTML = `<p class="error">${esc(e.message)}</p>`;
    }
    async function load() {
      const g = ++generation;
      try {
        const loaded = await api(
          "/api/admin/sources?" +
            new URLSearchParams({
              status: $("#status").value,
              social: $("#social").checked,
            }),
        );
        if (g !== generation || !token || !root.isConnected) return;
        sources = loaded;
        $("#controls").hidden = false;
        $("#message").textContent =
          sources.length + " 条来源（最多显示 1000 条）";
        $("#admin-content").innerHTML =
          `<div class="table-wrap"><table><thead><tr><th>公司 / 来源</th><th>原始入口</th><th>验证与采集</th><th>健康</th><th>操作</th></tr></thead><tbody>${sources.map((s) => `<tr><td>${esc(s.name_zh || s.name_en || "公共来源")}<br><small>${esc(s.name)} · ${esc(s.source_type)}</small></td><td class="url">${anchor(s.url, s.url)}${s.config.provenance ? "<br><small>发现于 " + anchor(s.config.provenance.discovered_on, s.config.provenance.discovered_on) + "</small>" : ""}</td><td>${esc(s.verification_status)}<br><small>${s.adapter === "unsupported" ? "适配器未接入" : s.enabled ? "任务已启用" : "未启用任务"} · ${esc(s.poll_profile)}</small></td><td class="${s.consecutive_failures >= 3 ? "health-alert" : ""}">${s.consecutive_failures} 次连续失败<br><small>${s.last_success_at ? esc(new Date(s.last_success_at).toLocaleString()) : "尚无成功记录"}</small></td><td><button data-review="${s.id}">验证</button><button data-history="${s.id}">审计</button></td></tr>`).join("")}</tbody></table></div>`;
      } catch (e) {
        error(e);
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
        const f = new FormData(e.target);
        try {
          await api("/api/admin/sources/" + id + "/review", "POST", {
            decision: f.get("decision"),
            method: f.get("method"),
            evidence_url: f.get("evidence_url"),
            evidence_text: f.get("evidence_text"),
            enable_ingestion: f.has("enable_ingestion"),
          });
          $("#dialog").close();
          load();
        } catch (e) {
          $("#form-error").textContent = e.message;
        }
      };
    }
    $("#login").onclick = () => {
      token = $("#token").value;
      $("#token").value = "";
      load();
    };
    $("#logout").onclick = () => {
      generation++;
      token = "";
      sources = [];
      $("#controls").hidden = true;
      $("#admin-content").innerHTML = "";
      $("#message").textContent = "已退出";
      $("#dialog").close();
    };
    $("#close").onclick = () => $("#dialog").close();
    $("#refresh").onclick = load;
    $("#status").onchange = load;
    $("#social").onchange = load;
    root.addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (b?.dataset.review) review(b.dataset.review);
      if (b?.dataset.history) {
        try {
          const rows = await api(
            "/api/admin/sources/" + b.dataset.history + "/reviews",
          );
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
          error(e);
        }
      }
    });

    let rawRows = [],
      rawPage = 0;
    $("#candidate-review").onclick = async () => {
      try {
        await api('/api/admin/candidates/generate','POST',{});
        rawRows = await api('/api/admin/candidates');
        $('#admin-content').innerHTML = '<h2>行业候选事件</h2><p>以下由规则提出，尚未发布。请阅读原文，核实事件类型、公司和证据后再发布。</p>' + (rawRows.length ? rawRows.map(r=>`<article class="admin-raw"><small>${esc(r.source_name)} · 建议类型 ${esc(r.suggested_type)} · ${esc(r.published_at || '日期待核')}</small><h3>${esc(r.title)}</h3><p>${esc((r.content_text || '').slice(0,250))}</p>${anchor(r.canonical_url,'原始出处')} <button data-publish="${r.id}">复核并发布</button><button data-dismiss-candidate="${r.candidate_id}">忽略</button></article>`).join('') : '<p>暂无待复核候选。</p>');
      } catch(e) { error(e); }
    };
    root.addEventListener('click',async e=>{
      const b=e.target.closest('[data-dismiss-candidate]');if(!b)return;
      try {await api('/api/admin/candidates/'+b.dataset.dismissCandidate+'/dismiss','POST',{});$('#candidate-review').click();}catch(e){error(e);}
    });
    $("#raw-review").onclick = async () => {
      try {
        rawRows = await api(
          "/api/admin/records?limit=51&offset=" + rawPage * 50,
        );
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
        error(e);
      }
    };
    root.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-publish]");
      if (!b) return;
      try {
        const r = rawRows.find((x) => x.id === b.dataset.publish),
          cs = (await api("/api/companies?history=true&limit=200")).items;
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
            modal(
              `<h2>事件已发布</h2>${candidateWarning}<p>时间线、公司详情与关系图已同步使用该事件。</p><button id="unpublish">撤回该事件</button>`,
            );
            $("#unpublish").onclick = async () => {
              try {
                await api(
                  "/api/admin/events/" + published.id + "/unpublish",
                  "POST",
                  {},
                );
                $("#dialog").close();
                $("#raw-review").click();
              } catch (e) {
                error(e);
              }
            };
            $("#raw-review").click();
          } catch (e) {
            $("#form-error").textContent = e.message;
            $("#publish-submit").disabled = false;
          }
        };
      } catch (e) {
        error(e);
      }
    });
    $("#jobs").onclick = async () => {
      try {
        const rows = await api("/api/admin/jobs");
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
        error(e);
      }
    };
    $("#add").onclick = async () => {
      try {
        const cs = await api("/api/companies?history=true&limit=200");
        modal(
          `<h2>添加候选来源</h2><form id="add-form"><label>公司<select name="company_id">${cs.items.map((c) => `<option value="${c.id}">${esc(c.name_zh || c.name_en)}</option>`).join("")}</select></label><label>名称<input name="name" required></label><label>HTTPS URL<input name="url" type="url" required></label><label>来源类型<select name="source_type">${["homepage", "newsroom", "investor_relations", "blog", "rss", "sitemap", "social"].map((t) => `<option>${t}</option>`).join("")}</select></label><label>社交平台（如适用）<input name="platform"></label><button class="primary">保存待验证来源</button><p id="form-error"></p></form>`,
        );
        $("#add-form").onsubmit = async (e) => {
          e.preventDefault();
          try {
            await api(
              "/api/admin/sources",
              "POST",
              Object.fromEntries(new FormData(e.target)),
            );
            $("#dialog").close();
            load();
          } catch (e) {
            $("#form-error").textContent = e.message;
          }
        };
      } catch (e) {
        error(e);
      }
    };
    $("#company-edit").onclick = async () => {
      try {
        const cs = await api("/api/companies?history=true&limit=200");
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
              seq !== selection ||
              !$("#company-pick") ||
              $("#company-pick").value !== slug
            )
              return;
            $("#edit-fields").innerHTML =
              `<form id="edit-form">${["name_zh", "name_en", "official_website", "priority"].map((k) => `<label>${{ name_zh: "中文名称", name_en: "英文名称", official_website: "官网", priority: "优先级 P0 / P1 / P2" }[k]}<input name="${k}" value="${esc(c[k])}"></label>`).join("")}<label>别名（每行一个；重名时保留候选，不自动合并）<textarea name="aliases">${esc(c.aliases.join("\n"))}</textarea></label><label>历史与归属说明<textarea name="notes">${esc(c.notes)}</textarea></label><button class="primary">保存并记录审计</button><p id="form-error"></p></form>`;
            $("#edit-form").onsubmit = async (e) => {
              e.preventDefault();
              const data = Object.fromEntries(new FormData(e.target));
              data.aliases = data.aliases
                .split("\n")
                .map((x) => x.trim())
                .filter(Boolean);
              try {
                await api("/api/admin/companies/" + slug, "PUT", data);
                $("#dialog").close();
                load();
              } catch (e) {
                $("#form-error").textContent = e.message;
              }
            };
          } catch (e) {
            error(e);
          }
        };
      } catch (e) {
        error(e);
      }
    };
  },
};
