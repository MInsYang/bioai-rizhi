# BioAI 日知 · 问象

聚焦 **AI 虚拟细胞、类器官、虚拟胚胎、虚拟器官、AI 药物发现** 的研究与产业资源站。新闻文章、公司黄页、学术进展、产业时间线、合作关系图和来源状态共用 PostgreSQL；保留问象原 Logo 和统一导航。

> **发布状态（2026-10-08）：Cloudflare Worker 与 Neon PostgreSQL 已上线，正式小时 Cron → Queue → 数据库完整链路通过，公网读取及远程 MCP 已验证。** 08:07:43.981 UTC（北京时间 16:07）真实小时回调派发五个到期来源，五个新任务全部成功、零失败。每日 00:00 UTC（北京时间 08:00）专用回调尚未跨日观察；Tahoe 首轮五次 HTTP 429 后任务为 `dead`，云端未成功。旧 Sites 站与 ResearchHub 保持独立。

访问 [BioAI 日知](https://bioai-rizhi.328558608.workers.dev)，公开源码在 [MInsYang/bioai-rizhi](https://github.com/MInsYang/bioai-rizhi)，默认分支为 `codex/bioai-resource-site`。MCP 地址为 `https://bioai-rizhi.328558608.workers.dev/mcp`；上线记录与待观察项目见 [生产验收记录](docs/production-acceptance.json)。

## 能做什么

- 五个专题的真实原文检索、来源链接、发表/收录日期、预印本标记与自动分类说明。
- 国内外公司目录、官网、中英文及历史别名；包括新格元、寻因、诺禾致源。地区依据所在地/布局，不推断内外资股权。
- 后台来源归属、社交账号验证、原文证据定位、事件复核和明确合作关系录入。Hot 图只显示附有证据的已发布关系。
- 正式配置仅保留**每小时第 7 分钟检查来源**、北京时间 **08:00 生成日报**，无分钟诊断任务；小时派发链路已实测通过，手动日报接口和小时补偿实现已验证，每日专用回调尚未跨日观察。网页在有人使用时每 **5 分钟**检查新数据，闲置两分钟后暂停。
- 公开只读 **MCP**，提供文章检索、文章详情、公司搜索、公司档案、来源状态五项工具；网站内有“连接你的 AI”页面。
- 按主题 RSS、可分享的文章/公司/专题页、日报、sitemap、结构化网页信息与 `llms.txt`。

类器官和器官芯片可能属于实体生物模型，不自动称为 AI。虚拟胚胎检索保留计算模型与实验胚胎模型的区别。原文收录、主题标签、来源验证、编辑核验和同行评议分别标识。

## 部署架构

```text
浏览器 / RSS / MCP 客户端
            ↓
Cloudflare Worker + Static Assets
            ↓
Neon PostgreSQL（公司、来源、原文、证据、事件、任务）
            ↑
Cron → Cloudflare Queue → 单页采集 → 保存检查点
```

数据库任务带租约令牌、主机限流、失败退避、重复记录去重及来源撤销检查。队列丢失的到期任务可由下一轮派发恢复。采集适配器采用来源域名白名单、响应大小和超时限制；公司主页发现仍可通过本地 Python 工具运行。

Cloudflare 免费账户并非只能有一个网站，无需为本项目删除 ResearchHub。免费配额、上线步骤、成本与生产验收见 [Cloudflare 部署说明](docs/cloudflare-deployment.md) 和 [运维手册](UPDATE_RUNBOOK.md)。不保证任意流量和内容规模都能免费运行。

## 本地运行

需要 Node.js 24+、Python 3.12+、PostgreSQL 17。测试账号需能创建独立测试数据库；测试拒绝远程数据库。

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.lock
npm ci --prefix cloudflare/site
cp .env.example .env
# 设置本地 DATABASE_URL 和至少 32 字符的 ADMIN_TOKEN
.venv/bin/python scripts/manage.py migrate
.venv/bin/python scripts/manage.py seed
.venv/bin/python scripts/configure_focus.py --backfill
.venv/bin/python scripts/import_focus_supplement.py --apply
node cloudflare/site/local.mjs
```

打开 `http://127.0.0.1:8788/`。后台位于 `/#admin`；管理员令牌仅保存在页面内存。`local.mjs` 使用真实 Worker 处理器和本地 PostgreSQL，其内存队列仅用于验收，**不是生产调度器**。

真实网络采集验收：

```sh
node cloudflare/site/local.mjs --ingest
```

若网络必须经过已配置的环境代理，Node 24+ 可加 `--use-env-proxy`。结果写入 `docs/cloud-ingestion-e2e.json`。抓取内容进入原文库，不能自动成为已核验新闻。不要同时启动旧 Python worker 和新的云端 consumer。

可选的 FastAPI 自托管模式保留在 `backend/`、`deploy/`，旧 HMAC 派发器保留在 `cloudflare/dispatcher/`；新云端方案使用 `cloudflare/site/`，不同时部署两套定时器。

## 数据与来源

原始任务书和两份不可替代的种子文件位于 [docs/bootstrap](docs/bootstrap/)；基础种子有 130 个实体。补充目录单独保存核验证据，原始种子文件保持不变。公司登记数量不等于已接入来源数量。

上线时将真实本地数据库恢复到新建的 Neon Free 项目（Singapore / `aws-ap-southeast-1`，PostgreSQL 17）空库：133 家公司、4,669 条 `raw_items`、4,012 条 `public_resources`；迁移 001–008 校验和核对通过。这是恢复验收时的计数，后续采集可能改变条数。

本地已完成真实网络验证的来源：PubMed、Europe PMC、晶泰科技、Tahoe、HUB Organoids、Emulate 官方 RSS（共 6 个来源）。云端首轮五个来源成功，随后真实小时 Cron 派发的五个到期来源任务也全部成功、零失败；Tahoe 首轮遭五次 HTTP 429、任务 `dead`，此前本地采集的真实历史内容已保留，后续轮询受来源 `next_poll_at` 与退避控制。Europe PMC 可发现预印本；**bioRxiv 直连接口此前返回 HTTP 500，当前停用并明确标注降级**。其余公司、社交平台和新闻室的状态逐项见 [TODO](TODO.md)，不会用静态新闻填补。

`public_resources` 按明确的 PMID / DOI 去重已索引论文；不同预印本记录与原始版本信息仍保留。来源被撤销后，网站、RSS、日报和 MCP 的读取门槛同步生效。问象 Logo 见 [品牌资产记录](docs/brand-assets.md)。

## 验证

```sh
.venv/bin/python -m pytest backend/tests -q
node tests/test_ui.cjs
BIOAI_TEST_LOCAL=1 npm test --prefix cloudflare/site
npm run check --prefix cloudflare/site
```

GitHub Actions 使用独立 PostgreSQL 17 服务运行检查，不依赖生产凭据。单元测试使用模拟边界条件；端到端抓取调用真实上游并写入本地 PostgreSQL。Wrangler dry-run 只验证构建，不等于生产部署或免费 CPU 额度验收。

当前 61 项 JavaScript 全套检查通过、无跳过，33 项 Python 检查通过，包含未来刊期记录的实际 SQL 回归；MCP 静态工具 Schema 缓存优化已部署，公开仓库初始 CI 全部通过。公网 health、config、页面、公司/专题、RSS、sitemap、llms 和搜索入口均返回 HTTP 200；官方 MCP SDK 客户端已用 legacy/auto 两种协商模式连接公网、发现并调用全部五项工具，Claude/Cursor/Codex 个人应用接入尚未安装。优化后四次 MCP 调用 CPU 为 22/15/21/26 ms、均 `outcome=ok`，仍高于 Workers Free 的名义 HTTP 10 ms，后续需观察并按授权选择运行计划。360/390px 手机、1366×768 PC 与 1366×600 矮屏已完成页面验证。小时回调链路通过；每日专用回调、持续运行与长期免费容量仍需观察。

- [首次补录结果](docs/initial-cloud-ingestion-e2e.json) / [六来源增量结果](docs/cloud-ingestion-e2e.json)
- [MCP 接入说明](docs/MCP.md)
- [官方 MCP SDK 客户端验收](docs/mcp-client-acceptance.json)
- [生产验收记录](docs/production-acceptance.json)
- [资源站价值与推广建议](docs/promotion-strategy.md)
- [上线缺口与真实来源清单](TODO.md)
