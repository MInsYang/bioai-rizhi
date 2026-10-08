# 精选文献库：范围、验证与配置

2026-10-08 已落实 `selected-journals-2026-10-v1`。名单共有 17 本期刊，依据本产品的 AI、生物技术、药物研发与转化主题进行编辑精选，不使用未经核验的影响因子数值，也不把期刊名称当作单篇论文质量的证明。

名单为 Nature、Science、Cell、Nature Biotechnology、Nature Methods、Nature Medicine、Nature Genetics、Nature Machine Intelligence、Nature Computational Science、Nature Biomedical Engineering、Nature Chemical Biology、Science Translational Medicine、Cell Systems、Cancer Discovery、Nature Reviews Drug Discovery、Nature Chemistry、Nature Structural & Molecular Biology。完整刊名、ISSN、别名和官网链接在 `cloudflare/site/journals.js`；公开接口 `/api/journals` 返回同一名单与选择规则。

默认 `/api/records` 和 `/api/records?academic=true` 在数据库计数和分页之前执行精选规则：名单内期刊、AI 相关、至少一个目标主题；预印本不进入默认精选文献视图。普通湿实验类器官论文仍保留其生物模型分类，`ai_related=false`，不会因此成为 AI 文献。完整刊名经过大小写、标点与 NFKC 归一后精确匹配；刊名缺失时才使用可唯一定位期刊的 ISSN。明确的其他刊名不能借用精选刊物的 ISSN，存在多本期刊的 ISSN 歧义时不自动认定。

内容分类采用独立版本 `biomedical-focus-2026-10-v3`，不改变 `focus-2026-10-v2` 检索字符串或查询指纹。`classification.in_scope` 明确表示内容是否符合主题。判定优先要求标题指向具体研究主题；没有标题依据时，正文须有直接指向主题的研究陈述、开头的生医问题与后续明确研究陈述，或至少两句主题内容且占已提取句子的一半以上。正文只取前 8,000 字符，并截去公司简介。泛 AI 科研治理评论中的单句 AlphaFold 示例、非医药塑料报道中的分子/生物制造词和页尾 AI 简介不构成研究主题；蛋白设计及序列工程、细胞表示学习与预测、治疗组合优化、实质类器官研究及明确药物递送用途的生物材料仍可进入。

`policy_version`、`scope_reason` 和 `topic_evidence` 保留可解释的规则依据，这仍是保守的自动筛选，不证明研究质量。`ai_related=true` 本身不能满足生物医药主题。官方产业来源另外必须满足 `industry_classification.relevant=true`，其 false 结果持续保存，旧 `topic_ids` 不会重新放行。默认及主题列表、统计和日报重读排除明确 false；显式 `scope=all` 历史库与原始详情继续保留证据。

`journal_tier=all` 显式查阅保留的其他期刊及预印本记录；`scope=all` 可进一步解除主题限制。原文详情仍保留来源状态、原始记录和出处。`academic.journal_selection` 是带版本的派生信息，`status=indexed` 只说明元数据收录，不证明同行评议、因果关系或临床价值。

## 已验证的免费接口

只读网络报告为 [literature-live-validation-2026-10-08.json](literature-live-validation-2026-10-08.json)，包括请求地址、观察时间、HTTP 状态、响应字节数、响应 SHA-256 和真实记录示例；不写数据库。

| 来源 | 2026-10-08 验证结果 | 使用方式 |
| --- | --- | --- |
| Crossref | 17/17 精选期刊的 ISSN 查询通过 | 单一 `crossref` 来源按期刊与日期窗口分页，补充出版商登记的 DOI 元数据 |
| Europe PMC | 收窄查询通过；最近 30 天出版日期窗口返回 12 条 | MED 来源、精选期刊 ISSN、AI 主题查询；采集用首次索引/更新时间 |
| PubMed | 收窄查询通过；最近 30 天收录日期窗口返回 18 条 | ESearch 表单 POST，随后分批 EFetch，保留刊名、ISSN、PMID、DOI 和原始 XML |

两个计数的日期口径不同，不能当作完整文献数或直接比较覆盖率。Crossref 页面的条数是登记元数据，可能包含旧文章的更新；前端近期列表使用出版/采集时间约束。缺少精确日月的出版日期保持未知，不生成月初日期。免费接口提供元数据，全文可用性由原始出版方决定。

真实复核发现两类上游问题，已在实现中处理：PubMed GET 长查询返回 HTTP 414，改为 NCBI 文档建议的 POST；部分 Crossref `/journals/{issn}/works` 返回 HTTP 500，采用文档支持的 `/works?filter=issn:...` 查询。Crossref 的 Nature Methods 和 Nature Reviews Drug Discovery 期刊登记还合并了不同刊名的 ISSN，所以每条文章必须核验自己的刊名，不能仅凭接口地址认定期刊。网络报告保留原始登记差异；短暂失败按有界重试处理，最终报告通过后没有继续重试。

