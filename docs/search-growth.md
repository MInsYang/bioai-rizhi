# BioAI 日知：搜索发现与有来源的原创内容

内容实现与来源核查日期：2026-10-08。上线、站点所有权验证和 sitemap 提交的实际结果由本轮 `search-acceptance.json` 记录；本文不把本地实现、验证标签存在或提交受理等同于搜索引擎已收录。

本轮按“统计使用 → 完善搜索入口 → 补原创内容”的顺序接入。服务端输出正文、内部链接、唯一 canonical、标题与描述；客户端仍沿用原报纸首页、公司黄页和栏目导航。专题指南和本周收录在客户端首载保留同一份服务端内容，避免加载脚本后把文章覆盖成默认栏目。

## 内容入口与证据范围

| 路径 | 内容 | 证据与更新方式 |
|---|---|---|
| `/` | 最新公开原文、已核验产业事件、公司入口和指南 | 读取公开 API；原文有来源日期与收录日期 |
| `/topics/:id` | 五个既有主题的原文、事件和相关公司 | 自动主题标签用于检索，不是公司能力或因果结论 |
| `/companies/:slug` | 公司档案、近期公开进展、合作/许可/并购节点、原文、验证过的来源 | 公司目录字段与项目证据分别解释；最多展示近期 12 条事件与 8 条原文，合作列表是这些事件的子集 |
| `/records/:id`、`/events/:id` | 来源节选或已核验事件的说明、出处与证据 | 导入原文使用 `WebPage`，不包装成原创 `NewsArticle`；超出默认范围的档案可读但 `noindex` |
| `/guides` | 原创中文阅读指南目录 | 固定内容与明确日期，逐段或逐行连接原始出处 |
| `/guides/virtual-cell-models` | 虚拟细胞、单细胞模型、结构预测、蛋白设计与公司的比较 | 比较任务、输入输出和验证边界，不设置未经验证的性能排名 |
| `/guides/ai-drug-discovery-collaborations` | AI 制药公司合作时间线的阅读方法 | 使用 2024-01-07 的真实官方公告作历史例子；区分首付款、条件性里程碑和研发结果 |
| `/guides/weekly-reading-method` | 每周公司动态、模型研究与临床信息的阅读方法 | 提供可复用问题与笔记，明确来源覆盖和缺失 |
| `/briefings` | 最新“本周收录”实时概要 | 完整公开集合计数后限制展示列表；不会生成无出处的新闻摘要 |
| `/digest/YYYY-MM-DD` | 每日 08:00 的冻结原文选集 | 原有选入上限 100 条，读时复核公开门槛；全部撤回的空期保留可读但 `noindex` |

原创指南使用 `Article`；指南目录、主题和收录概要使用 `CollectionPage`/`ItemList`；公司档案使用 `AboutPage`，其 `mainEntity` 是公司 `Organization`。结构化数据描述可见内容，不添加评分、专家审核、资质或富媒体结果保证。指南发布日期/修改日期为真实编写日期；历史例子的公告日期另外标注。

## 本周收录的计数契约

时间窗口为北京时间周一 00:00 至请求时刻，使用同一个 UTC 起止参数进行查询。原文按 `fetched_at` 计入：2025 年发表的论文若本周新收录，仍属于本周收录。窗口不是论文发表周，也不是合作发生周；页面明确说明这一点。

原文来自 `public_resources`，沿用公开列表的去重规则，并在每次阅读时应用来源验证、显式范围排除、主题/行业相关性，以及精选期刊与 AI 相关条件。学术名单是本站编辑选择，不是单篇研究质量评分。总数、行业原文数、学术原文数和有收录来源数在显示限额前计算；原文列表最多 30 条。来源数指去重后实际公开条目归属的不同 `source_id`。

主题计数按主题中的不同公开记录计算。一条记录可归入多个主题；没有主题 ID 但满足行业相关条件的记录可能只进入总数。主题计数之和不要求等于总数。零表示本站当前窗口没有符合条件的公开条目，不表示全行业没有进展。

