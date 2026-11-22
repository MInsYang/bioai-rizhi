import { TRADITIONAL_COPY } from './traditional-copy.js';
import { GUIDE_EN_COPY } from './guide-copy.js';

export const LANGUAGES = Object.freeze(['zh-CN', 'zh-Hant', 'en']);
export const languageOf = value => LANGUAGES.includes(value) ? value : 'zh-CN';
export const requestLanguage = request => languageOf(new URL(request.url).searchParams.get('lang'));
export const brandName = language => language === 'en' ? 'BioAI Daily' : 'BioAI 日知';
export const organizationName = language => language === 'en' ? 'Wenxiang' : language === 'zh-Hant' ? '問象' : '问象';

// This dictionary is exclusively authored UI/editorial copy. Never pass source
// titles, abstracts, event summaries, evidence, names or unknown data through it.
export const EN_COPY = Object.freeze({
  ...GUIDE_EN_COPY,
  '原始出处': 'Original sources',
  '来源未提供': 'Source not provided',
  '日期未提供': 'Date not provided',
  '未提供': 'Not provided',
  '预印本': 'Preprint',
  '预印本 · 未经期刊同行评议': 'Preprint · not journal peer reviewed',
  '学术索引收录': 'Indexed academic record',
  '行业原文收录': 'Indexed industry source record',
  '来源发布：{date}': 'Source published: {date}',
  '本站收录：{date}': 'Indexed here: {date}',
  '当前没有符合条件的公开原文。': 'There are currently no matching public source records.',
  '当前没有符合条件的公开已核验事件。': 'There are currently no matching public reviewed events.',
  '{count} 条当前公开证据': '{count} currently public evidence items',
  '核查事件证据 →': 'Inspect event evidence →',
  '专题指南：从原文到判断': 'Reader guides: from sources to conclusions',
  '按任务比较模型，按证据追踪合作；每篇保留原始出处与更新日期。': 'Compare models by task and follow collaborations through evidence. Each guide includes original sources and a review date.',
  '全部专题指南 →': 'All reader guides →',
  '本周公开收录 →': 'This week in the public index →',
  '专题指南': 'Reader guides',
  '阅读指南 · 更新 {date}': 'Reader guide · updated {date}',
  '从原文走向判断：比较模型任务，追踪合作进展，理解每周信息的证据与覆盖。': 'Move from sources to conclusions: compare model tasks, follow collaborations, and understand the evidence and coverage behind weekly updates.',
  '原创阅读说明。各篇给出具体出处和更新日期；例子按原始发表版本与公告日期阅读。': 'Original reader guides with specific sources and review dates. Read examples in the context of their original publication versions and announcement dates.',
  '本周收录 →': 'This week in the index →',
  '返回日知头版': 'Return to the front page',
  '阅读指南 · 更新及来源核查 {date}': 'Reader guide · updated and sources checked {date}',
  '继续阅读': 'Continue reading',
  '全部指南 →': 'All guides →',
  '原文有出处，阅读有方法：虚拟细胞与模型比较、AI 制药公司合作时间线、每周研究与行业信息阅读指南。': 'Source-linked guides to virtual cells and model comparisons, AI drug discovery collaborations, and weekly research and industry reading.',
  '有来源的原创阅读指南': 'Original reader guides with cited sources',
  '本周收录 · AI 生物制药与虚拟生命科学': 'This week in the index · AI biopharma and virtual life sciences',
  '北京时间周一 00:00 至页面生成时的公开原文概要。': 'Public source records indexed from Monday 00:00 Beijing time to page generation.',
  '本页统计本站收录。历史文章本周补录也会计入；它不是全行业本周新闻总量。来源发布与收录日期分别显示。': 'These totals describe this site’s collection. Older articles first indexed this week are included. They are not a count of all industry news this week. Source publication and indexing dates are shown separately.',
  '当前公开收录 {count} 条': '{count} currently public indexed records',
  '行业原文 {industry} 条 · 精选期刊 AI 主题研究 {academic} 条 · 有收录的来源 {sources} 个。': '{industry} industry source records · {academic} AI research records in selected journals · {sources} sources with indexed records.',
  '窗口起点 {start}，生成时间 {end}（UTC）；上方日期按北京时间展示。计数在列表限额之前计算，使用公开资源去重规则。撤销来源或调整公开范围后，计数和列表会重新计算。': 'Window starts {start}; generated {end} (UTC). Dates above use Beijing time. Counts are computed before display limits using the public-resource deduplication rules. Revoked sources or changes to public scope are reflected in recalculated counts and lists.',
  '主题': 'Topic',
  '本周收录': 'Indexed this week',
  '继续查看': 'Explore',
  '该主题原文 →': 'Source records for this topic →',
  '主题为自动检索分类，同一原文可进入多个主题。零表示当前收录窗口没有公开符合条件的条目，不表示行业没有发生进展。': 'Topics are automated discovery categories; a source record may belong to more than one topic. Zero means no matching public record in this indexing window, not that no industry progress occurred.',
  '本周收录的原文与出处': 'This week’s indexed records and sources',
  '显示最新 {shown} 条，最多 {limit} 条；完整统计为 {total} 条。每条直接连接本站记录和原始出处。': 'Showing the latest {shown} records, up to {limit}; the complete count is {total}. Each links to its record here and the original source.',
  '本周尚无符合条件的公开收录。请查看来源接入状态，或阅读已有指南。': 'No matching public records have been indexed this week. Check source coverage or read the existing guides.',
  '本周日期内的已核验事件': 'Reviewed events dated this week',
  '{count} 条，显示最多 {limit} 条。优先按发生日期，缺失时按公告日期；此口径与上方按收录时间统计的原文不同。': '{count} events, showing up to {limit}. Events use occurrence dates where available, otherwise announcement dates. This differs from the source-record counts based on indexing time above.',
  '检查来源覆盖与采集状态 →': 'Check source coverage and collection status →',
  '订阅 RSS →': 'Subscribe to RSS →',
  '{start} 起至页面生成时，本站当前公开收录 {total} 条原文：行业 {industry} 条、精选期刊 AI 研究 {academic} 条。保留来源与日期。': 'From {start} to page generation, this site has {total} currently public source records: {industry} industry records and {academic} AI research records in selected journals. Sources and dates are preserved.',
  '关注 AI 生物制药的行业动态、融资合作与重点期刊研究。追踪虚拟细胞、类器官、虚拟胚胎、虚拟器官和 AI 制药，每条内容保留出处。': 'Follow AI biopharma developments, funding, collaborations, and selected-journal research across virtual cells, organoids, virtual embryos, virtual organs, and AI drug discovery. Every item retains its source.',
  '公司档案与合作时间线': 'Company profile and collaboration timeline',
  '公司档案': 'Company profile',
  '{name}的公司档案、官方来源、公开已核验事件与原文线索。{region} · {track}。按来源和日期追踪合作与研发进展。': 'The company profile, official sources, public reviewed events, and source records for {name}. {region} · {track}. Follow collaboration and R&D developments through sources and dates.',
  '地区未提供': 'Region not provided',
  '赛道未提供': 'Track not provided',
  '登记关注方向：{focus}。关注方向是目录字段；具体能力请核查下方来源与项目证据。': 'Registered focus: {focus}. Focus is directory metadata; inspect the sources and project evidence below to assess specific capabilities.',
  '别名：': 'Aliases: ',
  '官方网站': 'Official website',
  '公开已核验进展': 'Public reviewed developments',
  '合作、许可与并购时间线': 'Collaboration, licensing, and acquisition timeline',
  '当前显示的公开进展中没有合作、许可或并购节点；这不代表该公司从未发生相关活动。': 'No collaboration, licensing, or acquisition nodes appear in the developments shown here. This does not establish that the company has never had such activity.',
  '以上来自最新 {count} 条已核验进展。合作事件成立与模型效果、实验结果或临床进度分别需要证据。': 'These are drawn from the latest {count} reviewed developments. A collaboration, model performance, experimental results, and clinical progress each require their own evidence.',
  '公开原文线索': 'Public source records',
  '已验证的官方与订阅来源': 'Verified official and subscription sources',
  '采集已启用': 'Collection enabled',
  '采集未启用': 'Collection disabled',
  '最近成功 {date}': 'Last successful collection {date}',
  '尚无成功记录': 'No successful collection recorded',
  '尚无经过验证的公开来源。请结合来源覆盖理解时间线的缺口。': 'There are no verified public sources yet. Consider source coverage when interpreting gaps in the timeline.',
  '来源验证与持续采集分别显示；原文收录不自动成为已核验事件。': 'Source verification and ongoing collection are shown separately. Indexed source records do not automatically become reviewed events.',
  '返回公司黄页 →': 'Return to the company directory →',
  '查看来源、日期与公开证据。': 'Inspect sources, dates, and public evidence.',
  '公开已核验事件': 'Public reviewed event',
  '已保存的原文节选': 'Saved source excerpt',
  '事件说明': 'Event summary',
  '以上为带出处的原文节选，完整内容请阅读原始链接。自动收录与主题分类不等于事实核验。': 'This is a cited excerpt from the source. Read the original link for the complete text. Automated indexing and topic classification do not constitute fact verification.',
  '公开证据与原始出处': 'Public evidence and original sources',
  '证据原文': 'Evidence source',
  '怎样判断模型与产业进展的证据 →': 'How to assess model and industry evidence →',
  '研究原文与产业进展': 'Research source records and industry developments',
  '{description}。连接研究原文、公司档案与当前公开已核验事件；保留来源和日期。': '{description}. Explore research source records, company profiles, and current public reviewed events with sources and dates preserved.',
  '主题标签来自自动检索分类，用于找到相关材料；它不证明公司具有某项技术，也不等于研究已建立因果或临床效果。': 'Topic labels are automated discovery categories for finding related material. They do not establish a company’s capabilities, causality, or clinical efficacy.',
  '研究与行业原文': 'Research and industry source records',
  '当前公开已核验事件': 'Current public reviewed events',
  '有相关公开原文的公司': 'Companies with related public source records',
  '当前目录内未找到有该主题公开原文的公司。': 'No directory companies with public source records for this topic were found.',
  '订阅本主题 RSS →': 'Subscribe to this topic’s RSS →',
  '{day} 日报': '{day} daily digest',
  '北京时间 08:00 汇总前 24 小时新入库原文的冻结选集，最多 100 条。公开范围与来源验证在阅读时复核。': 'A frozen selection of up to 100 source records indexed in the 24 hours before 08:00 Beijing time. Public scope and source verification are rechecked at reading time.',
  '当前公开 {count} 条；窗口 {start} 至 {end}。来源发布日期与本站收录时间分别保留，选集不是全部行业新闻。': '{count} records are currently public; window {start} to {end}. Source publication and indexing dates are preserved separately. This selection does not cover all industry news.',
  '此期当前没有公开可见的原文。来源撤销或范围调整后，冻结选集也会在阅读时收回不再公开的项目。': 'This digest currently has no publicly visible source records. Items that are no longer public are removed at reading time after source revocation or scope changes, even in frozen selections.',
  '查看实时的本周收录 →': 'View the current week’s live index →',
  '连接你的 AI': 'Connect your AI',
  '通过只读 MCP 和 RSS，将可追溯的虚拟生命科学信息带到个人 AI 工作流。': 'Bring traceable virtual life science information into your personal AI workflow through read-only MCP and RSS.',
  '阅读证据指南 →': 'Read the evidence guides →',
  'MCP 五项只读工具均支持可选 language：zh-CN、zh-Hant 或 en。未指定时保持旧调用的文案；指定语言只本地化说明和受控标签，来源原文保持原始语言。': 'All five read-only MCP tools accept an optional language: zh-CN, zh-Hant, or en. Omit it to keep legacy presentation. Selecting a language localizes explanatory copy and controlled labels; source text stays in its original language.',
  'AI 生物制药行业报': 'AI biopharma intelligence',
  '重点主题': 'Featured topics',
  '最新公开原文': 'Latest public source records',
  '有证据的产业进展': 'Evidence-linked industry developments',
  '公司与合作档案': 'Company and collaboration profiles',
  '浏览公司黄页 →': 'Browse the company directory →',
  '从原始公告和公共学术索引出发，分别提供原文、已核验事件及合作关系。范围与来源覆盖限制请结合信息来源页阅读。': 'Original announcements and public academic indexes support source records, reviewed events, and collaboration relationships. Check the sources page for scope and coverage limitations.',
  '界面与原创指南按所选语言显示；来源标题、摘要、事件说明及证据引文保留原始语言。': 'The interface and original reader guides use the selected language. Source titles, excerpts, event summaries, and evidence quotations retain their original language.',
  '请输入有效的 YYYY-MM-DD 日期': 'Enter a valid YYYY-MM-DD date',
  '来源原文索引；自动归类不等于事实复核。预印本保留状态。': 'An index of source records. Automated classification does not constitute fact verification. Preprint status is preserved.',
  '虚拟生命科学': 'Virtual life sciences',
  '未找到页面': 'Page not found',
  '数据服务暂不可用，请稍后重试。': 'The data service is temporarily unavailable. Please retry later.',
  '请求过于频繁，请稍后重试。': 'Too many requests. Please retry later.',
  '编辑精选的固定期刊名单；不是影响因子排名或对单篇论文质量的背书。': 'A fixed editorial selection of journals, not an impact-factor ranking or an endorsement of individual articles.',
  '默认仅展示名单内期刊、AI 与生物医药主题相关的记录；预印本不进入精选期刊视图。': 'By default, show records in the selected journals related to AI and biopharma topics. Preprints are excluded from the selected-journal view.',
  'journal_tier=all 可查阅保留的其他期刊与预印本来源记录。': 'Use journal_tier=all to access stored records from other journals and preprint sources.',
  '综合科研': 'General science', '生命科学': 'Life sciences', '生物技术与转化': 'Biotechnology and translation',
  '生命科学方法': 'Life science methods', '医学与转化': 'Medicine and translation', '基因组学': 'Genomics',
  'AI 与机器学习': 'AI and machine learning', '计算科学': 'Computational science', '生物医学工程': 'Biomedical engineering',
  '化学生物学': 'Chemical biology', '转化医学': 'Translational medicine', '系统生物学': 'Systems biology',
  '肿瘤学与药物研发': 'Oncology and drug development', '药物研发综述': 'Drug discovery reviews',
  '化学与分子设计': 'Chemistry and molecular design', '结构与分子生物学': 'Structural and molecular biology',
  'AI 虚拟细胞': 'AI virtual cells', '类器官': 'Organoids', 'AI 虚拟胚胎': 'AI virtual embryos', 'AI 虚拟器官': 'AI virtual organs', '虚拟药物研发': 'AI drug discovery',
  '细胞状态、扰动响应与细胞基础模型': 'Cell states, perturbation responses, and cell foundation models',
  '生物类器官、类器官分析及计算模型': 'Biological organoids, organoid analysis, and computational models',
  '胚胎发育的计算模型；生物胚胎模型单独标注': 'Computational models of embryonic development; biological embryo models are labeled separately',
  '器官数字孪生、多尺度模拟与生理预测': 'Organ digital twins, multiscale simulation, and physiological prediction',
  '计算靶点发现、虚拟筛选与生成式药物设计': 'Computational target discovery, virtual screening, and generative drug design',
  '测序与多组学': 'Sequencing and multi-omics', '生物医药': 'Biopharma', 'AI与模型数据': 'AI, models, and data', '学术进展': 'Academic research',
  '中国': 'China', '中国大陆': 'Mainland China', '中国香港': 'Hong Kong, China', '海外': 'Global', '跨地区': 'Cross-region',
});

