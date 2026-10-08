// Original reader guides. Source titles and short factual descriptions are cited;
// no source article, abstract, performance league table or company claim is copied.
// These are dated explanations, not an automatically updated news feed.
export const GUIDE_REVIEW_DATE = '2026-10-08';
export const GUIDE_SOURCES = Object.freeze({
  'virtual-cell': {
    title: 'How to build the virtual cell with artificial intelligence: Priorities and opportunities',
    url: 'https://doi.org/10.1016/j.cell.2024.11.015',
    label: 'Cell · 2024 · 研究愿景与评估框架',
  },
  scgpt: {
    title: 'scGPT: toward building a foundation model for single-cell multi-omics using generative AI',
    url: 'https://www.nature.com/articles/s41592-024-02201-0',
    label: 'Nature Methods · 2024 · 单细胞基础模型论文',
  },
  alphafold3: {
    title: 'Accurate structure prediction of biomolecular interactions with AlphaFold 3',
    url: 'https://www.nature.com/articles/s41586-024-07487-w',
    label: 'Nature · 2024 · 生物分子复合物结构预测论文',
  },
  rfdiffusion: {
    title: 'De novo design of protein structure and function with RFdiffusion',
    url: 'https://www.nature.com/articles/s41586-023-06415-8',
    label: 'Nature · 2023 · 蛋白设计方法与实验论文',
  },
  'isomorphic-2024': {
    title: 'Isomorphic Labs kicks off 2024 with two pharmaceutical collaborations',
    url: 'https://www.isomorphiclabs.com/articles/isomorphic-labs-kicks-off-2024-with-two-pharmaceutical-collaborations',
    label: 'Isomorphic Labs · 2024-01-07 · 公司合作公告',
  },
  'clinical-trials': {
    title: 'ClinicalTrials.gov: clinical research studies and results',
    url: 'https://clinicaltrials.gov/',
    label: '美国国家医学图书馆 · 临床研究登记与结果数据库',
  },
});