事件来自 `public_events`，按发生日期优先、公告日期补充，统计同一周窗口内当前公开已核验事件，并显示最多 10 条。它与按收录日期统计的原文是两个明确标注的口径。来源撤销后，原文总数、事件及日报项目立即按公开视图重新计算。

## Sitemap 与爬取

`/sitemap.xml` 是 sitemap index，链接 `/sitemaps/pages/1.xml` 与分页子图：

```text
/sitemaps/companies/1.xml
/sitemaps/records/1.xml
/sitemaps/events/1.xml
/sitemaps/digests/1.xml
```

每页最多 200 个 URL，记录和事件使用稳定 ID 排序，公司按 slug，日报按日期。index 按公开集合实际总数生成全部页号，原文不再受旧实现的“90 天内前 100 条”截断。这里不创建一次性数据库快照；抓取期间新增、去重或撤销可能改变分页边界，后续读取重新反映公开集合。

公司子图只包含活跃且进入黄页的实体；原文子图采用 `/api/records` 默认公开门槛；事件子图只读取 `public_events`；日报子图只包含选集仍有符合门槛公开记录的日期。管理接口、草稿和撤销证据不进入子图。空分页/未知子图返回 404；若 index 超过协议的 50,000 项上限，返回 503，要求扩展分区，绝不静默丢弃尾部。

`lastmod` 仅用于具有明确修改日期的原创指南。`fetched_at` 是采集时间，公司 `updated_at` 不涵盖事件和来源撤销，每日 `generated_at` 不涵盖读时门槛变化；本轮不将这些日期冒充网页最后修改时间，也不使用请求时刻。Google 指出 sitemap 中 `lastmod` 应可核实地反映主要内容、结构化数据或链接变更，且忽略 `priority`/`changefreq`。[官方 sitemap 指南](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)

`robots.txt` 允许公开页面，排除 `/admin`、`/api/admin/` 和 `/internal/`，并指向 sitemap。站内公开互链使用真实路径；原有 hash 导航继续用于应用视图，指南与资料分享 URL 具有独立服务端正文。服务器和预渲染内容、可抓取链接以及唯一 canonical 符合 Google 的 JavaScript 页面建议。[JavaScript SEO 官方说明](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)

