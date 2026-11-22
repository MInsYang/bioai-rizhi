import { LANGUAGES, controlledLabel, languageUrl, localizedJournalPolicy, localizedTopic } from './locales.js';
import { TOPICS } from './topics.js';

const COPY = Object.freeze({
  original: {
    en: 'Source titles, excerpts, stored text, event summaries, names, and exact evidence quotations retain their original language. No source translation or language detection is implied.',
    'zh-CN': '来源标题、节选、已保存正文、事件说明、名称与精确证据引文保留原始语言；不代表已翻译来源或识别其语言。',
    'zh-Hant': '來源標題、節選、已保存正文、事件說明、名稱與精確證據引文保留原始語言；不代表已翻譯來源或識別其語言。',
  },
  coverage: {
    en: 'Results cover records stored by BioAI Daily, not the entire web. A verified source record is not an editor-reviewed event. Topic tags can be automated keyword matches; preserve classification.method and publication status. No result does not establish that no research or company exists.',
    'zh-CN': '结果覆盖 BioAI 日知已保存的记录，不涵盖整个互联网。已验证来源的原文记录不等于编辑核验事件。主题标签可能来自自动关键词匹配；请保留 classification.method 与发布状态。没有结果不证明相关研究或公司不存在。',
    'zh-Hant': '結果覆蓋 BioAI 日知已保存的記錄，不涵蓋整個網際網路。已驗證來源的原文記錄不等於編輯核驗事件。主題標籤可能來自自動關鍵詞匹配；請保留 classification.method 與發布狀態。沒有結果不證明相關研究或公司不存在。',
  },
  status: {
    en: 'verified identifies source ownership/review; enabled identifies collection permission. A source without last_success_at has no recorded successful collection. These fields do not certify peer review or scientific validity.',
    'zh-CN': 'verified 表示来源归属/审核状态；enabled 表示采集许可。没有 last_success_at 的来源没有已记录的成功采集。这些字段不认证同行评议或科学有效性。',
    'zh-Hant': 'verified 表示來源歸屬/審核狀態；enabled 表示採集許可。沒有 last_success_at 的來源沒有已記錄的成功採集。這些欄位不認證同行評議或科學有效性。',
  },
  interpretation: {
    en: 'display_labels are localized presentation only. IDs, keys, classification enums, dates, URLs, citation spans, and hashes retain their machine-readable meaning. PubMed indexing does not certify peer review; automated topic labels do not establish causality or clinical benefit.',
    'zh-CN': 'display_labels 仅为本地化展示。ID、字段键、分类枚举、日期、原始出处 URL、引文坐标和哈希保持机器可读含义。PubMed 收录不认证同行评议；自动主题标签不证明因果或临床获益。',
    'zh-Hant': 'display_labels 僅為本地化展示。ID、欄位鍵、分類列舉、日期、原始出處 URL、引文座標和雜湊保持機器可讀含義。PubMed 收錄不認證同行評議；自動主題標籤不證明因果或臨床獲益。',
  },
  missing: { en: 'This item is missing or is not publicly published.', 'zh-CN': '该条目不存在或尚未公开发布。', 'zh-Hant': '該條目不存在或尚未公開發布。' },
  unavailable: { en: 'Public data is temporarily unavailable. Retry later.', 'zh-CN': '公开数据暂不可用，请稍后重试。', 'zh-Hant': '公開資料暫不可用，請稍後重試。' },
});