export function ownedText(value, language = 'zh-CN', variables = {}) {
  const lang = languageOf(language);
  const copy = lang === 'en' ? EN_COPY[value] ?? value : lang === 'zh-Hant' ? TRADITIONAL_COPY[value] ?? value : value;
  return String(copy).replace(/\{([a-z_]+)\}/g, (_, key) => String(variables[key] ?? `{${key}}`));
}
export function localizedTopic(item, language) {
  return { ...item, label: ownedText(item.label, language), description: ownedText(item.description, language) };
}
const CONTROLLED_DIRECTORY_LABELS = new Set(['测序与多组学', '生物医药', 'AI与模型数据', '学术进展', '中国', '中国大陆', '中国香港', '海外', '跨地区']);
export const controlledLabel = (value, language) => CONTROLLED_DIRECTORY_LABELS.has(value) ? ownedText(value, language) : value;
export function companyName(company, language) {
  return language === 'en' ? company.name_en || company.name_zh || company.name || '' : company.name_zh || company.name_en || company.name || '';
}

// Language changes preserve query fields and fragment. Unspecified/default
// Chinese pages retain their historical URL; explicit preferences stay explicit.
export function languageUrl(value, language, explicit = false, base = 'https://bioai.invalid') {
  const url = new URL(value, base);
  if (url.origin !== new URL(base).origin) return value;
  if (explicit || languageOf(language) !== 'zh-CN') url.searchParams.set('lang', languageOf(language));
  return /^[a-z][a-z\d+.-]*:/i.test(value) ? url.href : url.pathname + url.search + url.hash;
}

