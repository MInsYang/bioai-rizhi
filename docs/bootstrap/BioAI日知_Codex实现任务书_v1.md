# BioAI日知：Codex实现任务书 v1

> 生成日期：2026-09-14  
> 公司种子库：130 家（测序与多组学 40、AI与模型数据 47、生物医药 43）

## 1. 产品定位

BioAI日知不是普通新闻聚合站，而是面向生物技术、AI for Science、生物医药从业者的**可追溯行业事件数据库**。首页以时间推进，Hot图以关系推进，公司黄页以实体推进，学术进展以论文与技术路线推进。

核心对象不是“文章”，而是：

- 公司、研究机构、投资机构、人物；
- 药物、靶点、模型、数据集、测序平台、临床试验；
- 融资、合作、授权、并购、临床、监管、产品、论文等事件；
- 事件之间的证据、版本与来源链。

## 2. 前台信息架构

### 2.1 首页：四条可切换的进展树

顶部使用统一日期尺，默认显示最近30天，可切换7天、90天、1年和自定义区间。

1. **测序与多组学 Timeline**：测序仪、单细胞、空间组学、蛋白组、精准检测、平台发布与商业合作。
2. **生物医药 Timeline**：药物授权、并购、融资、临床节点、监管批准、适应证扩展和产能布局。
3. **AI与模型数据 Timeline**：基础模型、数据集、算力平台、自动化实验室、AI制药合作、模型开放与融资。
4. **学术进展 Timeline**：PubMed、bioRxiv、medRxiv及精选论文；可与前三条叠加，并按公司/技术/疾病关联。

每张事件卡至少显示：事件类型、发生日期、发布日期、主体、对象、金额/阶段（如有）、80字摘要、来源等级、原文入口、证据数量、是否预印本、是否待复核。

### 2.2 Hot图

Hot图不是词云，而是时间可筛选的事件关系图。

- 节点：公司、机构、药物、靶点、模型、数据集、投资方。
- 边：投资、合作、授权、收购、共同开发、平台采用、共同发表、临床申办等。
- 边必须来自结构化事件；禁止只因两家公司在同一篇文章中出现就自动建立合作关系。
- 默认提供7/30/90天三个窗口，并可按赛道、事件类型、地区和来源可信度过滤。
- 点击边后打开右侧证据抽屉，显示原始事件卡、证据句和来源。

推荐热度分数：

```text
hot_score = relation_weight
          * source_confidence
          * log(1 + evidence_count)
          * exp(-age_days / half_life_days)
```

### 2.3 学术界进展

论文不只按发布日期排列，还要与公司、模型、技术、靶点和疾病实体连接。

- PubMed/期刊论文：显示同行评议标识。
- bioRxiv/medRxiv：显示预印本标识和版本号。
- 预印本正式发表后：把preprint DOI与journal DOI组成版本链，而不是生成两条互不相关的新闻。
- “编辑精选”应当是数据库上的人工标记：`editor_pick=true`，不另建孤立内容系统。
- 支持主题订阅：single-cell、spatial omics、foundation model、protein design、virtual cell、ADC、CAR-T等。

### 2.4 公司黄页/公司看板墙

公司卡片显示Logo、中文名、英文名、赛道、地区、关键词、官网、最近一次事件、30天事件数和关注按钮。

详情页包含：

- 公司简介与别名；
- 官方网站、Newsroom、IR、Blog、论文与已验证社交账号；
- 独立Timeline；
- 合作网络；
- 相关药物/模型/数据集/论文；
- 品牌更名、并购归属和历史实体说明；
- 来源健康状态：最近成功抓取时间、失败次数、是否需要人工复核。

## 3. 必须实现的数据模型

建议PostgreSQL + pgvector；不要把全部内容只存进向量库。

