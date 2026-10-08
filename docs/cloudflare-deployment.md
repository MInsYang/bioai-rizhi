# Cloudflare Worker 与 Neon 部署说明

截至 2026-10-08，独立 Worker 已上线至 [bioai-rizhi.328558608.workers.dev](https://bioai-rizhi.328558608.workers.dev)，真实 Queue `bioai-ingestion` 已创建并注册 1 个 producer、1 个 consumer。Neon Free 项目位于 Singapore / `aws-ap-southeast-1`，PostgreSQL 17；真实本地数据库恢复到空库成功，恢复时为 133 companies、4,669 raw_items、4,012 public_resources，迁移 001–008 校验和通过。公网读取、远程 MCP、手动管理接口及管理员 Neon WebSocket 事务已验证；正式小时 Cron → Queue → 数据库完整链路通过，五个到期来源的新任务全部成功、零失败。Tahoe 首轮五次 HTTP 429 达到预算、任务 `dead`，云端未成功，本地历史真实内容已保留；每日专用回调与长期运行仍需观察。

正式版本为 `3ab3ee44-c284-455e-8485-fa8fcc253edb`，仅保留 `7 * * * *`、`0 0 * * *` 两条 Cron，无分钟诊断任务。2026-10-08 08:07:43.981 UTC（北京时间 16:07）真实小时回调已触发，CPU 4 ms、墙钟 1,803 ms、`outcome=ok`；每日 00:00 UTC（北京时间 08:00）专用 tick 尚未跨日观察。

源码已公开在 [MInsYang/bioai-rizhi](https://github.com/MInsYang/bioai-rizhi)，默认分支 `codex/bioai-resource-site`，初始 CI 全部通过。本站与旧 Sites 站及 ResearchHub 保持独立。已完成和待观察的证据见 [生产验收记录](production-acceptance.json)，目前不声称已跑满一天或可永久免费运行。

[本地真实采集报告](cloud-ingestion-e2e.json) 使用本地 PostgreSQL、真实上游与同一 Worker 处理器，队列是进程内验收工具。它证明该组合的采集路径，不能证明 Cloudflare CPU、生产 Queue 投递、Cron 或 Neon 容量。源码和构建配置见 [cloudflare/site](../cloudflare/site/)，日常处理见 [运维手册](../UPDATE_RUNBOOK.md)。

## 组件与调度

| 配置 | 当前实现 |
| --- | --- |
| Worker | `bioai-rizhi`，`index.js`，`nodejs_compat` |
| 静态资源 | `ASSETS` 绑定 `dist/`；页面、API、MCP 和分享路由先进入 Worker |
| 数据库 | Neon Free，Singapore / `aws-ap-southeast-1`，PostgreSQL 17；`DATABASE_URL` secret，Worker 验证 `.neon.tech` 主机 |
| 采集 | `INGEST_QUEUE` → 已创建的 `bioai-ingestion`，1 producer / 1 consumer；每批 1 条、并发 1、传输重试上限 5 |
| Cron | 正式版本仅配置 `7 * * * *` 每小时到期派发、`0 0 * * *` 北京时间 08:00 日报；小时真实链路通过，每日专用 tick 尚未跨日观察 |
| 限流 | API 每 IP 每分钟 120 次；MCP 每 IP 每分钟 60 次，使用 Workers 绑定 |
| 管理 | `ADMIN_TOKEN` 至少 32 字符，Bearer 管理接口；公开 MCP 匿名只读 |

Cron 使用 UTC。小时任务同时独立尝试生成当日日报，补偿 08:00 调用失败；日报窗口、幂等性与来源撤销行为见 [运维手册](../UPDATE_RUNBOOK.md)。生产 Neon 不运行旧 Python consumer，也不同时部署旧 HMAC dispatcher。

## 本地安装与验证

从项目根目录执行，需 Node.js 24+、Python 3.12+、PostgreSQL 17。首次按 [.env.example](../.env.example) 创建本地 `.env`；已有文件保留，设置 loopback 数据库和管理员令牌。测试数据库账户需可创建独立测试库，测试拒绝远程 PostgreSQL。

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.lock
npm ci --prefix cloudflare/site
.venv/bin/python scripts/manage.py migrate
.venv/bin/python scripts/manage.py seed
.venv/bin/python scripts/configure_focus.py --dry-run
.venv/bin/python scripts/configure_focus.py --backfill
.venv/bin/python scripts/import_focus_supplement.py
.venv/bin/python scripts/import_focus_supplement.py --apply
node cloudflare/site/local.mjs
```

打开 `http://127.0.0.1:8788/`。本地入口注入本地 PostgreSQL，执行生产的 fetch/管理处理器；普通预览不消费队列，也不模拟定时器。停止预览后，可执行真实采集并运行检查：

```sh
node cloudflare/site/local.mjs --ingest
.venv/bin/python -m pytest backend/tests -q
node tests/test_ui.cjs
BIOAI_TEST_LOCAL=1 npm test --prefix cloudflare/site
npm run check --prefix cloudflare/site
```

仅在网络依赖已配置的环境代理时使用 `node --use-env-proxy cloudflare/site/local.mjs --ingest`。真实采集会写本地数据库并更新验收报告；测试使用独立本地测试库。`npm run check` 是 Wrangler 构建 dry-run，不部署、不测实际计费 CPU。补充来源导入默认只输出 dry-run，`--apply` 才写入；上述顺序先配置聚焦来源，再导入 [补充清单](bootstrap/bioai_focus_supplement_v1.json)。

当前 61 项 JavaScript 全套检查通过、无跳过，33 项 Python 检查通过，包含未来刊期记录的实际 SQL 回归；360/390px 手机、1366×768 PC、1366×600 矮屏页面验证通过。它们与公网、队列及定时验证分别记录。

## 账号、队列与 Neon 初始化

本站已完成授权、Queue 创建和 Neon 建库/恢复。以下是独立重建或账号维护步骤；已有生产库升级不要重新执行 seed 或来源启用脚本，同名 Queue 先核对，不重复创建。

在 `cloudflare/site` 确认账户，再发起当前授权；device 登录按提示在浏览器完成，不复用过期授权码。以下权限覆盖 Worker、日志及 Queue；这是独立于 Neon 的登录步骤。官方 CLI 说明见 [Wrangler 登录](https://developers.cloudflare.com/workers/wrangler/commands/general/)。

```sh
cd cloudflare/site
npx --no-install wrangler whoami
npx --no-install wrangler login --device --scopes account:read user:read workers:write workers_scripts:write workers_tail:read queues:write
npx --no-install wrangler whoami
npx --no-install wrangler queues list
# 仅当目标账户内不存在此 Queue 时创建；同名对象先核对归属。
npx --no-install wrangler queues create bioai-ingestion
npx --no-install wrangler queues info bioai-ingestion
```

创建 Queue 不等于注册消费者；消费者绑定由后续 Worker 部署创建。命令来源见 [Queues CLI](https://developers.cloudflare.com/workers/wrangler/commands/queues/)。多账户场景先在本站 Wrangler 配置中明确目标 `account_id`，避免使用 ResearchHub 资源。

登录 [Neon Console](https://console.neon.tech/)，新建本站独立项目、生产分支、数据库与角色，取得 PostgreSQL 连接串，保留 `sslmode=require`。管理迁移和备份优先使用直接连接；Worker 接受 Neon PostgreSQL 连接串，经 Neon HTTP 查询和需要事务时的 WebSocket 访问。生产 URI 不写入 `.env`、仓库或 shell 参数。

新建空库从根目录按下列顺序初始化，隐藏输入只传给子进程环境。当前迁移包含 001–008，迁移器持有 advisory lock 并检查已应用文件校验和；不编辑历史迁移。基础 seed 和来源清单用于新库初始化，**不会复制本地已采集原文**。若要迁移完整历史，先按 [备份恢复](../UPDATE_RUNBOOK.md#备份与灾难恢复) 恢复到空库，再追加缺失迁移，保留已审核来源决定。

```sh
.venv/bin/python - <<'PY'
import getpass, os, subprocess, sys
from urllib.parse import urlsplit
dsn = getpass.getpass('新 Neon DATABASE_URL: ')
u = urlsplit(dsn)
if u.scheme not in ('postgres', 'postgresql') or not (u.hostname or '').endswith('.neon.tech'):
    raise SystemExit('需要 Neon PostgreSQL 连接串')
env = os.environ.copy()
env['DATABASE_URL'] = dsn
steps = [
    ['scripts/manage.py', 'migrate'],
    ['scripts/manage.py', 'seed'],
    ['scripts/configure_focus.py', '--backfill'],
    ['scripts/import_focus_supplement.py'],
    ['scripts/import_focus_supplement.py', '--apply'],
]
for step in steps:
    subprocess.run([sys.executable, *step], env=env, check=True)
PY
```

`configure_focus.py` 是启用核心来源的有意操作，不在每次升级或恢复后重跑；`--backfill` 只补主题分类，不改写原文。清单身份核验和当日网络健康是不同证据，未接通的源保留停用/降级状态。

## 密钥与发布

在 `cloudflare/site` 写入两个 Cloudflare secrets。以下使用 `secret bulk` 的 JSON stdin，隐藏输入不进入命令参数、日志或临时文件；不要启用 shell trace 或 Wrangler debug 日志。官方说明见 [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)。

```sh
python3 - <<'PY'
import getpass, json, os, subprocess
from urllib.parse import urlsplit
dsn = getpass.getpass('Worker Neon DATABASE_URL: ')
u = urlsplit(dsn)
if u.scheme not in ('postgres', 'postgresql') or not (u.hostname or '').endswith('.neon.tech'):
    raise SystemExit('需要 Neon PostgreSQL 连接串')
token = getpass.getpass('ADMIN_TOKEN（至少 32 字符）: ')
if len(token) < 32:
    raise SystemExit('令牌过短')
env = os.environ.copy()
env['WRANGLER_LOG'] = 'info'
subprocess.run(['npx', '--no-install', 'wrangler', 'secret', 'bulk', '--name', 'bioai-rizhi'],
    input=json.dumps({'DATABASE_URL': dsn, 'ADMIN_TOKEN': token}).encode(), env=env, check=True)
PY
npm run check
npm run deploy
```

当前锁定的 Wrangler 4.148.0 在 Worker 不存在时可先创建空 Worker 以保存 secrets；该操作属于云端写入，**不表示站点已上线**。已有 Worker 更新 secrets 会影响运行版本，应按变更窗口执行。管理员令牌使用独立随机长值，只存入受控密码库。

当前生产公开变量在 [wrangler.toml](../cloudflare/site/wrangler.toml) 中持久保存。独立重建或域名变更时，核对目标部署后再更新：

```toml
[vars]
SITE_ORIGIN = "https://bioai-rizhi.328558608.workers.dev"
GITHUB_URL = "https://github.com/MInsYang/bioai-rizhi"
```

`SITE_ORIGIN` 不含路径、尾随斜线或凭据，用于规范链接、分享、RSS 和 MCP。普通部署以 Wrangler 配置为准，不把 Dashboard 手填的变量当作唯一记录；secrets 单独保留。本站不要求改 ResearchHub 域名或添加自定义域名。

```sh
npm run deploy
npx --no-install wrangler queues consumer worker list bioai-ingestion
npx --no-install wrangler queues info bioai-ingestion
npx --no-install wrangler deployments list --name bioai-rizhi
```

## 线上验收

验收使用实际部署 origin、目标 Neon 分支及真实 Queue；在 [生产验收记录](production-acceptance.json) 中记录实际 URL、Worker 版本、UTC 时间、目标数据库分支和以下结果，不记录密钥。

1. `/health` 返回数据库连通；`/api/config` 的 `mcp_url` 和 `/api/topics` 正确。页面、公司/主题/原文/事件链接及 404 行为均核对。
2. `/api/records?days=30&limit=5` 的原文链接、来源、预印本/索引状态和自动分类标签与数据库相符；未核验来源和 pending 事件不可见。
3. `/feed.xml`、`/sitemap.xml`、`/robots.txt`、`/llms.txt` 及分享页使用真实 origin；日报 JSON `/api/digest?date=YYYY-MM-DD` 和 `/digest/YYYY-MM-DD` 保留时间窗。
4. 按 [MCP 文档](MCP.md) 验证 initialize、tools/list 和只读 tools/call，并单独记录 SDK 客户端与个人应用连接结果。官方 SDK 验收见 [mcp-client-acceptance.json](mcp-client-acceptance.json)；Claude/Cursor/Codex 个人应用接入仍待安装和界面实测。
5. 区分管理 `/internal/dispatch` 与真实 `trigger_kind='cron'` 小时任务：小时原生回调、Queue 消费及数据库任务已通过；继续跨日观察北京时间 08:00 的每日专用 tick 与日报。手动调用或小时补偿实现不能替代每日专用回调验收。
6. 在独立验证分支演练重复消息、重试、来源撤销与恢复，核对公开门槛；线上观测 CPU、错误、队列积压和 Neon 用量后再确认所选计划能运行。

当前公网 health、config、HTML、公司/专题、RSS、sitemap、llms、搜索入口均返回 HTTP 200；远程 MCP initialize、tools/list 和只读 tools/call 通过，共发现五项工具；`/internal/dispatch`、`/internal/digest` 管理调用返回 HTTP 200。官方 `@modelcontextprotocol/client@2.0.0` 已用 legacy/auto 两种协商模式真实公网 connect/listTools，各调用全部五项工具通过；Claude/Cursor/Codex 个人应用接入尚未安装。管理员原值保存确认字段未变且审计已写入。真实 Queue 六条启动任务中五个来源 `succeeded`：PubMed 经 13 次处理（含两次 HTTP 429）自动退避后完成、`failure_count` 归零；Tahoe 五次 HTTP 429 达到预算、本轮任务 `dead`，云端未成功，后续轮询受来源 `next_poll_at` 与退避控制。

正式小时回调的数据库记录于 08:07:44.813 UTC 开始、08:07:45.836 UTC 完成，`scheduler_runs.status='succeeded'`、`dispatched_count=5`；随后 Emulate、HUB、晶泰、Europe PMC、PubMed 的新任务分别于 08:07:47、08:07:49、08:08:00、08:08:23、08:08:30 UTC 全部完成，`status='succeeded'`、`failure_count=0`。这轮原生小时 Cron → Queue → 数据库完整链路通过。

每日 `0 0 * * *`（北京时间 08:00）专用回调尚未跨日观察；手动日报接口和小时补偿实现已通过验证，不能据此宣称每日专用定时执行已验收。持续运行与长期免费容量仍需观测。

## 额度与成本验收

以下为 2026-10-08 核对的官方公开额度，账户实际计划和后台使用量优先。Cloudflare 部分配额按账户共享，需把 ResearchHub 等现有项目一起计入。

| 资源 | 官方额度与本站影响 |
| --- | --- |
| Workers Free | 每日 100,000 请求；HTTP 和 Cron 每次 **10 ms CPU**；网络等待不计 CPU。构建成功及本地耗时不能证明满足此限制。[官方限制](https://developers.cloudflare.com/workers/platform/limits/) |
| Workers Paid | 账户最低 $5/月，计费包含请求与 CPU；本站未执行付费升级。[官方价格](https://developers.cloudflare.com/workers/platform/pricing/) |
| Queues Free | 每日 10,000 operations，保留 24 小时；通常每条小消息写/读/删除共 3 次操作，重试和超过 64 KB 的消息增加计量。[官方价格](https://developers.cloudflare.com/queues/platform/pricing/) |
| Queue consumer | 默认每次 30 秒 CPU，可配置至 5 分钟 CPU；墙钟时限 15 分钟。Queue consumer 使用独立限制，不套用 HTTP/Cron Free 的 10 ms CPU；网络等待不计 CPU。[官方限制](https://developers.cloudflare.com/queues/platform/limits/) |
| Neon Free | 官方 2026-10-02 更新公布每项目 1 GB 存储、每月 100 CU-hours，即时恢复窗口 6 小时。[官方说明](https://neon.com/blog/neon-free-plan-1-gb-per-project) |

样本估算：三日重叠窗口中 Europe PMC 188 条约 8 页，PubMed 94 条约 1 次检索加 10 次正文批次，另有 4 个 RSS，合计约 23 条 Queue 消息/轮。若每条恰好 3 次操作，无重试，每小时约 **1,656 operations/日**；30 分钟约 3,312；10 分钟约 9,936，接近 Free 上限且没有合理重试空间。首次回填、上游增长、重复投递、不同 TTL 和错误重试均会改变这个估算。

Neon 即使持续仅 0.25 CU，30 天也约 180 CU-hours，超过 100 免费额度；每小时采集、页面/API/MCP 读取会影响休眠，不能承诺免费数据库全天活跃。前端空闲暂停有助于减少无意义访问，不能保证休眠或免费。

优化前 tail 样本中公开 API CPU 为 2–12 ms，MCP 冷初始化为 58 ms；真实 Queue 单页处理为 15–19 ms，结果均为 `outcome=ok`。Queue 样本按 Queue consumer 限制判断。MCP 静态工具 Schema 缓存优化已部署，优化后 initialize、tools/list、search_resources、get_source_status 四次公网调用均 HTTP 200、`outcome=ok`，CPU 为 22/15/21/26 ms；虽低于此前首次初始化 58 ms，仍高于 Workers Free 的名义 HTTP 10 ms。

服务元数据报告 `usage_model=standard`，未提供 `limits`；未执行付费升级。短时 `ok` 不证明后续均满足免费限制，尚未完成全天运行或长期免费容量验收。后续须结合目标账户计划和用量，继续优化或降载；如需要付费计划，取得明确授权后再选择和变更。

继续在 Cloudflare Observability 查看调用 CPU 和 `exceededCpu`/1102，分别测试首次 MCP 初始化、查询、XML 解析、队列消费与 Cron；本地 Node 冷启动耗时不是计费 CPU。同步检查 Queue operations/积压和 Neon CU-hours、存储、恢复窗口，先按一周实际用量估算全月，并设账户告警。若容量或 CPU 超出免费计划，暂停相关功能/采集并报告实际成本选项，未经授权不升级付费；不要宣称无限免费或已经完成线上性能验收。
