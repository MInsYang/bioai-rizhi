# 官方 AI 生物医药产业来源审计（2026-10-08）

已在本机实际获取并核验 9 个官方来源：5 个 RSS、4 个静态 HTML 新闻室。注册表同时保留 12 个待编辑审核的产业事件候选，覆盖合作、许可、融资和研发进展。新增唯一公司为 NVIDIA；其余公司 slug 与原始公司种子对应。此次审计没有执行生产部署、发布事件、创建合作关系或 Git 操作。

注册表：[bioai_industry_sources_v2.json](bootstrap/bioai_industry_sources_v2.json)。版本 `industry-2026-10-v2`，SHA-256 固定为：

```text
9ed50d60a998e9bd64be2bf86e508b1ae43306d3cd576286203a1c4b6d4f693d
```

## 可用来源与新鲜度

所有下列 endpoint 均于 2026-10-08 本机直接 HTTP 获取成功。每个来源包含官方身份观察、精确主机白名单、robots 快照、实际 HTTP 状态/Date、字节数和响应 SHA-256。RSS 另外保留由官方页面发现 feed 的原始 href 链；HTML 保留新闻室观察与真实文章解析样本。HTTP 200 本身不代表内容属于 AI 生物医药，来源启用也不代表文章已审核。

| 公司 / 来源 | 实际 endpoint | 观察与内容范围 |
|---|---|---|
| XtalPi | [官方中文 RSS](https://www.xtalpi.com/feed/) | 200，10 项；最新 2026-10-08。另含 10-07 AI 闭环、10-06 XGlue 管线更新。中文官网工作，英文官网此次返回 403。 |
| Eli Lilly | [官方 IR RSS](https://investor.lilly.com/rss/news-releases.xml?items=10) | 200，10 项；最新 2026-10-05。综合药企新闻，需要逐条判定 AI 与生物医药关联。 |
| NVIDIA | [Healthcare and Life Sciences RSS](https://nvidianews.nvidia.com/cats/healthcare_and_life_sciences.xml) | 200，10 项；最新 2026-06-23，为 BioNeMo Agent Toolkit。此分类约 3.5 个月未更新，不能作为 10 月新闻充足的证据。 |
| Absci | [官方 IR RSS](https://investors.absci.com/rss/news-releases.xml) | 200，10 项；最新 2026-09-24，为 ABS-201 的未来 II 期试验初步计划。feed 通常为简短内容，不能冒充全文。 |
| Generate Biomedicines | [官方新闻发布 RSS](https://generatebiomedicines.com/news-releases/feed/) | 200，10 项；最新 2026-10-01，为 Roswell Park CAR-T 临床合作。官网和 IR 根 `/feed/` 均为空，未采用。robots 声明 10 秒 crawl delay，配置与数据库运行门槛均保留该下限。 |
| Recursion | [官方投资者新闻室](https://ir.recursion.com/news-events/press-releases) | 200；允许 `/news-releases/news-release-details/`。真实文章的 JSON-LD 标题、发布时间和正文已解析。 |
| Isomorphic Labs | [官方 announcements](https://www.isomorphiclabs.com/announcements) | 200；允许 `/articles/` 与 `/press/`。实际解析覆盖 10-07 VBI、05-12 融资、01-20 强生合作。正文选择 `.news-detail-body_main`，包含导语融资事实。 |
| Iambic | [官方 news](https://www.iambic.ai/news) | 200；允许 `/post/`。实际解析覆盖 10-05 IAM217、09-21 AbbVie、06-22 Bayer。无 h1 时使用页面 og:title；原始人类日期单独保留。 |
| Owkin | [官方 news](https://www.owkin.com/news) | 200；允许 `/newsfeed/`。实际解析覆盖 Sanofi 和 AstraZeneca 的 K Pro 合作/许可文章。 |

这一集合是经过实际访问的小规模可用补充，没有宣称覆盖所有 AI 制药公司。Lilly、NVIDIA 和 XtalPi 的综合来源要求文章正文明确支持 AI 与生物医药相关性；对于经过官方身份核验的专业 AI 生物医药企业，身份上下文可帮助识别研发进展，但会议日程、股权激励等普通公司公告仍需由产业过滤规则排除。

## 12 个待审核候选及边界

以下日期均来自官方发布日期。除公告本身外，没有独立建立交易签署日或实际执行日。候选的完整原始标题、URL、逐字短证据、字符区间、参与者映射和限制在注册表 `event_candidates` 中；本文仅概述，编辑应打开原出处核对。

| 日期 | 官方出处 / 候选 | 类型与审核要点 |
|---|---|---|
| 2026-10-07 | [Isomorphic 加入 Virtual Biology Initiative](https://www.isomorphiclabs.com/articles/isomorphic-labs-joins-the-virtual-biology-initiative) | 合作。Biohub 为未映射的召集方；没有猜测其 canonical slug 或创建关系边。 |
| 2026-10-06 | [XtalPi XGlue 分子胶管线更新](https://www.xtalpi.com/%e6%b4%bb%e6%80%a7%e6%8f%90%e5%8d%87%e8%b6%85%e5%8d%83%e5%80%8d%ef%bc%81%e6%99%b6%e6%b3%b0%e5%88%86%e5%ad%90%e8%83%b6%e7%ae%a1%e7%ba%bf%e5%85%ac%e5%b8%83%e6%9c%80%e6%96%b0%e8%bf%9b%e5%b1%95/) | 临床前平台/管线更新，类型 `other`；分子活性提升和向 PCC 推进属于公司陈述，不是临床疗效。 |
| 2026-10-05 | [Iambic 提交 IAM217 IND](https://www.iambic.ai/post/iambic-submits-ind-for-a-potentially-brain-penetrant-kif18a-inhibitor-iam217-its-second-wholly-owned-ai-discovered-candidate) | 研发里程碑。已提交 IND，不等于获批或已启动临床；潜在脑穿透性不能写成临床结论。 |
| 2026-09-24 | [Absci ABS-201 II 期初步计划](https://investors.absci.com/news-releases/news-release-details/absci-announces-preliminary-details-phase-2-storylinetm-trial-ai) | 研发计划。计划 2027 年中开展；候选显式 `trial_started=false`，不可表述为 II 期已经开始。 |
| 2026-09-21 | [Iambic 与 AbbVie 合作](https://www.iambic.ai/post/abbvie-and-iambic-announce-collaboration-to-accelerate-ai-driven-drug-discovery) | 多年期 AI 小分子发现合作；财务金额未披露。 |
| 2026-08-05 | [Recursion / Genentech 首个神经科学靶点推进](https://ir.recursion.com/news-releases/news-release-details/recursion-reports-second-quarter-financial-results-genentech) | 早期药物发现合作进展。合作方选择靶点不等于临床候选或试验已启动。 |
| 2026-06-22 | [Iambic 与 Bayer 合作](https://www.iambic.ai/post/bayer-and-iambic-collab) | AI 小分子发现合作；原文公司名 Bayer 保留，目录映射为既有 `bayer-pharmaceuticals`。 |
| 2026-06-05 | [Owkin / Sanofi K Pro 合作](https://www.owkin.com/newsfeed/owkin-to-build-ai-agents-as-part-of-a-multi-year-k-pro-collaboration-with-sanofi) | 五年 K Pro 许可与药物研发 AI agents 合作。 |
| 2026-05-13 | [Owkin / AstraZeneca K Pro 许可](https://www.owkin.com/newsfeed/owkin-to-build-ai-agents-as-part-of-a-multi-year-k-pro-license-agreement-with-astrazeneca) | 三年许可安排；并非本次新产品临床疗效证据。 |
| 2026-05-12 | [Isomorphic Labs B 轮融资](https://www.isomorphiclabs.com/press/isomorphic-labs-funding) | 21 亿美元 B 轮。Thrive Capital 原名与 lead-investor 角色保留，canonical slug 为 null；没有增加未经身份核验的投资者节点。 |
| 2026-01-20 | [Isomorphic / Johnson & Johnson 研究合作](https://www.isomorphiclabs.com/articles/isomorphic-labs-enters-into-a-research-collaboration-with-johnson-johnson) | 原文强生集团名称保留。映射到目录 `johnson-johnson-innovative-medicine` 的集团/部门层级限制已记录，法律签约实体并未独立建立；编辑应审查关系映射。 |
| 2026-01-12 | [NVIDIA / Lilly AI 联合实验室](https://nvidianews.nvidia.com/news/nvidia-and-lilly-announce-co-innovation-lab-to-reinvent-drug-discovery-in-the-age-of-ai) | 五年最多 10 亿美元拟投入人才、基础设施和计算；不是已确认收入或一笔固定支付。 |

## 未启用、空 feed 与访问限制

- Tempus news 与 Schrödinger RSS 发现页直接返回 403。官方搜索索引存在 Tempus–Recursion、Tempus–BMS 等相关公告，但不将搜索可见性写成直接抓取成功。
- Generate 官网与 IR 的根 `/feed/` 为 HTTP 200、零项目。已采用新闻发布页实际链接的 `/news-releases/feed/`，不把空 feed 算作活跃采集。
- Insilico news 索引为 200，但文章列表由动态 Tilda feed 生成；没有为静态 HTML adapter 猜测 API。Qilu 文章直接访问超时，未作为已抓取候选。
- BenevolentAI 页面为 200，但当次可见最新发布为 2025-03-12，保留历史线索而未优先激活。
- Tahoe 旧 `https://blog.tahoebio.ai/feed` 在此前真实运行返回 429。本次没有重试该受限 endpoint，也没有更换参数、代理或主机绕过。当前官网已变为 [www.tahoebio.ai](https://www.tahoebio.ai/)，实际获取为 200、Webflow `/news/` 链接，无官方 RSS backlink；根 `/feed/` 实测为 404。建议停用旧 RSS 的云调度并保留历史 raw 数据；当前 HTML 来源可另行验证。此次未证实替代 RSS。

## 可执行导入与采集契约

从仓库根目录执行：

```sh
# 无凭据、无数据库、无网络的计划输出
.venv/bin/python scripts/configure_industry.py

# 只读、每个来源一次、有限重定向和字节预算；不重写冻结注册表
.venv/bin/python scripts/configure_industry.py --verify-live

# 本地 PostgreSQL：9 个来源 + 1 个新公司 + 12 个待审核候选
.venv/bin/python scripts/configure_industry.py --apply --import-candidates
```

默认 apply 只允许 localhost/127.0.0.1 数据库。远程 apply 需要调用者明确添加 `--allow-remote`。脚本加载现有数据库连接环境，但不输出连接 URL 或凭据。

导入在单个事务与 advisory lock 下执行，校验注册表 checksum，并在 `seed_imports` 记录来源与候选两个独立导入标记。可以先启用来源，再用 `--import-candidates` 导入候选；重复运行保留后续编辑的撤回、驳回、发布状态和备注。既有同公司同 URL 的 XtalPi RSS 记录复用原 UUID，保留 etag 与未知配置。存在采集 lease、已驳回来源、身份冲突或运行能力缺失时整批回滚。

脚本实际只写 `raw_items` 与 `industry_candidates(status=pending)`，不写 `events`、`event_participants` 或关系表，不自动审核。注册表早期 `activation_contract` 的 “pending events” 用语在执行契约中指待审核候选队列，并不表示生成 events 行。

每个 curated raw 保存原始标题与最多 25 个英文单词的逐字短证据，原始 HTTP 观察、正文 SHA-256 和精确字符区间同时保留。`content_is_full_text=false`、`entire_article_retained=false` 明确说明没有保存完整文章；标题/短摘录不冒充全文，也不将来源身份核验视为科学结论认证。

新增 `official-html.js` 通过既有采集请求/record 回调执行，不建立额外网络入口。一次 checkpoint 获取 1 个索引页，之后每个 checkpoint 最多 1 篇允许路径的文章，索引最多保留 8 篇。优先 JSON-LD Article/NewsArticle/BlogPosting，正文选用显式容器，并移除脚本、导航、页眉页脚等噪音。缺失日期为 null，`dateModified` 与发布日期分开，日期级记录按 UTC 日期保存并保留原文。429 交给现有退避控制，不在 adapter 内重试。

## 验证结果与范围

- `node --test cloudflare/site/official-html.test.mjs`：8 项通过，覆盖域名/路径约束、脚本排除、无日期不伪造、发布日期/修改日期区分、Webflow 空容器、单页 checkpoint、损坏状态和 429 传播。
- 在 10 篇实际取得的官方 HTML 上执行同一 parser，核对原标题与发布日期；覆盖 Recursion、Isomorphic、Iambic、Owkin 四家。
- `.venv/bin/python -m pytest backend/tests/test_industry_sources.py -q`：16 项通过（5.19s）。使用 disposable PostgreSQL，覆盖完整原子导入、并发幂等、候选延后导入、既有 source 复用、驳回状态保留、错误整批回滚、runtime gate 与不生成 events/关系。
- 注册表 dry-run 验证通过，冻结 checksum 与上述值一致。

这些结果证明本机当次访问、解析与本地数据库导入行为。Cloudflare 实际出口、定时任务、长期可用性和公开事件发布由主任务另行验收，不能从此次 PASS 推断。