// Values remain unchanged in the payload. Only this explicit controlled list
// receives a display label; unknown/free-form source text is never translated.
const LABELS = Object.freeze({
  publication_status: {
    source_record: ['来源原文记录', '來源原文記錄', 'Source record'],
    reviewed_event: ['已核验事件', '已核驗事件', 'Reviewed event'],
  },
  data_status: { directory_metadata: ['目录元数据', '目錄中繼資料', 'Directory metadata'] },
  event_type: {
    funding: ['融资', '融資', 'Funding'], partnership: ['合作', '合作', 'Partnership'], acquisition: ['并购', '併購', 'Acquisition'],
    licensing: ['许可', '許可', 'Licensing'], product: ['产品', '產品', 'Product'], clinical: ['临床', '臨床', 'Clinical'],
    regulatory: ['监管', '監管', 'Regulatory'], strategy: ['战略', '策略', 'Strategy'], paper: ['论文', '論文', 'Paper'],
    model: ['模型', '模型', 'Model'], dataset: ['数据集', '資料集', 'Dataset'], other: ['其他', '其他', 'Other'],
  },
  status: { preprint: ['预印本', '預印本', 'Preprint'], indexed: ['索引收录', '索引收錄', 'Indexed'], active: ['有效', '有效', 'Active'], inactive: ['停用', '停用', 'Inactive'] },
  verification_status: {
    verified: ['已验证', '已驗證', 'Verified'], unverified: ['未验证', '未驗證', 'Unverified'], pending: ['待验证', '待驗證', 'Pending verification'],
    manual_reviewed: ['人工已核验', '人工已核驗', 'Manually reviewed'], revoked: ['已撤销', '已撤銷', 'Revoked'],
  },
  model_form: {
    biological: ['生物实体模型', '生物實體模型', 'Biological model'], computational: ['计算模型', '計算模型', 'Computational model'],
    hybrid: ['混合模型', '混合模型', 'Hybrid model'], unspecified: ['未明确', '未明確', 'Unspecified'],
  },
  source_type: {
    homepage: ['官网', '官網', 'Official website'], newsroom: ['新闻室', '新聞室', 'Newsroom'], investor_relations: ['投资者关系', '投資者關係', 'Investor relations'],
    blog: ['博客', '網誌', 'Blog'], rss: ['RSS 订阅', 'RSS 訂閱', 'RSS'], sitemap: ['站点地图', '網站地圖', 'Sitemap'], social: ['社交账号', '社群帳號', 'Social account'],
    publications: ['研究来源', '研究來源', 'Research source'], academic_api: ['学术索引', '學術索引', 'Academic index'], preprint_api: ['预印本索引', '預印本索引', 'Preprint index'],
  },
});

export const TRACK_ALIASES = Object.freeze({
  'sequencing-multiomics': '测序与多组学', biopharma: '生物医药', 'ai-models-data': 'AI与模型数据', 'academic-research': '学术进展',
});
export const MCP_TRACKS = Object.freeze(['测序与多组学', '生物医药', 'AI与模型数据', '学术进展', ...Object.keys(TRACK_ALIASES)]);
export const mcpTrack = value => TRACK_ALIASES[value] || value;
export const mcpCopy = (key, language = 'en') => COPY[key][LANGUAGES.includes(language) ? language : 'en'];

function label(value, key, language) {
  const row = LABELS[key]?.[value];
  return row ? row[language === 'en' ? 2 : language === 'zh-Hant' ? 1 : 0] : null;
}
function decorate(value, language, origin) {
  if (Array.isArray(value)) return value.map(item => decorate(item, language, origin));
  if (!value || typeof value !== 'object') return value;
  const copy = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, decorate(child, language, origin)]));
  const labels = {};
  for (const key of Object.keys(LABELS)) {
    const translated = label(copy[key], key, language);
    if (translated) labels[key] = translated;
  }
  for (const key of ['track', 'region']) {
    if (typeof copy[key] === 'string') {
      const translated = controlledLabel(copy[key], language);
      if (translated !== copy[key] || language === 'zh-CN') labels[key] = translated;
    }
  }
  if (Array.isArray(copy.topics) && copy.topics.every(item => typeof item === 'string')) {
    labels.topics = copy.topics.map(id => TOPICS.find(topic => topic.id === id)).filter(Boolean).map(topic => {
      const localized = localizedTopic(topic, language); return {id:topic.id,label:localized.label};
    });
  }
  if (typeof copy.site_url === 'string') copy.site_url = languageUrl(copy.site_url, language, true, origin);
  if (Object.keys(labels).length) copy.display_labels = labels;
  return copy;
}

export function localizeMcpPayload(payload, requestedLanguage, origin, toolName) {
  const explicit = LANGUAGES.includes(requestedLanguage), language = explicit ? requestedLanguage : 'en';
  const output = explicit ? decorate(payload, language, origin) : {...payload};
  if (explicit) {
    output.coverage_note = mcpCopy('coverage', language);
    output.interpretation_note = mcpCopy('interpretation', language);
    if (output.data?.status_note) output.data.status_note = mcpCopy('status', language);
    if (output.data?.journal_policy) output.data.journal_policy = localizedJournalPolicy(output.data.journal_policy, language);
    // Resource/profile topics are stable ID strings. Only the source-status
    // tool's complete definition objects contain authored labels to translate.
    if (toolName === 'get_source_status' && Array.isArray(output.data?.topics)) {
      output.data.topics = output.data.topics.map(topic =>
        topic && typeof topic === 'object' && !Array.isArray(topic)
          && typeof topic.id === 'string' && typeof topic.label === 'string' && typeof topic.description === 'string'
          ? localizedTopic(topic, language) : topic);
    }
  }
  output.language = { requested_language: explicit ? requestedLanguage : null, presentation_language: explicit ? language : 'legacy', original_records: 'preserved', note: mcpCopy('original', language) };
  return output;
}