```sql
create table companies (
  id uuid primary key,
  slug text unique not null,
  name_zh text,
  name_en text not null,
  aliases jsonb not null default '[]',
  track text not null,
  region text,
  focus jsonb not null default '[]',
  official_website text,
  status text not null default 'active',
  parent_company_id uuid references companies(id),
  priority text not null default 'P1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sources (
  id uuid primary key,
  company_id uuid references companies(id),
  source_type text not null,
  url text,
  platform text,
  account_id text,
  verified boolean not null default false,
  poll_profile text not null,
  etag text,
  last_modified text,
  last_success_at timestamptz,
  next_poll_at timestamptz,
  consecutive_failures int not null default 0,
  config jsonb not null default '{}'
);

create table raw_items (
  id uuid primary key,
  source_id uuid not null references sources(id),
  external_id text,
  canonical_url text,
  published_at timestamptz,
  fetched_at timestamptz not null,
  title text,
  raw_payload jsonb,
  content_text text,
  content_hash text not null,
  unique(source_id, content_hash)
);

create table events (
  id uuid primary key,
  event_type text not null,
  title text not null,
  summary text,
  occurred_at timestamptz,
  published_at timestamptz,
  confidence numeric(4,3) not null,
  review_status text not null,
  duplicate_group_id uuid,
  editor_pick boolean not null default false,
  extraction_version text,
  created_at timestamptz not null default now()
);

create table event_evidence (
  event_id uuid references events(id),
  raw_item_id uuid references raw_items(id),
  evidence_text text,
  evidence_start int,
  evidence_end int,
  primary key(event_id, raw_item_id)
);

create table event_entities (
  event_id uuid references events(id),
  entity_type text not null,
  entity_id uuid not null,
  role text not null,
  primary key(event_id, entity_type, entity_id, role)
);

create table relations (
  id uuid primary key,
  subject_type text not null,
  subject_id uuid not null,
  predicate text not null,
  object_type text not null,
  object_id uuid not null,
  event_id uuid not null references events(id),
  confidence numeric(4,3) not null,
  valid_from timestamptz,
  valid_to timestamptz
);
```

## 4. 两小时更新：合理而不是暴力全站抓取

### 4.1 调度

Cloudflare Worker每2小时只负责“派发”，不在一个请求里抓完所有网站：

```toml
# wrangler.toml
[triggers]
crons = ["7 */2 * * *"]
```

```ts
export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(fetch(`${env.API_BASE}/internal/ingestion/dispatch`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.INGEST_SECRET}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        scheduledAt: controller.scheduledTime,
        windowHours: 2
      })
    }));
  }
};
```

后台根据`next_poll_at`选择到期来源，再拆成“一来源一任务”进入队列。建议：P0每2小时、P1每6小时、P2每日。这样站点仍然每2小时产生一次增量，但不会无意义地反复抓取所有公司。

### 4.2 抓取优先顺序

1. 监管机构、交易所与临床试验注册；
2. 公司Newsroom、IR、Press Release与官方博客；
3. PubMed、bioRxiv、medRxiv、Crossref、Europe PMC；
4. 已验证官方社交账号；
5. 二级媒体只做补充和发现，不作为重大事实的唯一证据。

优先RSS/Atom/API/sitemap。网页使用`ETag`、`If-Modified-Since`、canonical URL和正文hash。不要把微信、LinkedIn或X的登录墙爬虫设计成主链路；官方社交更适合发现线索，关键事实仍回到公告、监管披露或论文。

### 4.3 去重

- 精确去重：PMID、DOI、NCT ID、SEC accession number、canonical URL。
- 内容去重：标题标准化 + 正文hash。
- 事件去重：相同主体、事件类型、对象且发生时间相近，合并为一个事件并追加证据。
- 语义去重只作为候选，不可让模型直接删除内容。
- 一家公司公告、合作方公告和媒体报道应合并成一个事件，证据数量增加。

### 4.4 失败与审计

每次任务保存：job_id、source_id、HTTP状态、耗时、抓取字节、解析结果、模型版本、提示词版本、错误堆栈、重试次数。连续失败三次进入“来源健康”后台；重大来源失败触发告警。

