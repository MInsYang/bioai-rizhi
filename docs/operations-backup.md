# 自动备份、恢复演练与健康检查

`.github/workflows/operations.yml` 每天 UTC 01:23（北京时间 09:23）运行，也支持手动运行。GitHub 的定时任务可能延迟，且只在默认分支启用；这不是精确到分钟的故障告警服务。无需为此升级 Cloudflare 或 Neon 套餐。

## 凭证与权限

仓库配置两个 Actions secrets：

- `BIOAI_BACKUP_DATABASE_URL`：专用只读备份账号的 PostgreSQL 连接串。建议使用 Neon **direct** 端点；不复用网站管理账号或拥有者账号。
- `BIOAI_BACKUP_PASSPHRASE`：至少 40 字符、不含换行的随机口令。应另外保存在自己的密码管理器；只有密文、没有口令将无法恢复。

可配置 `BIOAI_SITE_ORIGIN` repository variable 指向当前网站。不要把口令、连接串或任何明文备份提交到 Git。公开仓库的 Actions artifact 可能被其他已登录用户下载，所以本流程只上传加密文件和脱敏报告。

以下权限由数据库拥有者配置一次。用交互式密码设置或安全的 secret 管理流程设置登录密码，不在 SQL 文件中保存密码：

```sql
CREATE ROLE bioai_backup LOGIN;
ALTER ROLE bioai_backup SET default_transaction_read_only = on;
GRANT CONNECT ON DATABASE bioai TO bioai_backup;
GRANT USAGE ON SCHEMA public TO bioai_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO bioai_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO bioai_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE bioai_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO bioai_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE bioai_owner IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO bioai_backup;
```

`bioai_owner` 必须对应实际创建迁移表的角色；其他角色创建的未来对象需要补充相应默认权限。备份角色没有写表、建表或角色管理权限。未来引入其他 schema、RLS 或大对象时，应重新审核备份权限和覆盖范围。

## 实际执行顺序

1. 检查公网 `/health`、最近成功的原生 Cron、启用来源的新鲜度、每日摘要。报告不会输出连接串或错误堆栈。小时调度超过 3 小时未成功、来源上次成功已超过 48 小时、北京时间 09:00 后仍缺当天摘要，均记为失败。尚无成功记录的启用来源单独列在 `no_success_sources`，记为 `sources_without_success_record`，仍使健康检查失败；它表示首次成功尚未确认，不表示已经等待超过 48 小时。`stale_sources` 与 `sources_stale_over_48h` 只用于确有成功时间且超过阈值的来源。单次来源错误单独记录为 warning。
2. 连接生产库开启 `REPEATABLE READ READ ONLY` 事务，导出 MVCC 快照，并读取核心表计数。`pg_dump --snapshot` 使用同一份快照。采集继续运行也不会导致源库与备份计数出现竞态。
3. 使用 PostgreSQL 17 `pg_dump` 生成完整 custom-format 备份，以 GnuPG AES-256 加密；口令通过标准输入传入，不作为命令行参数。
4. 解密到临时目录并校验文件 SHA-256；使用 PostgreSQL 17 `pg_restore --exit-on-error --single-transaction` 恢复到临时容器的专用空库。
5. 将恢复后的 8 张核心表计数与同一源快照严格比对。完整 `pg_restore` 同时必须成功。此检查没有逐行比较全部业务字段，也不等价于一次全站应用测试。
6. 仅上传 `bioai.dump.gpg`、`manifest.json` 和 `operations-health.json`，保留 7 天；明文临时目录随后删除。健康检查失败不会跳过备份：artifact 上传步骤之后才把健康异常转为工作流失败。备份或恢复演练失败也会使工作流失败。

核心计数表：`companies`、`sources`、`raw_items`、`events`、`event_evidence`、`relations`、`ingestion_jobs`、`schema_migrations`。备份本身包含有权限访问的完整数据库，计数检查范围仅为这些核心表。`manifest.json` 只有在加密往返校验、恢复和计数检查全部通过后才生成。

## 恢复边界

脚本不支持直接向生产库恢复。`RESTORE_DATABASE_URL` 只接受 `localhost` / `127.0.0.1`，数据库名必须为 `restored` 或 `bioai_restore_test`，必须显式提供专用用户和密码，不允许 query 参数覆盖连接地址，且目标库必须没有用户表、视图或序列。与源库相同的 loopback 地址与库名也会被拒绝。

CI 中 PostgreSQL 17 service 使用一次性演练凭证。`pg_restore` 在服务容器内执行，实际连接 `localhost:5432`，用户名、密码和数据库来自演练 URL；验证查询使用宿主机映射地址。源库只执行只读快照、计数查询及 `pg_dump`，不会执行恢复或写入命令。

真正发生灾难恢复时，应先从 artifact 下载密文，在隔离环境解密和验证，再单独制定数据库切换步骤。不要把本脚本的目标限制改为生产地址来直接覆盖数据。

## 验证状态的含义

提交工作流只表示配置完成。只有实际运行成功且 artifact 中存在 `restore_drill: passed` 的 manifest，才表示该次备份及恢复演练通过。部署记录应引用实际工作流 run 和脱敏 manifest；首次手动运行不能证明之后每天都会持续成功。建议在 GitHub 通知中启用此仓库 Actions 失败通知，并定期检查 artifact 是否仍持续生成。

### 使用统计数据

3.2.0 的 `usage_analytics_state`、`usage_web_events`、`usage_mcp_calls` 纳入相同的加密备份与隔离恢复计数核对。在线明细保留 90 天，每日任务清理；备份工件保留 7 天，因此已清理明细可能在加密备份中再保留最多 7 天。公开验收报告仅记录测试流量，不导出真实用户访问统计。

所有统计表的行数仍参与内部快照恢复对比，但不会写入公开 manifest 或 Actions 日志；仅输出 `analytics_tables_verified: true` 校验结果。
