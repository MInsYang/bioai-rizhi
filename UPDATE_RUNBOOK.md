# BioAI 日知更新与恢复手册

截至 2026-10-08，3.1 报纸版已部署到 [bioai-rizhi.pages.dev](https://bioai-rizhi.pages.dev)，Pages 通过 Service Binding 使用同一生产 Worker 与 Neon PostgreSQL。001–015 迁移已执行，134 个目录实体、132 个默认黄页实体；9 个本轮新增/核验产业源完成真实云端采集。09:07 UTC 原生小时 Cron 派发 14 个来源，14 个全部完成，Crossref 首次完整窗口于 10:06 UTC 完成；实时状态以数据库和 [报纸版验收](docs/newspaper-acceptance.json) 为准。

本轮新增 12 条带官方证据的行业事件和 6 条关系，明确标记代理辅助审核；默认学术、混合列表、RSS、日报与 MCP 只展示 17 个重点期刊中的 AI 生物医药相关内容。期刊政策见 `/api/journals`；历史非重点期刊/预印本仅通过显式历史筛选访问。Tahoe 旧 RSS 已停用云端调度，不能把历史本地成功当作当前云接通。

[短域名 MCP 验收](docs/mcp-shortdomain-acceptance.json) 完成真实协议与五项工具调用，个人 Codex 已配置，后续新会话生效；官方 Registry `3.1.0` 已发布并回读 active，见 [Registry 说明](docs/mcp-registry.md)。旧 [生产验收](docs/production-acceptance.json) 和 [SDK 验收](docs/mcp-client-acceptance.json) 保留为首次上线历史，不代表当前版本计数。每日专用 tick 仍需跨日观察；先前 MCP CPU 样本高于 Workers Free 名义 10ms，不承诺长期免费容量。

生产入口为 [cloudflare/site](cloudflare/site/)，同一 Worker 提供页面、API、RSS、日报和只读 MCP，并消费 Cloudflare Queue。旧 `refresh_all.py` 静态快照 heartbeat 已暂停；`cloudflare/dispatcher` 和 Python consumer 仅保留给独立自托管模式，不与新方案同时调度同一个数据库。ResearchHub 保持独立，不删除或替换。

## 时间、来源与状态

当前正式 Worker 同时提供以下两条 Cron，无分钟诊断任务。2026-10-08 09:07:17 UTC 的原生小时派发已在 `scheduler_runs` 与实际消费者入库结果中验证；任务成功和派发成功分别记录。最新 Worker 版本 ID、来源明细及计数见 [报纸版验收](docs/newspaper-acceptance.json)，每日专用 tick 尚未跨日观察。

- `7 * * * *`：每小时第 7 分钟派发到期采集任务；来源仍受 TTL、主机间隔和失败退避约束，并非每个来源每小时必抓。
- `0 0 * * *`：UTC 00:00，即北京时间 08:00，目标为生成当日日报；手动日报接口、小时补偿实现与两项独立 `waitUntil` 已验证，每日专用回调尚未跨日观察，不声称其已执行通过。
- 日报按此前 24 小时的**首次采集时间**选取最多 100 条聚焦资源，日期和记录 ID 固定，同日重跑不追加。小时补偿只处理当前北京日期，停机数日后不会自动补历史日报。
- 前端每 5 分钟尝试刷新，后台标签页或超过 2 分钟未交互时暂停。页面刷新不派发采集任务。

来源配置见 [学术政策配置](scripts/configure_focus.py)、[产业来源配置](scripts/configure_industry.py) 与 [实际来源清单](docs/bootstrap/bioai_industry_sources_v2.json)。PubMed、Europe PMC、Crossref 与已核验公司 RSS/限定 Newsroom HTML 为当前适配器；Crossref 完整回填状态单独检查。bioRxiv 直连停用，预印本不再通过默认精选入口推荐。来源核验、采集成功、主题命中和事件审核是不同门槛，不能相互代替。

`configure_focus.py --backfill` 会重新配置并启用核心来源，不应作为日常修复或恢复脚本反复运行，以免覆盖管理员停用决定。补充导入默认 dry-run，只有 `--apply` 写入；同一清单校验和只应用一次，保留后续管理员修改。

## 每日检查

在 Neon SQL Editor 对实际生产分支运行以下只读查询。`scheduler_runs.status='succeeded'` 表示本轮 Queue 发送均已确认，**不表示文章抓取或审核完成**；迁移 008 修正了发送前错误报成功的问题。

```sql
SELECT scheduled_at, trigger_kind, status, dispatched_count, dispatch_attempts,
       started_at, finished_at
FROM scheduler_runs ORDER BY scheduled_at DESC LIMIT 30;

SELECT s.id, s.name, s.enabled, s.verified, s.adapter,
       s.last_success_at, s.next_poll_at, s.consecutive_failures
FROM sources s WHERE s.config->>'cloud_runtime_enabled'='true'
ORDER BY s.last_success_at NULLS FIRST;

SELECT j.status, count(*) AS jobs, min(j.available_at) AS oldest_due
FROM ingestion_jobs j JOIN sources s ON s.id=j.source_id
WHERE s.config->>'cloud_runtime_enabled'='true'
GROUP BY j.status ORDER BY j.status;

SELECT digest_date, window_start, window_end, generated_at, total_records
FROM daily_digests ORDER BY digest_date DESC LIMIT 7;

SELECT (SELECT count(*) FROM raw_items) AS raw_items,
       (SELECT count(*) FROM public_resources) AS public_resources,
       pg_size_pretty(pg_database_size(current_database())) AS database_size;
```

旧本地发现模式留下的 `cloud_runtime_enabled=false` 或未设置该值的 queued 任务不属于云队列积压；不要把全库 queued 数量视为云端未完成任务。检查 Cloudflare Worker 错误和 CPU、Queues 积压/重试及 Neon 存储/CU 用量，特别关注连续缺失的小时 Cron、过期 running 租约、持续增长的 retry/dead 和北京时间 08:07 后仍缺失的当日日报。

HTTP 304 是有效检查成功；零新增也可能是重复数据、未变化或时间窗内没有匹配项。原文数量、去重后的聚焦资源、已审核新闻和公司数量是不同指标，不能补造内容来改善数字。日报读取重新应用来源门槛，撤销后可见条目可能少于固定的 `total_records`。

## 手动派发与日报补偿

下列命令从项目根目录执行，令牌从终端隐藏读取。只调用当前 Worker 的两个管理入口，不使用旧 HMAC 路由。手动调用仅证明管理接口可用，小时调度仍需观察 `trigger_kind='cron'`。

```sh
.venv/bin/python - <<'PY'
import getpass, json, urllib.error, urllib.request
from urllib.parse import urlsplit
origin = input('Worker HTTPS origin [https://bioai-rizhi.pages.dev]: ').strip().rstrip('/') or 'https://bioai-rizhi.pages.dev'
u = urlsplit(origin)
if u.scheme != 'https' or not u.hostname or u.username or u.password or u.path or u.query or u.fragment:
    raise SystemExit('需要不含路径和凭据的 HTTPS origin')
token = getpass.getpass('ADMIN_TOKEN: ')
if len(token) < 32:
    raise SystemExit('令牌至少 32 字符')
for path in ('/internal/dispatch', '/internal/digest'):
    request = urllib.request.Request(origin + path, method='POST',
        headers={'Authorization': 'Bearer ' + token})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            print(path, response.status, json.load(response))
    except urllib.error.HTTPError as error:
        raise SystemExit('管理请求 HTTP ' + str(error.code)) from None
    except urllib.error.URLError:
        raise SystemExit('管理请求连接失败') from None
PY
```

08:00 前日报返回 `not_due`。历史缺失日期先确认相应时间窗的数据已完整入库，再由数据库管理员在事务中调用 `generate_daily_digest()` 并传入该日北京时间 08:00 对应的带时区时间；已有日期不会被覆盖。不要删除快照以改变已发布日报的选择。

## 重试、幂等与来源撤销

队列采用 [至少一次投递](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)，重复消息由数据库状态、租约令牌和原文唯一约束处理。任务租约为 2 分钟；分页原文和 checkpoint 原子提交后再发送下一页，续页消息丢失可由后续小时派发恢复。每轮最多派发 100 个到期任务，恢复大量积压需要多轮。

有效分页不算失败；`attempts` 是领取次数，不能当作失败次数。实际失败按 `failure_count` 退避，通常从约 60 秒逐级增加至最多 1 小时，并带抖动；429/可重试 5xx 遵守有界 `Retry-After`。永久 4xx 或达到 5 次失败进入数据库 `dead`，来源冷却 6 小时；同一查询版本、未完成窗口可从 dead checkpoint 续抓。主机间隔读取来源的 `request_interval_seconds`，限制在 1–3600 秒。

首次云端验证中，PubMed 经 13 次处理（含两次 HTTP 429）自动退避后 `succeeded`，成功时 `failure_count` 归零；Tahoe 五次 HTTP 429 达到重试预算，本轮任务为 `dead`，云端采集未成功，本地历史真实内容已保留。后续来源轮询受 `next_poll_at` 与退避控制；按成功、重试和失败分别记录，不因出现 429 就重置任务或改写检查点。

Wrangler 的 Queue `max_retries=5` 是另一层传输预算；当前未配置 Cloudflare dead-letter queue，数据库 dead 任务也不是 Cloudflare DLQ。不要无限重投、清空 checkpoint 或重置 failure_count 掩盖持续故障。先检查来源权限、HTTP 状态、查询版本、主机频率和消费者日志，再决定恢复。

通过网站后台 `/#admin` 复核来源，或使用管理接口 `POST /api/admin/sources/{uuid}/review`：

```json
{
  "decision": "rejected",
  "method": "manual_review",
  "evidence_url": "https://official.example/evidence",
  "evidence_text": "替换为至少十个字符的真实撤销依据与日期说明",
  "enable_ingestion": false
}
```

此处 URL 是格式示例，必须换成实际证据。仅停采可保持 `decision='verified'`、`enable_ingestion=false`，历史资料继续公开；撤销公开资格使用 `pending` 或 `rejected` 并关闭采集。后台保存审核与审计，queued/retry 任务结束，正在抓取的页面提交前再次检查来源资格。公司官网变更会撤销其来源资格，需重新核验。

API/MCP 新读取即时应用数据库门槛；动态 HTML 与 RSS 设置 no-store。已下载的副本及搜索引擎缓存无法由数据库撤回。人工新闻下架将事件转回 pending，不删除原文与审计记录。

## 备份与灾难恢复

Neon 当前 Free 计划公布的即时恢复窗口为 6 小时，不能代替独立备份；以账户实际计划为准，参见 [Neon 官方说明](https://neon.com/blog/neon-free-plan-1-gb-per-project)。首次本地数据库到 Neon 空库的真实恢复及迁移校验和已通过。现已启用每日北京时间 09:23 的 GitHub Actions 加密备份，使用只读数据库角色、独立 PG17 恢复与同一 MVCC 快照计数核验，密文保留 7 天；首次真实云端运行已通过，见 [备份运维](docs/operations-backup.md) 和 [备份验收](docs/backup-acceptance-2026-10-08.json)。后续按日自动执行仍需持续观察。RPO 取决于最后验证的备份，不能承诺零数据丢失。

以下命令需 PostgreSQL 客户端在 PATH，`pg_dump` 主版本不得低于服务端。默认导出；恢复时先设置 `BIOAI_BACKUP_MODE=restore`，连接**新建的空数据库**，并输入备份路径。连接密码仅放入子进程环境，不进入命令参数或输出；`artifacts/` 和 `*.dump` 已在 Git 忽略中，备份仍需受控保存。

```sh
# 默认备份；恢复时先在当前 shell 执行 export BIOAI_BACKUP_MODE=restore。
.venv/bin/python - <<'PY'
import datetime, getpass, os, pathlib, subprocess, sys
from urllib.parse import unquote, urlsplit, parse_qs
import psycopg
mode = os.environ.get('BIOAI_BACKUP_MODE', 'backup')
if mode not in ('backup', 'restore'):
    raise SystemExit('模式必须是 backup 或 restore')
dsn = getpass.getpass('目标 PostgreSQL DATABASE_URL: ')
u = urlsplit(dsn)
if u.scheme not in ('postgres', 'postgresql') or not u.hostname or not u.path.strip('/'):
    raise SystemExit('需要 PostgreSQL 连接串')
env = os.environ.copy()
env.update(PGHOST=u.hostname, PGPORT=str(u.port or 5432),
    PGUSER=unquote(u.username or ''), PGPASSWORD=unquote(u.password or ''),
    PGDATABASE=unquote(u.path.lstrip('/')), PGCONNECT_TIMEOUT='15',
    PGSSLMODE=parse_qs(u.query).get('sslmode', ['require'])[0])
os.umask(0o077)
if mode == 'backup':
    directory = pathlib.Path('artifacts/backups')
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    target = directory / (datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '.dump')
    subprocess.run(['pg_dump', '--format=custom', '--no-owner', '--no-acl', '--file', str(target)], env=env, check=True)
    subprocess.run(['pg_restore', '--list', str(target)], stdout=subprocess.DEVNULL, check=True)
    print('备份目录可读:', target)
else:
    target = pathlib.Path(input('备份文件路径: ').strip())
    with psycopg.connect(dsn) as connection:
        count = connection.execute("SELECT count(*) FROM pg_tables WHERE schemaname='public'").fetchone()[0]
        if count:
            raise SystemExit('恢复目标 public schema 必须为空')
    subprocess.run(['pg_restore', '--exit-on-error', '--single-transaction', '--no-owner', '--no-acl',
        '--dbname', env['PGDATABASE'], str(target)], env=env, check=True)
    env['DATABASE_URL'] = dsn
    subprocess.run([sys.executable, 'scripts/manage.py', 'migrate'], env=env, check=True)
    print('恢复完成；仍需对照来源、数据与 checkpoint 验收')
PY
```

`pg_restore --list` 只检查归档目录可读，真正的恢复能力需在独立分支演练。恢复后核对迁移校验和、原文/公开资源计数、来源审核、事件证据、租约与 checkpoint；不要运行会重启来源的 `configure_focus.py`。

事故处理先暂停 BioAI 两条 Cron 和 Queue 投递，等待在途任务结束并暂停管理写入；只操作本站 Worker/Queue。在 `cloudflare/site` 执行：

```sh
npx --no-install wrangler queues pause-delivery bioai-ingestion
npx --no-install wrangler versions list --name bioai-rizhi
npx --no-install wrangler deployments list --name bioai-rizhi
# 将已核对兼容性的版本 ID 替换到下行；代码回滚不会回滚数据库。
npx --no-install wrangler rollback VERIFIED_VERSION_ID --name bioai-rizhi
```

数据库损坏时在新 Neon 分支恢复并验收，再按 [密钥写入步骤](docs/cloudflare-deployment.md#密钥与发布) 切换 Worker `DATABASE_URL`。不要对原库执行 `--clean` 或删除迁移；新版本使用追加迁移，保留原分支供回溯。验收后恢复两条 Cron，再执行 `wrangler queues resume-delivery bioai-ingestion`。暂停时间可能超过 Free Queue 的 24 小时保留期，数据库任务及后续派发负责恢复尚未完成的工作。

额度接近上限时优先停用非必要采集来源、暂停采集或调整已评估的频率；API 读取本身也会使用 Neon。按 [成本监控](docs/cloudflare-deployment.md#额度与成本验收) 决定恢复，未经授权不升级付费计划。