`llms.txt` 保留主题、来源、指南和 MCP 入口，并提醒调用方引用原始出处、区分收录与核验。它只是方便读取的索引，不是 Google AI 展示的额外要求。Google 对 AI Overviews/AI Mode 的说明仍强调可索引、可见文本、内部链接与匹配正文的结构化数据，没有要求专用 AI 文件或 schema，也不保证展示。[Google AI 搜索特性官方说明](https://developers.google.com/search/docs/appearance/ai-features)

## 站点验证与提交

支持 Worker 环境变量 `GOOGLE_SITE_VERIFICATION` 和 `BING_SITE_VERIFICATION`。只有存在非空实际值时才输出经过 HTML 转义的 `google-site-verification` / `msvalidate.01` 标签；模板中的占位验证标签会移除。不要填写猜测值，或把 Worker 部署成功当作外部账号的所有权验证成功。

在已登录相应账号的 Search Console / Bing Webmaster Tools 中，先验证 URL 前缀站点，再提交该站点的 `/sitemap.xml`。提交后记录服务实际受理状态；抓取、收录、展现及排名属于后续可观察状态。若外部账号暂不可操作，站点内容和发现入口仍可独立完成，具体账号步骤在验收记录中标注。

后续增长评估使用匿名访问统计观察指南/主题/公司页的实际使用与返回，结合 Search Console 展现、点击和索引反馈判断是否值得补更多内容。不要将 API 调用量、索引条目数、sitemap URL 数或验证标签视为读者人数或流量增长。

### IndexNow 自动通知

`.github/workflows/search-discovery.yml` 每天北京时间 **08:35**（GitHub Actions 调度可能延迟）读取正式站点的分页 sitemap，对比此前成功提交的 URL 集合，向 IndexNow 通知新增、撤回以及具有明确 `lastmod` 的变更。首次运行提交当前公开集合；后续无变化则不重复提交。每批最多 10,000 个 URL，发现总量另设 100,000 条上限；超过上限明确失败而非截断后误报撤回。

Worker 的 `/indexnow-key.txt` 输出独立 `INDEXNOW_KEY` 验证值；GitHub `BIOAI_INDEXNOW_KEY` 保存同值。脚本先校验正式站点文件，再向 `https://api.indexnow.org/indexnow` 发出通知，不输出密钥。状态使用 Actions cache 保存，缓存丢失会重提当前集合，不会伪造上次提交时间。报告单独保留 30 天。

HTTP 200 只表示已接收通知；202 表示验证待处理，脚本不推进状态，下次重试。403/429 等失败保留先前状态并让工作流失败。现有动态页面没有可靠修改时间的，不凭抓取时间触发“已修改”通知，仍由搜索引擎按 sitemap/链接重新抓取。IndexNow 也不提供 Google Search Console 的账号验证或搜索表现数据。[IndexNow 官方协议](https://www.indexnow.org/documentation)

## 原创内容的原始出处

- [Cell：How to build the virtual cell with artificial intelligence](https://doi.org/10.1016/j.cell.2024.11.015)：研究愿景、测量尺度与评估要求。
- [Nature Methods：scGPT](https://www.nature.com/articles/s41592-024-02201-0)：单细胞基础模型的原始论文及任务设定。
- [Nature：AlphaFold 3](https://www.nature.com/articles/s41586-024-07487-w)：生物分子复合物结构预测和原论文的局限说明。
- [Nature：RFdiffusion](https://www.nature.com/articles/s41586-023-06415-8)：蛋白结构设计与实验验证的原始论文。
- [Isomorphic Labs：2024 年两项药企合作公告](https://www.isomorphiclabs.com/articles/isomorphic-labs-kicks-off-2024-with-two-pharmaceutical-collaborations)：有日期的历史合作例子，不据此推断今天所有项目状态。
- [ClinicalTrials.gov](https://clinicaltrials.gov/)：登记与结果信息由申办方或研究者提交，登记本身不代表研究已有结果或获认可。

所有解释为原创中文阅读说明。原文只提供短节选并带出处，不复制整篇论文、摘要或公司新闻稿。下一轮内容变更应更新指南真实修改日期，核查被改动事实对应的原始材料，并保留未知、负结果与覆盖缺口。

## 验证

```text
cd /Volumes/T24/BIoAINews/cloudflare/site
node --test publication.test.mjs guides.test.mjs
```

本轮 13 项测试通过，其中 PostgreSQL 测试在新建并销毁的本地临时数据库中运行。覆盖指南引用与 schema、唯一 canonical、验证标签转义、不存在页面与 HEAD、服务端来源链接、分页超过 100 条、北京时间周界、统计与显示限额、学术/范围过滤、去重及来源撤销后周概要/公司页/sitemap/日报同时收回。没有向应用数据库注入测试内容。

整站 Worker/UI 检查、公开源码导出、部署后 HTML 与页面导航检查，以及外部搜索账号验证，均由主 session 整合验收；以本轮验收文件的实际状态为准。

### 2026-10-08 Google 账号验收

URL 前缀 `https://bioai-rizhi.pages.dev/` 已通过 HTML 标签所有权验证，Sitemap 提交已受理。首次 Sitemap 报告显示“无法抓取”，随后 Google 自身实时网址检查于北京时间 19:28:55 确认 `/sitemap.xml` 抓取成功、允许抓取；据此重提一次，后续报告状态单独保存。不要把实时可访问等同于 Sitemap 已完成处理、页面已收录或搜索已有流量。Google 搜索表现页当前提示处理中，约一天后再查看。[Google Sitemap 报告说明](https://support.google.com/webmasters/answer/7451001)

IndexNow 手动云端工作流已真实验收：2026-10-08 11:36:58 UTC，258 个公开 URL 获 HTTP 200，成功保存提交状态；[运行记录](https://github.com/MInsYang/bioai-rizhi/actions/runs/37771185066)。首次运行曾遭 HTTP 拉取失败，未推进状态；补充最多三次短暂故障重试与固定阶段/状态码诊断后，重跑通过。尚未跨日观察 08:35 自动触发；200 不代表收录。Google Sitemap 最后复查仍显示无法抓取，保留为外部待观察项。
