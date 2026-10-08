# BioAI 日知的官方 MCP Registry 发布

仓库已准备 [server.json](../server.json) 和仅手动触发的 [publish-mcp.yml](../.github/workflows/publish-mcp.yml)。此次准备没有登录 Registry、调用 publish、推送 Git 或创建 Registry 条目。MCP 公网服务验收和 Registry 入库是不同的验证；服务可连接不能证明已进入目录。

| 字段 | 固定值 |
|---|---|
| Registry 名称 | `io.github.MInsYang/bioai-rizhi` |
| 元数据版本 | `3.1.0` |
| 网站 | `https://bioai-rizhi.pages.dev` |
| 远程 MCP | `https://bioai-rizhi.pages.dev/mcp` |
| 传输 | `streamable-http` |
| 公开仓库 | `https://github.com/MInsYang/bioai-rizhi` |
| 发布认证 | GitHub Actions OIDC，`id-token: write` |

`remotes` 是官方 server.json 支持的远程服务描述，本项目不发布 npm/PyPI 包，也不要求用户下载 CLI 来运行本站 MCP。Registry 的 GitHub namespace 通过 GitHub 身份证明；OIDC 使用运行仓库的 owner，因而 workflow 限定 `MInsYang/bioai-rizhi`，且只能从该仓库默认分支手动运行。官方文档说明 OIDC 不需要额外 dedicated secret。[server.json 格式](https://github.com/modelcontextprotocol/registry/blob/9cbf0b3e4c4b088fe580bcfdee9e58f8947d4384/docs/reference/server-json/generic-server-json.md)、[官方 GitHub Actions 发布指南](https://github.com/modelcontextprotocol/registry/blob/9cbf0b3e4c4b088fe580bcfdee9e58f8947d4384/docs/modelcontextprotocol-io/github-actions.mdx)。

## 当前验证记录

2026-10-08 09:06:16 UTC，向官方 `POST https://registry.modelcontextprotocol.io/v0.1/validate` 提交当前 server.json：HTTP 200，响应如下。

```json
{
  "valid": true,
  "issues": []
}
```

该文件的 SHA-256 为：

```text
2c83d8bdb3be23a7f161c105e689baa74ef544fce44554b52957cbe99e898c2e
```

这仅证明当次 manifest 的 schema 与语义校验通过，没有证明 namespace 已获授权、MCP 端点正常运行或版本已发布。API 某些无效输入会返回 HTTP 422，语义检查也可能以 HTTP 200 返回 `valid=false`；workflow 同时要求 HTTP 成功和 `.valid == true`，不会仅凭 200 发布。[官方 Registry API](https://github.com/modelcontextprotocol/registry/blob/9cbf0b3e4c4b088fe580bcfdee9e58f8947d4384/docs/reference/api/official-registry-api.md)、[验证处理器](https://github.com/modelcontextprotocol/registry/blob/9cbf0b3e4c4b088fe580bcfdee9e58f8947d4384/internal/api/handlers/v0/validate.go)。

2026-10-08 09:08:39 UTC，下载并核验的 Darwin arm64 官方 v1.8.1 CLI 执行 `mcp-publisher validate server.json`，退出码 0，返回 `server.json is valid`。workflow 的 YAML 解析、仅手动触发约束与 6 个 run 步骤的 Bash 语法检查通过；manifest guard 对当前文件通过，对错误 namespace 和额外 package 拒绝。未在 GitHub Actions 内执行 OIDC 或 publish，不能将上述检查写为发布成功。

## 固定 Publisher 与校验和

使用官方 `modelcontextprotocol/registry` 的 [v1.8.1 release](https://github.com/modelcontextprotocol/registry/releases/tag/v1.8.1)，发布于 2026-08-06；不使用 `releases/latest` 或未固定的安装脚本。以下 SHA-256 同时与官方 release API digest、[checksums 资产](https://github.com/modelcontextprotocol/registry/releases/download/v1.8.1/registry_1.8.1_checksums.txt) 一致，两个压缩包也已实际下载并校验。

| 资产 | 字节数 | SHA-256 |
|---|---:|---|
| `mcp-publisher_linux_amd64.tar.gz`（workflow） | 7,339,841 | `a06c9096dcb9727c13555b6be26c7effa707b01f06a4c561ba7a3635443cf2cc` |
| `mcp-publisher_darwin_arm64.tar.gz`（本机验证） | 7,015,989 | `e45e520892460732a4bdf37255576415d4a53ec171f8b913faf15bb1aef7cb77` |

workflow 在执行 CLI 前先校验压缩包，再只提取 `mcp-publisher` 文件。checkout 同样固定到官方 `actions/checkout` v5 的 commit `fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09`，关闭 Git 凭据保留。CLI 认证只在 `login` 接收 `--registry`；`publish server.json` 从认证 token 读取 Registry URL，不给 publish 传错参数。[官方 CLI 命令说明](https://github.com/modelcontextprotocol/registry/blob/9cbf0b3e4c4b088fe580bcfdee9e58f8947d4384/docs/reference/cli/commands.md)。

## 手动发布步骤

1. 由维护者把这三个发布文件纳入公开 release 导出，检查实际 MCP 部署与 `3.1.0` 发布说明一致。不要推送原工作区的敏感文件、运行目录或历史。
2. 在 `MInsYang/bioai-rizhi` 的 Actions 页面选择 **Publish BioAI 日知 to MCP Registry** → **Run workflow**，选择仓库默认分支（当前为 `codex/bioai-resource-site`）。只有手动触发，普通 push、tag、pull request 和定时任务都不会运行此发布。
3. 检查 workflow 的 manifest identity gate、官方 API/CLI validate、OIDC login、publish 和 Registry 回读全部成功。只有最后一步核对名称、版本、remote 和 `active` 状态成功后，才将 Registry 发布标记为完成。

发布后可读取的具体版本地址为：

```text
https://registry.modelcontextprotocol.io/v0.1/servers/io.github.MInsYang%2Fbioai-rizhi/versions/3.1.0
```

workflow 不设置发布 secret，不上传认证文件，不自动更改版本，不部署网站。并发发布串行执行；429、校验失败或认证失败会停止，不进行绕过或无限重试。结束时调用 CLI logout 清理运行器中的 Registry 登录。

元数据修改后应再次运行 validate。版本变更需要同时审查 server.json、workflow 的固定版本 guard、部署版本和发布说明。Registry 当前处于 preview，后续 API/schema 变化应依据官方文档和新版本实际验证，再明确更新固定 CLI 与 checksum；本次配置没有宣称未来版本永远兼容。