export function localizedJournalPolicy(policy, language) {
  return { ...policy,
    items: policy.items.map(item => ({ ...item, focus: ownedText(item.focus, language) })),
    selection_basis: ownedText(policy.selection_basis, language),
    article_rule: ownedText(policy.article_rule, language),
    archive_access: ownedText(policy.archive_access, language),
  };
}

const publicErrorCopy = {
  'Not found': ['未找到页面', 'Page not found'],
  'Not Found': ['未找到页面', 'Page not found'],
  'Unknown topic': ['未知主题', 'Unknown topic'],
  'Topic not found': ['未找到主题', 'Topic not found'],
  'Guide not found': ['未找到指南', 'Guide not found'],
  'Digest not found': ['未找到日报', 'Digest not found'],
  'Digest not yet generated': ['日报尚未生成', 'Digest not yet generated'],
  'Method Not Allowed': ['请求方法不支持', 'Method not allowed'],
  'Invalid path encoding': ['路径编码无效', 'Invalid path encoding'],
  'Database unavailable': ['数据服务暂不可用，请稍后重试。', 'The data service is temporarily unavailable. Please retry later.'],
  'Company not found': ['未找到公司', 'Company not found'],
  '未知地区分类': ['未知地区分类', 'Unknown region group'],
  '开始日期不能晚于结束日期': ['开始日期不能晚于结束日期', 'The start date cannot be later than the end date'],
  '未知主题': ['未知主题', 'Unknown topic'],
  '未知范围': ['未知范围', 'Unknown scope'],
  '事件不存在或尚未发布': ['事件不存在或尚未发布', 'The event is missing or is not publicly published'],
  '原文不存在或来源尚未验证': ['原文不存在或来源尚未验证', 'The source record is missing or its source is not verified'],
};
export function localizedPublicError(value, language) {
  const pair = publicErrorCopy[value];
  if (!pair) return value;
  if (language === 'en') return pair[1];
  return language === 'zh-Hant' ? TRADITIONAL_COPY[pair[0]] ?? pair[0] : pair[0];
}
export const PUBLIC_ERROR_COPY = publicErrorCopy;