## 5. Cloudflare旧域名能否直接换成BioAI日知

**可以。Cloudflare代理的是域名到源站/Pages/Worker的路由，网站内容可以换成新项目。**

推荐切换顺序：

1. 新BioAI日知先部署到独立预览域名并完成数据库迁移与验收。
2. 备份旧Research Hub站点和Cloudflare DNS、WAF、Access、Redirect、Cache Rules配置。
3. 如果旧站是Pages：从旧Pages项目解除自定义域名，再绑定到新项目。
4. 如果旧站是服务器：修改Cloudflare中的A/CNAME记录或Tunnel路由到新源站。
5. 如果旧站由Worker承载：修改Custom Domain/Route绑定到新Worker。
6. 源站证书准备好后使用`Full (strict)`；不要长期使用Flexible。
7. 切换后按URL清理缓存，验证首页、API、静态资源、登录和分享卡片。
8. 旧路径做301映射，提交新站sitemap，并更新站点标题、Open Graph、favicon和统计配置。

品牌建议：如果旧域名本身含`researchhub`等强旧品牌词，技术上仍能复用，但更适合作为301入口；BioAI日知最好使用中性或BioAI相关主域名。如果原域名较中性，可直接换站。

## 6. Codex执行顺序

### Phase 1：实体与来源底座

- 导入`bioai_company_registry_v1.json`；
- 建立公司别名消歧；
- 建立来源发现器，从官网寻找News/Press/IR/Blog/RSS；
- 建立后台人工验证社交账号流程；
- 做公司黄页和公司详情页。

### Phase 2：事件流与四条Timeline

- 接入公司官网、PubMed和bioRxiv；
- 实现raw item、event、evidence、entity link；
- 实现四条Timeline、筛选和事件详情；
- 实现去重与来源可信度。

### Phase 3：Hot图

- 从relations表生成图，不从文章共现直接生成；
- 支持7/30/90天和事件类型过滤；
- 节点聚合、边权、证据抽屉、公司详情联动。

### Phase 4：监管、融资与生产化

- 接入SEC、ClinicalTrials及中国交易所/监管公开来源；
- 增加队列、重试、速率限制、来源健康和审计；
- 加人工复核工作台、编辑精选和订阅通知。

## 7. 首版验收标准

- 公司库能够导入，中文名、英文名和旧品牌不会产生重复公司；
- 首页可独立或叠加显示四条Timeline；
- 每条重大事件都有至少一个可点击原始来源和证据；
- 预印本与正式论文可组成版本链；
- Hot图中的每条边都能回溯到事件证据；
- 调度每2小时运行，但只抓取到期来源；
- 抓取失败不阻塞整个批次；
- 后台可修改公司、别名、官网、优先级与已验证社交账号；
- 切换Cloudflare域名后，旧重要路径有301而非全部硬跳首页；
- 所有模型抽取均保存lineage，可重放、可审计。

## 8. 可直接交给Codex的总指令

```text
你正在把现有Research Hub站点重构为“BioAI日知”。
先读取 bioai_company_registry_v1.json 和 bioai_source_registry_v1.json。
不要先做一个只有卡片和假数据的前端；先完成PostgreSQL实体、来源、原始记录、事件、证据和关系表，再做前台。

必须实现：
1. 测序与多组学、生物医药、AI与模型数据、学术进展四条Timeline；
2. 基于结构化事件关系的Hot图；
3. 公司黄页/看板墙、详情页、官网和来源健康；
4. PubMed、bioRxiv/medRxiv增量接入；
5. Cloudflare Cron每2小时派发，后台按P0/P1/P2 TTL抓取；
6. 全链路去重、证据、可信度、人工复核和lineage；
7. 兼容中英文别名、品牌更名、并购和历史实体。

每完成一个阶段：运行迁移、单元测试、集成测试和最小端到端测试；把未实现项写入TODO.md，不得用静态假数据冒充已经接入的真实来源。
```