// Each paragraph and comparison row can carry a source. Reading questions are
// explicitly editorial suggestions, not findings attributed to a cited study.
export const GUIDES = Object.freeze([
  {
    id: 'virtual-cell-models',
    title: '虚拟细胞、AI 模型与公司：应该怎样比较？',
    description: '按输入、输出、任务和验证条件比较单细胞模型、结构预测与蛋白设计，并区分模型论文与公司能力。',
    topics: ['virtual-cell', 'drug-discovery'],
    sourceIds: ['virtual-cell', 'scgpt', 'alphafold3', 'rfdiffusion', 'isomorphic-2024'],
    sections: [
      { heading: '先明确要预测的对象', paragraphs: [
        { text: '“AI 虚拟细胞”是一条用生物数据建立细胞计算表征、预测细胞状态及变化的研究路线。单细胞基础模型可以承担其中部分任务；分子结构预测和蛋白设计分别处理不同层面的问题。公司是研发组织，比较它时还要看具体产品、数据和公开证据。', sources: ['virtual-cell', 'scgpt'] },
        { text: '这份比较以论文中的原始版本为例，说明任务边界。它不排列“最强模型”，也不把一个版本的实验结果延伸为整个公司的能力。' },
      ] },
      { heading: '四类对象，四种阅读方式', table: {
        headers: ['对象与类别', '主要输入和输出', '适合核查的证据', '比较边界'],
        rows: [
          { cells: ['scGPT · 单细胞基础模型', '以单细胞组学数据学习细胞和基因表征；具体输出随下游任务配置而变。', '原论文的任务设定、微调方式、测试集及基线。', '细胞表征质量与未见扰动的预测能力需要分别验证。'], sources: ['scgpt'] },
          { cells: ['AlphaFold 3 · 结构预测模型', '给定分子组成与相关输入，预测包含蛋白、核酸或小分子的复合物结构。', '独立结构测试、界面准确度和置信度；注意原论文的模型局限。', '结构预测不直接给出细胞响应、药效或患者获益。'], sources: ['alphafold3'] },
          { cells: ['RFdiffusion · 蛋白设计方法', '根据设计条件生成蛋白结构；序列设计、筛选和实验是后续环节。', '生成候选总数、实验测试数、命中标准及独立验证。', '结构或结合验证只支持被测试的设计与条件。'], sources: ['rfdiffusion'] },
          { cells: ['Isomorphic Labs · 公司', '官方公告描述其合作对象与药物发现项目；公司名称不是一个可运行的模型版本。', '合同/合作公告、对应研究结果及具体项目后续披露。', '合作成立与平台性能、候选药物进度分别需要证据。'], sources: ['isomorphic-2024'] },
        ],
      } },
      { heading: '虚拟细胞项目要追问哪些条件？', paragraphs: [
        { text: '我们的阅读建议是：先写清输入包含哪些测量，目标是细胞状态、群体平均变化，还是扰动后的分布；再核查训练与测试是否共享供体、细胞系、药物或靶点。同一批数据中随机分出的细胞，与完全未见的生物背景，是不同的验证问题。' },
        { text: '对只有未配对 CTRL 与 PERT 群体的数据，可以比较状态分布和平均响应；若没有追踪或配对测量，不能据此识别每个细胞的真实变化轨迹。RNA 层面的预测也不能自动解释为蛋白丰度或修饰变化。这里的判断来自测量对象与实验设计，使用模型名称不会消除这些限制。' },
        { text: '记录论文中的任务、数据切分、简单基线、评价指标和失败案例，才能判断结果能否用于你的研究。虚拟细胞愿景文章本身也讨论数据、评估和生物学准确性要求；它并非某个模型已经完整复现细胞的证明。', sources: ['virtual-cell'] },
      ] },
      { heading: '从模型论文走到公司档案', paragraphs: [
        { text: '本站主题页连接相关原文，公司页连接官方来源和已核验事件。自动主题分类提供检索入口；它不证明论文作者与公司存在隶属或授权关系。比较公司时，请在档案内寻找具体模型版本、项目阶段和可追溯的合作事件。' },
      ] },
    ],
    links: [{ href: '/topics/virtual-cell', label: '查看虚拟细胞原文' }, { href: '/topics/drug-discovery', label: '查看 AI 药物研发原文' }, { href: '/guides/ai-drug-discovery-collaborations', label: '如何读合作公告' }],
  },
  {
    id: 'ai-drug-discovery-collaborations',
    title: 'AI 制药公司合作时间线：从公告读到证据',
    description: '用真实官方公告区分合作主体、首付款、条件性里程碑和研发进度，并建立可追溯的合作时间线。',
    topics: ['drug-discovery'],
    sourceIds: ['isomorphic-2024', 'alphafold3', 'clinical-trials'],
    sections: [
      { heading: '一条合作公告能告诉我们什么？', paragraphs: [
        { text: '公司公告可以证明公司在某日公开披露了一项合作，以及公告写明的主体、项目范围和条款。模型是否在某项任务有效，要读方法与验证；项目是否获得临床结果，要读对应研究。把这些材料沿时间线连接，才能看清一项合作实际走到了哪一步。' },
      ] },
      { heading: '一个有日期的历史例子', paragraphs: [
        { text: '2024 年 1 月 7 日，Isomorphic Labs 公告与 Eli Lilly 和 Novartis 的两项合作，描述为面向多个靶点的小分子合作，付款包含首付款与里程碑。公告列出的首付款分别为 4,500 万美元和 3,750 万美元。这是历史公告的内容，不能作为今天所有项目状态的概括。', sources: ['isomorphic-2024'] },
        { text: '读这类报道时，要把已明确的首付款与满足条件后可能支付的里程碑分开。潜在总金额不能写成已到账金额，两个不同合作也不能合并成一条已经交付的研发成果。' },
      ] },
      { heading: '给时间线保留六个字段', table: {
        headers: ['字段', '记录方式', '需要避免的误读'],
        rows: [
          { cells: ['公司与角色', '分别记录研发平台方、药企、数据或实验合作方。', '品牌别名和法律主体不同，不能靠名称相似自动合并。'] },
          { cells: ['公告日期 / 发生日期', '日期分别保留；签署日期未披露时说明缺失。', '本站收录时间不是合作发生时间。'] },
          { cells: ['合作范围', '靶点、模态、地域、独家性等按公告记录，未披露的保持未知。', '未披露靶点不表示已经具备某个适应证的临床证据。'] },
          { cells: ['金额与条件', '首付款、研发付款、里程碑、版税分别记录。', '条件性上限不等于当前交易现金。'] },
          { cells: ['证据与原文', '保留公告链接、发布主体及支持该事件的具体文字。', '媒体转载和原公告不能按两次合作累计。'] },
          { cells: ['后续进展', '把扩展合作、终止、候选物、实验或临床披露作为新的有来源节点。', '没有找到后续信息时，应记为覆盖未知。'] },
        ],
      } },
      { heading: '模型、实验与临床证据如何连接？', paragraphs: [
        { text: 'AlphaFold 3 论文提供的是生物分子相互作用结构预测的方法与评估。即使合作方采用了结构模型，论文中的结构准确度仍不能替代该合作项目的实验或临床结果；原论文也明确讨论了结构与动态行为的局限。', sources: ['alphafold3'] },
        { text: '核查临床节点时，可以通过 ClinicalTrials.gov 查研究登记与结果，但登记存在并不等于已经有结果，也不意味着该平台验证过研究的全部科学主张。数据库说明信息由研究申办方或研究者提交。', sources: ['clinical-trials'] },
      ] },
      { heading: '在日知里继续追踪', paragraphs: [
        { text: '公司档案显示当前公开的已核验事件和验证过的来源；原文索引保留尚未升为事件的资料。来源被撤销后，对应公开证据会收回。时间线缺少节点，可能来自公告未披露、来源覆盖或采集失败，应结合来源状态阅读。' },
      ] },
    ],
    links: [{ href: '/companies/isomorphic-labs', label: 'Isomorphic Labs 公司档案' }, { href: '/companies/eli-lilly', label: 'Eli Lilly 公司档案' }, { href: '/companies/novartis', label: 'Novartis 公司档案' }, { href: '/briefings', label: '查看本周收录' }],
  },
  {
    id: 'weekly-reading-method',
    title: '每周 AI 制药信息怎么读：公司动态、研究进展与覆盖缺口',
    description: '建立每周阅读顺序，分清公告、论文与临床结果；理解本站本周收录的时间窗口、分母和来源覆盖。',
    topics: ['drug-discovery', 'virtual-cell'],
    sourceIds: ['isomorphic-2024', 'scgpt', 'clinical-trials'],
    sections: [
      { heading: '先看本周收录的口径', paragraphs: [
        { text: '本站“本周收录”从北京时间周一 00:00 统计到页面生成时，只包含当前公开可见、符合范围的原文；学术部分沿用本站精选期刊与 AI 主题条件。收录时间决定统计窗口，来源发布日期单独显示。历史文章本周补录时会进入统计，它不是全行业本周新发生的新闻数量。' },
        { text: '计数使用公开列表的去重规则；同一条原文可以属于多个主题，所以主题行的数量相加可能超过原文总数。每日摘要使用每天 08:00 冻结的前 24 小时选集，最多选入 100 条，与实时滚动的本周统计是不同视图。' },
      ] },
      { heading: '把一周的阅读分成三轮', table: {
        headers: ['阅读顺序', '重点记录', '下一步'],
        rows: [
          { cells: ['公司公告', '合作双方、范围、条件、公告日期与原文。', '回公司档案看已有节点，避免把转载当新增合作。'], sources: ['isomorphic-2024'] },
          { cells: ['研究与模型', '输入、预测任务、数据切分、基线与评价指标。', '核查论文版本和实验对象，再判断能否关联到产业项目。'], sources: ['scgpt'] },
          { cells: ['临床与后续', '具体候选物或研究编号、登记状态和已公开的结果。', '区分进入研究、完成研究与发表结果，保留缺失信息。'], sources: ['clinical-trials'] },
        ],
      } },
      { heading: '写下变化，也写下仍未知的部分', paragraphs: [
        { text: '我们的建议是每周只为有出处的新节点写一句话：谁在什么日期公开了什么；证据处于公告、计算评估、实验还是临床结果层面；下次需要核查哪项信息。某公司没有新收录，不等于研发停止；某主题篇数增多，也不单独证明技术取得突破。' },
        { text: '阅读前检查来源最近成功采集的时间和接入状态。只验证了官网或账号、尚未启用采集的来源，不应算作持续覆盖；连续失败的来源可能造成遗漏。本站保留原文与核验事件的区分，便于回到原始材料核查。' },
      ] },
      { heading: '一个可以复用的周笔记', paragraphs: [
        { text: '本周窗口：____。我关注的公司 / 主题：____。新公开节点及原文：____。支持的证据层面：____。尚未知的条款、靶点或结果：____。来源覆盖缺口：____。下一次复核的具体问题：____。' },
        { text: '从本周收录页打开原文，或按主题订阅 RSS；需要沿公司长期追踪时回到公司档案。周笔记的价值在于保留判断依据和待核查问题，无需把每条索引重新包装成新闻。' },
      ] },
    ],
    links: [{ href: '/briefings', label: '本周公开收录概要' }, { href: '/feed.xml', label: '订阅带来源的 RSS' }, { href: '/guides/ai-drug-discovery-collaborations', label: '合作时间线阅读指南' }, { href: '/connect', label: '接入自己的 AI 工作流' }],
  },
]);

