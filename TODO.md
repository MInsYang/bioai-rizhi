# TODO · 实际状态（2026-10-08）

## 已完成实现与本地验证

- [x] 原站内统一首页、五主题新闻文章、产业进展、Hot、学术、公司黄页/详情、来源状态、关注、日报、MCP 与后台；复用问象 Logo。
- [x] 手机与 PC 自适应：手机全部栏目菜单、单/双列卡片、可换行筛选、44px 操作控件、长文弹窗和配置代码；PC 侧栏、多栏内容与矮屏侧栏滚动。
- [x] PostgreSQL 公司、别名、来源、原文、事件、证据、关系、任务、审计、日报；迁移 001–008 已在本地运行。
- [x] 两份原始种子库保持不变、幂等导入 130 实体；单独补充 Tahoe、HUB Organoids、Emulate 共 3 个实体。默认公司墙 131 个，包含历史实体时 133 个。
- [x] Tahoe / Vevo 更名原文证据；HUB 收购证据保留 Merck KGaA 全名，不错误关联 Merck & Co./MSD。HUB 在“包含历史实体”中展示。
- [x] Newsroom/IR/RSS/社交账号候选发现；后台验证、精确证据句定位、发布/撤回及明确关系录入。社交身份验证不代表帖子采集已经接入。
- [x] 新 Cloudflare Worker/Assets/API/MCP/Cron/Queues 实现与构建验证；每小时第 7 分钟派发，08:00 北京时间日报，小时任务补偿当日漏跑日报。
- [x] PostgreSQL 原子领取、2 分钟租约、单页检查点、分级退避、来源撤销隔离、查询版本校验、主机间隔；队列确认后才记录派发成功。
- [x] 五项只读 MCP 工具、参数与响应限制、来源引用、预印本/未知版本标识、跨来源 PMID/DOI 精确去重。
- [x] 主题 RSS、SSR 分享页、sitemap、robots、llms.txt、每日摘要入口和 MCP 接入文档。
- [x] 真实 E2E：首次补录 294 次处理全部完成，随后六个来源增量任务完成；报告为真实网络 + 本地 PostgreSQL + Worker 处理器，队列使用本地验收传输。
- [x] 不加载或发布旧静态新闻 JSON，不生成假新闻补空位；原文不会自动成为已核验事件或合作关系。
- [x] 61 项 JavaScript 全套检查通过、无跳过，33 项 Python 检查通过，包含未来刊期记录的实际 SQL 回归；360/390px 手机、1366×768 PC、1366×600 矮屏页面验证通过。

## 已上线并通过公网验证

