# BioAI 日知 · 问象

聚焦 **AI 虚拟细胞、类器官、虚拟胚胎、虚拟器官、AI 药物发现** 的研究与产业资源站。新闻文章、公司黄页、学术进展、产业时间线、合作关系图和来源状态共用 PostgreSQL；保留问象原 Logo 和统一导航。

> **3.1 报纸版（2026-10-08）：** 首页聚焦 AI 生物制药行业动态；四个栏目进入原有看板。采用不带账号数字的 Cloudflare Pages 地址，后端仍为原 Worker、Queue 与 Neon。每小时检查新闻更新，学术默认筛选 17 种重点期刊，另有每日加密备份与独立恢复演练。完整验收与真实限制见 [本轮验收](docs/newspaper-acceptance.json) 和 [TODO](TODO.md)。

访问 [BioAI 日知](https://bioai-rizhi.pages.dev)，公开源码在 [MInsYang/bioai-rizhi](https://github.com/MInsYang/bioai-rizhi)，默认分支为 `codex/bioai-resource-site`。MCP 地址为 `https://bioai-rizhi.pages.dev/mcp`；当前验收与待观察项目见 [本轮验收](docs/newspaper-acceptance.json)。已登记到官方 MCP Registry，见 [接入与登记说明](docs/mcp-registry.md)。

## 能做什么

- 报纸式头版与四个栏目导读；行业消息、合作与布局优先，学术作为研究依据。
- 五个专题的真实原文检索、来源链接、发表/收录日期；学术默认 17 期刊白名单加 AI 相关性，历史预印本仅在明确选择全部存档后检索。
- 国内外公司目录、官网、中英文及历史别名；包括新格元、寻因、诺禾致源。地区依据所在地/布局，不推断内外资股权。
- 后台来源归属、社交账号验证、原文证据定位、事件复核和明确合作关系录入。Hot 图只显示附有证据的已发布关系。
- 正式配置仅保留**每小时第 7 分钟检查来源**、北京时间 **08:00 生成日报**，无分钟诊断任务；小时派发链路已实测通过，手动日报接口和小时补偿实现已验证，每日专用回调尚未跨日观察。网页在有人使用时每 **5 分钟**检查新数据，闲置两分钟后暂停。
- 公开只读 **MCP**，提供文章检索、文章详情、公司搜索、公司档案、来源状态五项工具；网站内有“连接你的 AI”页面。
- 按主题 RSS、可分享的文章/公司/专题页、日报、sitemap、结构化网页信息与 `llms.txt`；本机关注 JSON 导入/导出。
- 行业候选自动发现、证据复核后发布；每日 09:23 北京时间加密备份并在 GitHub 临时 PostgreSQL 17 恢复验证，保留 7 天。

类器官和器官芯片可能属于实体生物模型，不自动称为 AI。虚拟胚胎检索保留计算模型与实验胚胎模型的区别。原文收录、主题标签、来源验证、编辑核验和同行评议分别标识。

## 部署架构

```text
浏览器 / RSS / MCP 客户端
            ↓
Cloudflare Pages 短域名 → Service Binding → Worker + Static Assets
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
.venv/bin/python scripts/configure_industry.py --apply --import-candidates
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

当前使用 PubMed、Europe PMC、Crossref 精选期刊元数据，以及公司官方 RSS 和限定路径的 Newsroom HTML。首轮与本轮云端状态分别保留，详见 [期刊验证](docs/academic-quality-2026-10-08.md)、[行业来源审计](docs/industry-source-audit-2026-10-08.md) 和 [本轮验收](docs/newspaper-acceptance.json)。Tahoe 旧 RSS 的云端重试预算耗尽，现已停用云调度并保留历史真实原文；bioRxiv 直连仍停用。预印本不进入默认精选学术版。

`public_resources` 按明确的 PMID / DOI 去重已索引论文；不同预印本记录与原始版本信息仍保留。来源被撤销后，网站、RSS、日报和 MCP 的读取门槛同步生效。问象 Logo 见 [品牌资产记录](docs/brand-assets.md)。

## 验证

```sh
.venv/bin/python -m pytest backend/tests -q
node tests/test_ui.cjs
BIOAI_TEST_LOCAL=1 npm test --prefix cloudflare/site
npm run check --prefix cloudflare/site
```

GitHub Actions 使用独立 PostgreSQL 17 服务运行检查，不依赖生产凭据。单元测试使用模拟边界条件；端到端抓取调用真实上游并写入本地 PostgreSQL。Wrangler dry-run 只验证构建，不等于生产部署或免费 CPU 额度验收。

本轮 JavaScript、Python、UI 契约及真实生产验证结果见 [验收记录](docs/newspaper-acceptance.json)。Wrangler 构建、SDK 实测、Cloudflare 原生队列、跨日运行与费用样本分别报告，不能互相替代。个人 Codex 已配置短域名 MCP，其他客户端按接入文档配置。持续运行及长期免费容量仍需观察。

- [首次补录结果](docs/initial-cloud-ingestion-e2e.json) / [六来源增量结果](docs/cloud-ingestion-e2e.json)
- [MCP 接入说明](docs/MCP.md)
- [官方 MCP SDK 客户端验收](docs/mcp-client-acceptance.json)
- [生产验收记录](docs/production-acceptance.json)
- [资源站价值与推广建议](docs/promotion-strategy.md)
- [上线缺口与真实来源清单](TODO.md)