export const guideById = id => GUIDES.find(guide => guide.id === id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const references = ids => (ids || []).map(id => {
  const source = GUIDE_SOURCES[id];
  return source ? ` <a class="publication-citation" href="${esc(source.url)}" rel="noopener">[${esc(source.label)}]</a>` : '';
}).join('');

export function guideCards(relatedTopic = '') {
  const guides = relatedTopic ? GUIDES.filter(guide => guide.topics.includes(relatedTopic)) : GUIDES;
  return `<div class="publication-link-grid">${guides.map(guide => `<section class="panel"><h3><a href="/guides/${guide.id}">${esc(guide.title)}</a></h3><p>${esc(guide.description)}</p><p class="source-note">阅读指南 · 更新 ${GUIDE_REVIEW_DATE}</p></section>`).join('')}</div>`;
}

export function guideIndexPage() {
  return `<article class="publication-article" data-publication-view="guides"><header><p class="eyebrow">BIOAI READER GUIDES</p><h1>专题指南</h1><p class="lede">从原文走向判断：比较模型任务，追踪合作进展，理解每周信息的证据与覆盖。</p></header><p class="source-note">BioAI 日知 · 原创阅读说明。各篇给出具体出处和更新日期；例子按原始发表版本与公告日期阅读。</p>${guideCards()}<p><a href="/briefings">本周收录 →</a> · <a href="/">返回日知头版</a></p></article>`;
}

export function guidePage(guide) {
  const sourceList = guide.sourceIds.map(id => GUIDE_SOURCES[id]);
  return `<article class="publication-article" data-publication-view="guide"><header><p class="eyebrow">BIOAI READER GUIDE</p><h1>${esc(guide.title)}</h1><p class="lede">${esc(guide.description)}</p><p class="source-note">BioAI 日知 · 阅读指南 · 更新及来源核查 ${GUIDE_REVIEW_DATE}</p></header>${guide.sections.map(section => `<section><h2>${esc(section.heading)}</h2>${(section.paragraphs || []).map(p => `<p>${esc(p.text)}${references(p.sources)}</p>`).join('')}${section.table ? `<div class="publication-table-wrap"><table class="publication-table"><thead><tr>${section.table.headers.map(cell => `<th scope="col">${esc(cell)}</th>`).join('')}</tr></thead><tbody>${section.table.rows.map(row => `<tr>${row.cells.map((cell, index) => `<${index === 0 ? 'th scope="row"' : 'td'}>${esc(cell)}${index === row.cells.length - 1 ? references(row.sources) : ''}</${index === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}</section>`).join('')}<section><h2>原始出处</h2><ol class="publication-sources">${sourceList.map(source => `<li><a href="${esc(source.url)}" rel="noopener">${esc(source.title)}</a><br><span class="source-note">${esc(source.label)}</span></li>`).join('')}</ol></section><nav class="publication-links" aria-label="继续阅读">${guide.links.map(link => `<a href="${esc(link.href)}">${esc(link.label)} →</a>`).join(' ')} <a href="/guides">全部指南 →</a></nav></article>`;
}

export function guideSchema(guide, base) {
  return {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: guide.title, description: guide.description, inLanguage: 'zh-CN',
    url: `${base}/guides/${guide.id}`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${base}/guides/${guide.id}` },
    author: { '@type': 'Organization', name: 'BioAI 日知', url: base + '/' },
    datePublished: GUIDE_REVIEW_DATE, dateModified: GUIDE_REVIEW_DATE,
    citation: guide.sourceIds.map(id => GUIDE_SOURCES[id].url),
  };
}