Crossref 每次最多 20 条，按期刊/日期窗口/页偏移持久化 checkpoint，完成所有窗口后才推进高水位。空的未完页、重复页、超出 10,000 的偏移、缺失 DOI、未知期刊配置都会阻止推进。可用期刊范围变化会改变查询指纹，避免复用旧范围的游标。来源配置只启用网络报告中实际通过的期刊，存在部分失败时可明确隔离失败刊物。采集是有重叠回看的元数据同步，不能声称索引具有完整覆盖或没有延迟。

09:13–09:14 UTC 另作生产检查点的只读复核：[crossref-runtime-probe-2026-10-08.json](crossref-runtime-probe-2026-10-08.json)。Nature Genetics 的 2026-09-08 至 09-14 窗口，20 条、偏移 0、登记时间升序，在 `/works`、`/journals/1061-4036/works`、再 `/works` 三次请求均为 HTTP 200；总数 45、20 个 DOI、389,231 字节及响应 SHA-256 一致。最初的 17 刊验证采用 30 天、每页 2 条、降序，不能将它等同于所有生产窗口的成功保证。观察到的短暂 500 保留检查点并由原有退避处理；生产随后推进至 Cell Systems，未将失败页当作完成或跳过该刊。

## 配置与验证

```sh
python3 scripts/validate_literature.py
.venv/bin/python scripts/configure_focus.py --dry-run
.venv/bin/python scripts/configure_focus.py --backfill
```

首次命令仅访问公开接口。回填在数据库事务内更新分类、期刊选择及产业相关性派生字段；保留原文、原始 XML/JSON 和 `content_hash`。收窄前的本地回填快照为 4,669 条记录，前后内容哈希清单摘要均为 `86bdd0c8315a0f86a92a999a072818ae`，当时 46 条学术原始记录满足精选期刊与 AI 相关条件；该旧数字不能表示 v3 当前准入数量，也不能当作去重后的公开文献数。

回填以每 100 条一条 `UPDATE FROM jsonb_to_recordset` 发送，只写 `raw_payload`，并以 `IS DISTINCT FROM` 跳过未变记录。新增 12 条短摘录候选及产业来源配置后的本地复验：4,681 条记录，首次更新 30 条派生字段，再次执行为 0 条；前后内容哈希清单摘要均为 `ac6ec201144dfdca9b11d7f8ae43d0bf`，两次合计 12.35 秒。12 条 `dated-official-curated-candidate` 产业分类原样保留，短摘录不会被自动全文关键词分类覆盖；Virtual Biology Initiative 归入 `virtual-cell`，不会无条件添加药物研发主题。

v3 冻结前另外用本地事务 savepoint 复验，随后完整回滚：4,681 条派生字段首次更新、第二次 0 条，原文及内容哈希清单前后相等，12 条独立核对的产业分类原样保留。46 条旧的精选期刊且 AI 相关原始记录中，42 条满足当前内容门槛，按 DOI、PMID 或标题去重为 33 个不同标识；该复核数不代表完整论文覆盖，明确区分来源副本与文献。复核补足蛋白序列/fitness、RNA-guided nuclease、单细胞表示学习和治疗组合方案的通用任务表述，未因数量下降重新放行泛科研代理、知识图谱证据检索或非医药稀土分离。真实抽样中的 Science 科研治理评论与晶泰新塑料报道均为 `in_scope=false`。

已验证精选过滤在 PostgreSQL 计数/分页之前执行、预印本与未知刊物排除、显式历史访问、歧义 ISSN、NFKC 刊名、Crossref 分页/游标与官方主机限速、PubMed POST 与精确日期、原始内容保留。数据库测试使用独立的临时本地数据库并在结束后移除。API 另外要求发布来源同时已验证且启用，并在事务中锁住来源；事件记录可明确区分 `operator` 与 `agent-assisted-source-review`，避免把代理辅助的原文证据核对写成人类审核。

官方依据：[Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/)、[Crossref ISSN 与日期过滤](https://www.crossref.org/documentation/retrieve-metadata/rest-api/rest-api-filters/)、[Crossref 分页与字段说明](https://github.com/CrossRef/rest-api-doc)、[Europe PMC REST](https://europepmc.org/RestfulWebService)、[NCBI ESearch 长查询 POST 说明](https://www.ncbi.nlm.nih.gov/corehtml/query/static/esummary_help.html)、[Cell Systems 的 NLM ISSN 记录](https://www.ncbi.nlm.nih.gov/nlmcatalog/101656080)。

2026-10-08 10:06:18 UTC，生产 Crossref 首次完整回填任务最终 `succeeded`，190 次处理包含正常分页与临时错误重试，完成时 `failure_count=0`。完整来源状态与迁移 001–015 见 [本轮验收](newspaper-acceptance.json)；已有原文分类回填的内容哈希不变证据见 [分类验收](scope-backfill-acceptance.json)。