- [x] 独立 Worker 已部署：[bioai-rizhi.328558608.workers.dev](https://bioai-rizhi.328558608.workers.dev)。真实 Queue `bioai-ingestion` 已创建，已注册 1 个 producer、1 个 consumer。
- [x] 正式版本 `3ab3ee44-c284-455e-8485-fa8fcc253edb` 已发布，仅保留 `7 * * * *`、`0 0 * * *` 两条 Cron；无分钟诊断任务。
- [x] Neon Free 独立项目已建立于 Singapore / `aws-ap-southeast-1`，PostgreSQL 17；真实本地数据库空库恢复成功，恢复时为 133 companies、4,669 raw_items、4,012 public_resources；迁移 001–008 校验和通过。
- [x] Worker secrets 与真实公开 origin 已配置；公网 health、config、HTML、公司/专题页、RSS、sitemap、llms、搜索入口均为 HTTP 200。
- [x] 匿名远程 MCP initialize、tools/list、工具调用通过；官方 `@modelcontextprotocol/client@2.0.0` 客户端使用 legacy/auto 两种协商模式真实公网 connect/listTools，各调用全部五项工具通过。[SDK 客户端验收](docs/mcp-client-acceptance.json) / [接入文档](docs/MCP.md)。
- [x] `/internal/dispatch` 与 `/internal/digest` 管理调用返回 HTTP 200；手动日报接口与小时补偿实现已验证，每日专用定时回调尚未跨日观察。
- [x] 公网管理员保存已通过 Neon WebSocket 事务验证：寻因公司原值保存，字段完全未变，审计记录成功写入。
- [x] 六条启动采集任务已由 Worker 送入真实 Queue；五个来源 `succeeded`。PubMed 经 13 次处理（含两次 HTTP 429）自动退避后完成，成功时 `failure_count` 归零；Tahoe 五次 HTTP 429 达到重试预算，本轮任务 `dead`，云端未成功，本地历史真实内容已保留。
- [x] 正式小时 Cron → Queue → 数据库完整链路通过：2026-10-08 08:07:43.981 UTC 真实 `7 * * * *` 回调，CPU 4 ms、墙钟 1,803 ms、`outcome=ok`；`scheduler_runs` 成功派发 5 个到期来源，Emulate/HUB/晶泰/Europe PMC/PubMed 五个新任务全部 `succeeded`、`failure_count=0`。
- [x] MCP 静态工具 Schema 缓存优化已部署；优化后 initialize、tools/list、search_resources、get_source_status 四次公网调用均 HTTP 200、`outcome=ok`，CPU 为 22/15/21/26 ms。
- [x] [公开 GitHub 仓库](https://github.com/MInsYang/bioai-rizhi) 默认分支为 `codex/bioai-resource-site`，初始 CI 全部通过；旧 Sites 站与 ResearchHub 保持独立。

## 运行验收与后续运维

- [ ] 排查 Tahoe 云端限流并独立验收恢复；本轮任务已 `dead`，后续来源轮询受 `next_poll_at` 与退避控制，不能写成当前仍在 retry 或已经成功。
- [ ] 跨日观察 `0 0 * * *` 每日 00:00 UTC（北京时间 08:00）专用回调及日报；小时原生回调链路已通过，手动接口与小时补偿实现不替代每日专用 tick 验收。
- [ ] 完成 CPU 与持续用量观察，按实际账户计划决定降载或取得授权后选择付费计划。优化后 MCP 四次调用为 22/15/21/26 ms、均 `outcome=ok`，仍高于 Workers Free 的名义 HTTP 10 ms；未执行付费升级。优化前公开 API 为 2–12 ms、MCP 冷初始化为 58 ms，Queue 单页为 15–19 ms；Queue 使用独立 consumer CPU 限制，短时样本不代表长期免费容量验收。
- [ ] 线上来源撤销、故障恢复及重复投递演练；本地验证不能代替这些检查。
- [ ] 安排受控云端日备份、异地保管与定期独立恢复演练；运行告警、限额监测、管理员多用户/SSO。
- [ ] 安装个人 Claude/Cursor/Codex 连接配置并保存应用界面调用记录；官方 SDK 客户端已实测，个人应用接入尚未安装。

部署、手动调用与持续运行证据统一见 [生产验收记录](docs/production-acceptance.json)，未完成项目按实际状态保留。

## 真实来源清单

以下来源保留已有真实网络与本地入库验收的范围限制。六条云端启动任务中五个来源成功；真实小时 Cron 后续派发的五个到期来源也全部成功、零失败。Tahoe 首轮五次 HTTP 429 达到预算、任务 `dead`，云端未成功；不能把五源小时任务通过扩展为全部六源通过。队列及定时证据另见生产验收记录。

| 来源 | 当前状态 | 覆盖限制 |
|---|---|---|
| PubMed / NCBI E-utilities | 首轮 HTTP 429 自动退避后 `succeeded`；真实小时 Cron 新任务 `succeeded`、零失败 | 公共索引，不是全文库，也不是同行评议认证 |
| Europe PMC | 真实 HTTP 200、分页与入库成功；真实小时 Cron 新任务 `succeeded`、零失败 | MED/PPR 主题检索；更新日期可带入较早发表文章 |
| 晶泰科技官方 RSS | 官网发现与历史完整抓取成功；既往增量 304 为正常无变更；真实小时 Cron 新任务 `succeeded`、零失败 | 仅订阅源提供的条目，且经过主题分类 |
| Tahoe 官方博客 RSS | 官方域名→Substack→博客证据链；本地 HTTP 200 与主题条目入库成功；云端五次 HTTP 429 后本轮任务 `dead`、未成功 | 本地历史真实内容已保留，验收订阅最近文章为 2026-03-16；后续轮询受 `next_poll_at`/退避控制，不假装每天有新文章 |
| HUB Organoids 官方新闻 RSS | HTTP 200 与主题条目入库成功；遵守 10 秒主机间隔；真实小时 Cron 新任务 `succeeded`、零失败 | 本次订阅最近文章为 2025-01-06；保留历史收购状态 |
| Emulate 官方 RSS | HTTP 200 与主题条目入库成功；遵守 10 秒主机间隔；真实小时 Cron 新任务 `succeeded`、零失败 | 实体器官芯片/类器官，不把所有业务标为 AI；最近文章 2026-06-11 |
| bioRxiv 直连 | **停用/降级**：历史真实分页遭 HTTP 500 | 已有适配代码仍不代表直连成功；Europe PMC 预印本为替代发现路径，覆盖不等同全量 bioRxiv |
| 其余公司官网/新闻室 | 大多只有种子登记或候选 | 未逐家完成发现、归属验证及采集适配；公司数不能当来源覆盖率 |
| X / LinkedIn / 微信公众号 / 微博 / YouTube | 账号归属验证功能存在 | **帖子数据源未接入**，不抓登录墙、不制造社交动态 |
| arXiv / medRxiv / Crossref / ClinicalTrials.gov / SEC EDGAR | 待适配和独立验收 | 公共接口存在或种子登记不等于接入成功 |
| 中国交易所 / NMPA / CDE / JS 新闻室 / PDF 公告 | 待专门适配 | 需逐来源确认范围、日期、分页、权限和真实结果 |

还有 129 条旧本地官网发现任务保留在数据库，其来源不属于云端启用清单，不会进入新的 Cloudflare 采集队列，也不计为云端来源成功。

## 后续能力与推广

- [ ] 自动提出候选事件及人审；完整事件跨来源合并、预印本版本链、药物/模型/数据集实体。
- [ ] 逐公司复核简介、品牌更名与并购生效日期，核实官方 Logo 使用来源。
- [ ] 真实用户测试、漏检反馈、客户端调用统计与来源覆盖质量检查。
- [ ] 邮件订阅、每周编辑摘要、跨设备收藏、团队空间、赞助或付费服务；本次只提供方案，没有发送推广消息或开通付费。
- [ ] 公网验收后再向 MCP 目录提交；源码公开、llms.txt 或 sitemap 均不保证流量/收录。

免费额度存在边界。按当前查询样本和每小时派发估算约 1,656 次 Queue 操作/日；10 分钟派发约 9,936，几乎没有重试余量。Neon 持续活跃、MCP 冷请求及全天实际用量仍需观察；目前没有跑满一天的证据，也不承诺永久免费。超限时先限流/暂停，不自动升级付费。
