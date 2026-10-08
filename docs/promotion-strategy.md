# BioAI 日知：价值与推广路径

BioAI 日知适合定位为“AI 生命科学的研究与产业来源导航”：把专题资源、原始出处、公司资料和可供个人 AI 查询的接口连起来。研究者能缩短查找论文、模型和数据的时间；研发与产业人员能沿公司和证据追踪进展；个人 AI 能读取结构化材料并给出带出处的回答。

这是一项产品判断，仍需通过实际用户问题与使用记录检验。当前收录量、来源覆盖和更新状态以数据库公开 API 为准。自动专题标签、PubMed 收录、编辑核验和同行评议属于不同事实，推广文案也应分别表述。

## 可借鉴的运营模式（2026-10-08 核查）

| 模式与实例 | 官方页面可确认的做法 | 本站可采用的部分 |
|---|---|---|
| 垂直媒体与订阅：Fierce Biotech | 提供专题新闻订阅，广告页面介绍网站、Newsletter、活动及社群触达 | 免费主题页与 RSS 积累固定读者，后续制作有编辑判断的周报；不要把数据库条目数当读者数 |
| AI 简报与赞助：The Rundown AI | 广告页面提供简报赞助及整期赞助方案 | 等读者和回访形成后再测试明确标注的赞助位；赞助不改变核验门槛或新闻排序 |
| 科学工作流接口：Benchling | 官方 MCP 说明允许其他客户端连接，并强调底层科学数据可追溯 | 以只读 MCP 让个人 AI 查询本站的公开资料，提高重复使用价值；本站没有 Benchling 的私有实验数据能力 |

