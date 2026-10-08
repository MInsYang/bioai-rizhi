# BioAI 日知公开 MCP

BioAI 日知提供匿名、只读的远程 MCP，供个人 AI 查询本站已收录的研究与产业原文、公司目录和来源覆盖情况。网页、RSS 与 MCP 使用同一公开读取模型：已验证来源的原文记录，与经过编辑审核并附有有效证据的事件保持区分。

公开服务已上线：[BioAI 日知](https://bioai-rizhi.328558608.workers.dev)。2026-10-08 已通过真实公网 initialize、tools/list 和只读 tools/call；官方 MCP SDK 客户端也已完成两种协商模式的连接、工具发现和全部五项工具调用，见 [SDK 客户端验收](mcp-client-acceptance.json)。Claude/Cursor/Codex 个人应用接入尚未安装，部署与待观察项目见 [生产验收记录](production-acceptance.json)。

## 接入地址与工具

- 传输：Streamable HTTP。
- 地址：`https://bioai-rizhi.328558608.workers.dev/mcp`，路径末尾没有斜杠。
- 认证：公开读取不要求登录或 API Key。
- 接入文档与内容入口使用普通 HTTPS 地址；MCP URL 供客户端连接，并非文章网页。

| 工具 | 用途 | 常用参数 |
|---|---|---|
| `search_resources` | 检索来源记录，包括研究摘要与产业原文 | `query`、`topic`、`academic`、`company`、`days`、`limit`、`offset` |
| `get_resource` | 读取一条来源记录或已发布事件及其出处 | `id`；`kind=record` 或 `kind=event` |
| `search_companies` | 检索公司目录 | `query`、`topic`、`track`、`region_group`、`history`、`limit`、`offset` |
| `get_company` | 读取公司资料、别名验证状态、公开来源与已发布事件 | `slug` |
| `get_source_status` | 查看公开来源的验证/采集状态和专题定义 | `query`、`company`、`limit`、`offset` |

专题 ID 为 `virtual-cell`、`organoid`、`virtual-embryo`、`virtual-organ`、`drug-discovery`。`get_source_status` 返回来自 `/api/topics` 的当前名称与说明。分类中的 `classification.method=automated_keyword_v1` 表示自动关键词导航分类；它不意味着编辑审核或完整学术领域覆盖。保留 `model_form`、`biological_model`、`ai_related` 和 `query_version`，区分实体模型与计算模型，并标明分类版本。

`search_resources` 的 `academic` 可选 `all`、`academic`、`industry`，默认 `all`；`days` 默认 30，`days=0` 检索全部已存日期。站点公开 API 默认返回主题范围内的资源。查询是存量关键词检索，不承诺语义检索或实时搜索整个互联网。

公司地区分类：`cn` 为中国大陆，`hk` 为中国香港，`global` 为海外，`cross` 为跨地区登记。公司属于目录元数据；`official_website` 字段与来源所有权验证状态分别保留，不能把目录收录当成来源验证证书。

## 配置个人 AI

### Codex

在终端执行：

```sh
codex mcp add bioaiRizhi --url https://bioai-rizhi.328558608.workers.dev/mcp
codex mcp list
```

也可以在 Codex 的 `~/.codex/config.toml` 中配置：

```toml
[mcp_servers.bioaiRizhi]
url = "https://bioai-rizhi.328558608.workers.dev/mcp"
```

Codex 支持 Streamable HTTP URL；公开服务不需要运行 OAuth 登录。CLI 和 IDE 扩展共用配置。可在 IDE 的 MCP servers 设置中添加 URL。这些方法依据 [OpenAI Docs MCP 文档](https://developers.openai.com/resources/docs-mcp) 和 [Codex MCP 配置文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)。

### Claude Code

```sh
claude mcp add --transport http bioaiRizhi --scope user https://bioai-rizhi.328558608.workers.dev/mcp
claude mcp get bioaiRizhi
```

`--scope user` 使这项个人工具可在多个项目中使用。Claude Code 的 JSON 配置需要显式 `type: "http"`；不应直接把只含 `url` 的 Cursor 配置当作 Claude Code 的 stdio 配置。见 [Claude Code 官方 MCP 文档](https://code.claude.com/docs/en/mcp)。

### Claude 网页和桌面版的远程连接器

进入 Claude 的 Customize → Connectors，添加 Custom → Web 连接器，填入 MCP 地址；本服务选择 `No sign in`。Team/Enterprise 的组织设置可能需要管理员先添加连接器。

远程连接来自 Anthropic 云端，服务必须在公网可达；用户电脑能访问本地地址并不意味着该连接器能访问它。这与 Claude Desktop 本地 stdio 配置是两个入口。见 [Claude 官方远程 MCP 连接器说明](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)。

### Cursor

把下面配置加入个人 `~/.cursor/mcp.json` 或项目 `.cursor/mcp.json`，保存后按客户端提示重新加载：

```json
{
  "mcpServers": {
    "bioaiRizhi": {
      "url": "https://bioai-rizhi.328558608.workers.dev/mcp"
    }
  }
}
```

Cursor 的项目配置与个人配置会合并；同名项由项目配置优先。传输从 URL 配置推断。见 [Cursor 官方 MCP 配置文档](https://prod.cursor.com/help/customization/mcp)。

### ChatGPT 的接入范围

本地 Codex 配置不会自动给 ChatGPT 网页安装工具。ChatGPT Work 使用已安装插件提供的连接器与远程工具；组织策略也可能控制可用工具。见 [OpenAI 官方 MCP 使用说明](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)。

当前工具名针对普通 MCP 客户端；没有实现 ChatGPT company knowledge / 特定检索集成所要求的标准 `search(query)` 与 `fetch(id)` 组合。因此不宣称已经适配该专用检索入口。需要这条渠道时，应再增加符合规定输入输出形状的适配层，而不是仅重命名工具。规范见 [OpenAI MCP 检索集成文档](https://developers.openai.com/api/docs/mcp)。

## 可以直接提问

- “查询最近 30 天 AI 虚拟细胞的论文与原文。保留 DOI、是否预印本、原文链接，并说明本站覆盖限制。”
- “按类器官专题找公司，区分实体类器官平台与 AI 模型；只把有明确资料的公司列出来。”
- “检索 AI 虚拟胚胎与虚拟器官研究，指出自动分类和原始来源分别提供了什么证据。”
- “查询 AI 药物发现公司近况；目录资料、来源原文和已核验事件分别说明。”
- “先查看来源采集状态，再解释这一周没有新结果意味着什么。”

例如主题检索参数为：

```json
{
  "topic": "virtual-cell",
  "academic": "academic",
  "days": 30,
  "limit": 20
}
```

`search_resources` 返回 `{total, items, limit, offset, coverage_note}`，每项保留 `id`、`url`、`site_url`、发表/收录时间、来源名称、专题、学术状态和分类方法。`get_resource` 的原文最多 6000 个 JavaScript 字符，并提供 `content_truncated` 和 `content_char_count`；读取原文完整版应使用原始来源 URL。

PubMed `indexed` 表示收录状态，不能替换为“已通过同行评议”。bioRxiv 的 `preprint` 与版本保留。原文数量不等于已核验新闻数量；空结果只描述本站当前收录情况。

来源状态中的 `verified` 表示来源确认，`enabled` 表示采集许可，`cloud_runtime_enabled` 表示云端采集是否启用；缺少字段时返回 null，不能当作 false 或零。`adapter`、`last_success_at`、`next_poll_at`、`consecutive_failures` 和 `ttl_hours` 用于解释覆盖与新鲜度。最新一次成功采集时间不能证明每条原文刚刚更新。

## 服务边界与运维

MCP 代码位于 [mcp.js](../cloudflare/site/mcp.js)，由父 Worker 的 `/mcp` 路由调用：

```js
return handleMcp(request, env, ctx, (path, params) => apiRead(path, params, sql));
```

回调只读取 `/api/records`、`/api/records/{uuid}`、`/api/events/{uuid}`、`/api/companies`、`/api/companies/{slug}`、`/api/sources` 和 `/api/topics`。不传入后台、内部派发、任意 SQL 或任意 URL 获取能力。数据库公开视图负责发布门槛，MCP 再按白名单投影返回字段，排除配置、令牌、原始 payload 和内部错误信息。

| 配置或限制 | 当前实现 |
|---|---|
| `SITE_ORIGIN` | `https://bioai-rizhi.328558608.workers.dev`，不含末尾 `/` |
| `MCP_ALLOWED_ORIGINS` | 可选的逗号分隔浏览器 origin 白名单；默认只允许站点本身 |
| `MCP_RATE_LIMITER` | 可选 Cloudflare Rate Limiting binding；超限返回 429 与重试时间 |
| 原生/云端客户端 | 不带 `Origin` 的请求允许；不要求额外登录 |
| 请求体 | UTF-8、单个 JSON-RPC 对象，最大 64 KiB；拒绝批量数组 |
| 查询 | 最多 200 字符；每页最多 40 项；offset 最大 10000 |
| 读取等待 | 10 秒；数据库/Neon 查询还需独立设置实际查询与网络超时 |
| 返回值 | 结构化内容和 JSON 文本；单份结果最大 256 KiB |
| 缓存 | MCP 返回 `Cache-Control: no-store`，来源撤销须继续由公开模型即时生效 |

允许匿名访问的是已公开的信息。工具声明只读、幂等、非破坏性；因为查询被限制在本站存量集合且不接受任意外部 URL，`openWorldHint` 为 false。工具调用不触发来源发现、采集、发布、后台改动或向他人发送信息。

实现使用 `agents@0.27.0`、`@modelcontextprotocol/server@2.0.0`、`zod@4.6.5`。2026-10-08 从 npm 核对，Agents 这一版本对 MCP v2 server/client 声明 2.0.0 的精确 peer 依赖；虽然 server 的 latest 为 2.3.1，本次采用满足声明的版本组合，不使用强制 peer 覆盖。锁定版本由站点 `package-lock.json` 保存。

Cloudflare 当前推荐 `createMcpHandler` 的每请求服务器工厂，接受 2026-07-28 以及兼容的 2025 无状态请求；`McpAgent` 是旧服务迁移路径。本实现使用 `legacy: "stateless"` 和 `responseMode: "auto"`，没有持久协议 session，也没有 GET 订阅流。Worker 开启 `nodejs_compat`，供该 handler 的 `node:async_hooks` 使用。见 [Cloudflare handler API](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/)。

2026-07-28 请求把协议与能力放在 `_meta` 中，不依赖 `initialize`；其 HTTP 协议、方法和工具名 header 必须与正文一致。较旧客户端可以继续使用 `initialize`。协议校验交给官方 SDK，测试覆盖两个版本范围。协议原文见 [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)。

## 验证

```sh
# 从仓库根目录执行
cd cloudflare/site
node --test mcp.test.mjs
```

测试使用真实已安装 SDK 与伪造的公开读取回调，检查初始化、发现、工具调用、2026 header 校验、非法工具/参数、Origin/Host、大小限制、文本截断、预印本/分类来源、错误与内部字段隔离。它验证协议和边界，不替代生产数据库、来源实际采集或客户端界面验收。

MCP 静态工具 Schema 缓存优化已部署；站点 61 项 JavaScript 全套检查通过、无跳过。公开数据响应使用表列 `no-store`。优化后 initialize、tools/list、search_resources、get_source_status 四次公网调用均 HTTP 200、`outcome=ok`，CPU 为 22/15/21/26 ms，仍高于 Workers Free 的名义 HTTP 10 ms。长期免费容量尚未验收，仍需观察和按授权选择运行计划；本次未执行付费升级。详情见 [Cloudflare 部署说明](cloudflare-deployment.md#额度与成本验收)。

官方 `@modelcontextprotocol/client@2.0.0` 已用 `versionNegotiation: {mode: "legacy"}` 和 `{mode: "auto"}` 分别真实公网 connect/listTools，两种模式均发现并调用全部五项工具通过。结果、版本与时间记录在 [mcp-client-acceptance.json](mcp-client-acceptance.json)。

Claude/Cursor/Codex 个人应用接入尚未安装；后续需用 [MCP Inspector](https://github.com/modelcontextprotocol/inspector) 和实际个人应用分别保存工具发现与读取记录。地址可以打开、代码 dry-run 成功或配置写入成功，都不足以单独证明个人应用已调用数据。

## 分享与订阅

可分享的内容地址分别为 `/records/{id}`、`/events/{id}`、`/companies/{slug}`、`/topics/{id}`，避免只分享弹窗状态。`url` 指向原始出处，`site_url` 指向本站上下文，两者同时保留。

来源资源 RSS 位于 `/feed.xml`，专题订阅可用 `/feed.xml?topic=virtual-cell` 等五个已知专题 ID。日摘要页面为 `/digest/YYYY-MM-DD`，对应结构化数据为 `/api/digest?date=YYYY-MM-DD`。它们沿用网站的公开读取门槛；原文资源与已核验事件仍分别表述。

正式版本仅保留每小时第 7 分钟派发、北京时间 08:00 日报两条 Cron，无分钟诊断任务。2026-10-08 08:07:43.981 UTC（北京时间 16:07）真实小时 Cron → Queue → 数据库完整链路通过，五个到期来源的新任务全部成功、零失败。每日 00:00 UTC（北京时间 08:00）专用 tick 尚未跨日观察；手动日报接口和小时补偿实现已验证，不替代每日专用回调验收。

本轮云端五个来源成功，Tahoe 五次 HTTP 429 达到预算、本轮任务 `dead`，云端未成功；此前本地历史真实内容已保留，后续轮询受来源 `next_poll_at` 与退避控制。来源 TTL 与失败退避会影响收录时间，查询存量数据不触发采集。页面每 5 分钟检查可见更新。运行证据以生产验收记录和成功采集时间为准，不能仅从计划推断。推广入口与衡量方法见 [promotion-strategy.md](promotion-strategy.md)。