依据：[Fierce Biotech 订阅](https://www.fiercebiotech.com/fiercebiotechcom/fb-newsletters)、[Fierce 广告合作](https://www.fiercebiotech.com/fiercelifesciencescom/advertise)、[The Rundown AI 赞助](https://www.therundown.ai/advertise-with-us)、[Benchling MCP 客户端说明](https://help.benchling.com/hc/en-us/articles/40342713479437-Configure-Benchling-s-MCP-Server-for-other-MCP-clients)、[Benchling 与 Anthropic 集成公告](https://www.benchling.com/blog/benchling-partners-with-anthropic-to-build-a-bridge-between-science-and-ai)。这些是可观察的产品模式，不是本站流量或收入预测。

建议先维持免费网页、RSS 与有限额只读 MCP，让用户完成实际检索任务；取得稳定使用反馈后，再考虑专题监测、团队收藏、定制产业简报或明确标注的品牌赞助。定价、支付、用户账号、邮件投递和对外广告销售均尚未实施。本轮先交付可被分享和调用的资源入口，不预设盈利数字。

## 值得优先做的入口

| 优先级 | 入口 | 对用户的价值 | 完成标准 |
|---|---|---|---|
| P0 | 五个专题页 | 一次进入虚拟细胞、类器官、虚拟胚胎、虚拟器官、AI 药物发现的相关资料 | 展示真实数量、出处、状态与覆盖限制；可直接分享 |
| P0 | 稳定的原文/事件/公司 URL | 从摘要进入来源，并把同一对象分享给同事或个人 AI | 直接打开有效内容；不存在或撤回的对象有正确状态 |
| P0 | 公开 MCP 与清楚的接入页 | 让已有个人 AI 工作流使用资源库 | Claude、Cursor、Codex 实际发现并调用工具；保留引用 |
| P0 | 每专题 RSS | 用户通过自己的阅读器持续获取新增材料 | 与网站/MCP 同门槛；来源记录与已核验事件标识清楚 |
| P1 | 可分享的每周摘要 | 减少追踪多个来源的重复工作 | 明确时间窗口与收录范围，每条摘要有原文链接 |
| P1 | 公司页与专题互链 | 找到相关公司、来源和发布记录 | 目录元数据、来源验证状态、历史品牌分别保留 |
| P1 | 简短的专题词表 | 解释查询范围并提高关键词检索可用性 | 中英文名称、常见别名、实体/AI 模型区别可读 |
| P2 | 订阅专题或公司更新 | 让用户按兴趣返回 | 在持续有内容、来源健康稳定后做用户订阅闭环 |

来源资源 RSS 入口为 `/feed.xml`，用 `/feed.xml?topic=organoid` 等专题 ID 订阅。每条输出标题、短摘、时间与原始链接。日摘要页面 `/digest/YYYY-MM-DD` 和 JSON `/api/digest?date=YYYY-MM-DD` 提供可以引用的日期入口；每周编辑摘要与公司定向订阅是后续建议，尚不据此声称已实现。待内容和发送渠道稳定后，再开展明确订阅的邮件服务。

摘要应写清“本周本站收录了哪些材料”，保留负结果与缺失：没有新条目、来源请求失败、没有已核验事件分别呈现。自动采集成功不代表材料已转为审核新闻；摘要也不补造空缺。

## 推广从能够完成的问题开始

第一阶段招募少量真实使用者，优先覆盖研究者、AI 生物学模型开发者和相关公司的研发/产业人员。每人用一个已有任务测试网站或 MCP，例如“找最近一个月虚拟细胞模型的论文与数据”“核对某公司的类器官平台及公开来源”“追踪 AI 药物发现公司的合作证据”。记录检索过程、缺失来源、引用是否可打开和完成时间。

第二阶段围绕已解决的问题制作短示例。示例包含提问、实际工具返回、引用与限制，用专题链接或公司链接承接。适合在领域社群、研究团队内部、开源项目讨论区及个人内容渠道发布；这些渠道是推广建议，本次没有代用户对外发消息或投稿。

第三阶段把接入成本压低：网站给出一页 MCP 地址、复制配置、3–5 个问题示例、来源状态和故障说明。Cursor 官方支持 MCP 安装 deeplink，可以在核对真实域名与完整配置后加“一键安装”；先测试客户端安装结果，再把按钮作为入口。见 [Cursor MCP install links](https://prod.cursor.com/docs/mcp/install-links)。

内容目录与 MCP 目录可以提供额外入口，但应在真实 HTTPS 服务、文档和客户端验收完成后提交。目录收录不是质量、流量或用户增长保证。优先维护来源覆盖和使用者能完成的任务，再扩张分发渠道。

## 搜索与 AI 可读内容

为 `/topics/{id}`、`/records/{id}`、`/events/{id}`、`/companies/{slug}` 提供能直接请求到的页面。公司当前的 hash 路由和原文弹窗不应承担全部搜索入口；普通 `<a href>`、独立 URL 和 History API 更容易让 Google 发现不同内容。见 [Google JavaScript SEO 官方文档](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)。

优先让服务器初始 HTML 包含标题、短摘要、原始链接和状态。页面应有独立 title、description、canonical URL，并把有效内容 URL 放入 sitemap。sitemap 帮助发现 URL，并不保证收录；`lastmod` 应来自实际内容修改，而非每次请求生成时间。见 [Google sitemap 指南](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)。

事件或原创摘要适合在满足页面实际内容的情况下使用 `Article` / `NewsArticle` 结构化数据；不要把数据库采集时间写成原始文章发布时间，也不要把外部论文的作者写成本站编辑。结构化数据用于帮助识别页面信息，不是排名或富结果保证。见 [Google Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article)。

可添加一个精简 `/llms.txt`，说明站点主题、来源/事件区别、公开 MCP 地址、专题入口和可读取 Markdown 页面。该文件是帮助代理找到材料的提案，不能保证 AI 检索、引用或流量；同时保留 robots.txt、sitemap 和网页内容。当前 v2 提案建议用链接引导代理读取需要的细节，而非把全部新闻堆进一个大文件。见 [llms.txt 原始提案](https://llmstxt.org/)。

Google 对 AI 搜索功能的官方建议仍围绕可爬取、可索引、对用户有用的内容与正常 SEO；本方案没有把添加 llms.txt 当作搜索增长承诺。见 [Google AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)。

## 证明价值的指标

| 要回答的问题 | 建议观察 | 解释边界 |
|---|---|---|
| 用户是否找到有用材料？ | 真实问题完成率、能打开的有效引用、漏检反馈 | 先用小批人工验收；页数不能替代完成率 |
| 内容是否被使用？ | 近 7/30 天页面浏览、匿名会话、专题 RSS 按钮与摘要访问 | 已接入管理员统计；无跨会话个人标识，不据此计算用户留存率 |
| MCP 是否确实被调用？ | 实际工具执行量、执行成功/错误比例、平均/P95 耗时 | 已接入；握手/工具发现不计执行，匿名调用数不等于独立用户数；传输拒绝与限流仍查运行日志 |
| 来源覆盖是否可靠？ | 按专题的有效来源与收录数量、采集成功时间、失败趋势 | 全站最近一次成功不能代表全部来源新鲜 |
| 内容是否保持可信？ | 有效出处比例、撤销来源后隐藏生效、预印本状态保持 | 来源确认和编辑核验不证明科学结论成立 |

初期不设没有基线的增长目标。先保存一组代表性真实问题，定期复查覆盖与引用，再根据使用反馈决定扩充来源、完善检索或增加订阅。MCP 工具调用可以增加分发渠道，但持续价值来自可追溯材料、领域整理和稳定更新。

3.2 已增加「管理工作台 → 访问与 MCP 统计」，提供今日/近 7 天/近 30 天数据、趋势和热门页面/来源/动作/工具。测试流量单列排除，统计起点前不补造访问。口径和隐私边界见 [analytics.md](analytics.md)。独立指南、实时本周收录、Google 验证与 IndexNow 的实际状态见 [search-growth.md](search-growth.md) 和 [搜索验收](search-acceptance.json)；可被发现不保证收录、推荐或增长。

## 推广文案

> BioAI 日知汇集 AI 虚拟细胞、类器官、虚拟胚胎、虚拟器官与 AI 药物发现的研究和产业资源，提供原始出处、公司目录与专题导航。通过公开只读 MCP，你的个人 AI 可以检索本站已收录的材料，并保留来源、日期和论文状态。

正式站点为 [BioAI 日知](https://bioai-rizhi.pages.dev)，公开源码为 [GitHub 仓库](https://github.com/MInsYang/bioai-rizhi)。推广时，更新频率、收录量和接入客户端只写已验证状态；接入步骤见 [MCP.md](MCP.md)。
