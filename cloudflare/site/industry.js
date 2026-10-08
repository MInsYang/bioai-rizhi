/** Conservative topical admission; this is never editorial fact verification. */
const AI = /\b(?:AI|artificial intelligence|machine learning|deep learning|generative|foundation models?|in silico|computational (?:drug|biology|design)|AlphaFold\w*|RFdiffusion\w*|ProteinMPNN|scGPT|Geneformer)\b|人工智能|生成式|大模型|机器学习|AI制药/i;
// Biology, molecular, cell and 生物/分子 alone also occur in plastics, energy and
// general chemistry. Admission requires a concrete life-science application.
const BIO = /\b(?:biopharma\w*|pharma\w*|drugs?|therapeutic\w*|medicin\w*|oncolog\w*|antibod\w*|genom\w*|proteomic\w*|transcriptomic\w*|metabolomic\w*|neuroscience|immunolog\w*|organoid\w*|assembloid\w*|clinical (?:trials?|studies|development|candidates?|pipeline)|protein (?:design|engineering|structure|folding|prediction|degradation)|molecular glues?|single[ -]cell|cell (?:therapy|states?|perturbation|foundation model)|gene (?:expression|editing)|virtual (?:biology|cells?|organs?|embryos?)|biological foundation models?|disease models?|embryonic development|embryo models?|organ[ -]on[ -](?:a[ -])?chip|computational biology|IND[ -]enabling)\b|生物医药|生物制药|制药|医药|药物|新药|靶点|治疗|抗体|临床(?:试验|研究|开发|管线)|蛋白(?:质)?(?:设计|工程|结构|预测|折叠|降解)|分子胶|单细胞|细胞(?:治疗|状态|扰动|基础模型|大模型)|虚拟(?:生物学|细胞|器官|胚胎)|类器官|胚胎(?:发育|模型)|(?:心脏|脑|肝|肾|肺|器官)(?:芯片|数字孪生|生理模拟)|基因(?:组|表达|编辑)|组学/i;
const ORGAN_TWIN = /\b(?:heart|cardiac|liver|kidney|lung|brain|organ)\b.{0,40}\b(?:digital|virtual) twins?\b|\b(?:digital|virtual)\b.{0,40}\b(?:heart|cardiac|liver|kidney|lung|brain|organ)\b.{0,20}\btwins?\b|\b(?:digital|virtual) twins?\b.{0,40}\b(?:heart|cardiac|liver|kidney|lung|brain|organ)\b/i;
const NON_BIOMEDICAL = /\b(?:plastics?|polymers?|petrochem\w*|batter(?:y|ies)|semiconductors?|solar|biofuels?|fossil fuels?|fuel (?:production|storage)|(?:renewable|clean) energy|energy (?:storage|materials|sector|industry|production|generation)|gaming|cryptocurrency|material(?:s)? (?:design|discovery|manufacturing)|chemical manufacturing|industrial recycling)\b|塑料|塑胶|聚合物|可循环材料|材料(?:设计|研发|制造)|石化|化工|能源|电池|半导体|光伏|燃料|工业回收|电子游戏|加密货币/i;
// Medical materials and therapeutic protein design must survive the sector veto.
const BIOMEDICAL_APPLICATION = /\b(?:drugs?|pharma\w*|biopharma\w*|therapeutic\w*|medicin\w*|cancer|oncolog\w*|clinical trials?|vaccines?|tissue (?:engineering|regeneration)|organ[ -]on[ -](?:a[ -])?chip)\b|药物|新药|医药|制药|治疗|肿瘤|癌症|临床试验|疫苗|组织工程|组织再生|器官芯片/i;
const BOILERPLATE = /(?:^|[\n\r。.!?]\s*|\s{2,})(?:[Aa]bout\s+(?:the\s+company|[A-Z][\w&-]*(?:\s+[A-Z][\w&-]*){0,4})|关\s*于\s*(?:我们|本公司|[^\s:：，。！？\n]{1,30}))(?=[:：\s(（]|$)/;
const COMPANY_BIO = /\b(?:is|are) (?:a|an|the|one of)\b.{0,160}\b(?:company|leader|biotech(?:nology)?|platform)\b|\b(?:company|we)\s+(?:focus(?:es)? on|speciali[sz]es? in|is dedicated to)\b|是一家|公司简介|企业简介|(?:公司|企业|我们).{0,25}(?:专注于|致力于|聚焦于)/i;
const ANNOUNCEMENT = /\b(?:announc\w*|today|launched|launches|unveiled|introduces|introduced|completed|signed|raised|secured)\b|宣布|发布|达成|签署|完成融资/i;
const TYPES = {
  partnership: /\b(?:collaborat\w*|partner\w*|alliance|agreement)\b|合作|战略联盟/i,
  funding: /\b(?:financing|funding|raises?|raised|series [a-f]|investment|invests?)\b|融资|投资|募资/i,
  acquisition: /\b(?:acquir\w*|acquisition|merger)\b|收购|并购/i,
  licensing: /\b(?:licens\w*|rights agreement)\b|\b(?:options|optioned)\b.{0,60}\b(?:target|candidate|program)\b|授权|许可/i,
  clinical: /\b(?:clinical|trial|phase [123I]+|first patient)\b|临床|首例患者/i,
  regulatory: /\b(?:FDA|approval|regulatory|IND)\b|获批|监管|批准/i,
  product: /\b(?:launch\w*|unveil\w*|introduc\w*|platform|model|release)\b|发布|平台|模型/i,
  strategy: /\b(?:expansion|expand\w*|opens?|center|centre|laboratory|lab)\b|布局|扩建|中心|实验室/i,
};

const ROUTINE = /(?:investor|investment|healthcare|health care) conferences?|quarter(?:ly)? (?:financial )?results|earnings (?:call|release)|inducement (?:grants?|awards?)|dividend|shareholder meeting|年度股东大会|财务业绩|业绩发布会|投资者会议/i;
const SUBSTANTIVE = /collaborat|partners? with|partnership|licens|acquir|acquisition|raises?|funding|financing|first patient|phase [123I]|FDA|IND clearance|\b(?:options|optioned)\b.{0,60}\b(?:target|candidate|program)\b|合作|授权|收购|融资|首例患者|临床试验/i;
function articleLead(content) {
  const text = String(content || '').normalize('NFKC').slice(0, 100_000)
    .replace(/<\/(?:p|div|h[1-6])>/gi, '\n').replace(/<[^>]*>/g, ' ');
  const boilerplate = text.search(BOILERPLATE);
  const body = boilerplate < 0 ? text : text.slice(0, boilerplate);
  // RSS often flattens paragraphs. A bounded opening still prevents a footer or
  // a late anecdote from redefining the article's main subject.
  const sentences = (body.match(/[^.!?。！？\n]+[.!?。！？]?/g) || [])
    .filter(sentence => sentence.trim().length >= 12);
  const opening = sentences.slice(0, 4);
  const substantive = opening.filter(sentence => !COMPANY_BIO.test(sentence) || ANNOUNCEMENT.test(sentence));
  const bodyAi = sentences.some(sentence => AI.test(sentence) && (!COMPANY_BIO.test(sentence) || ANNOUNCEMENT.test(sentence)));
  return {text: substantive.join(' ').slice(0, 1200), body_ai: bodyAi, boilerplate_truncated: boilerplate >= 0};
}
export function classifyIndustry(title, content, config = {}) {
  const headline = String(title || '').normalize('NFKC').slice(0, 1000);
  const lead = articleLead(content);
  const focus = `${headline}\n${lead.text}`;
  const official = config.official_industry_source === true;
  const identity = official && config.ai_biopharma_identity_verified === true;
  const biomedical = BIO.test(focus) || ORGAN_TWIN.test(focus);
  const nonBiomedical = NON_BIOMEDICAL.test(focus) && !BIOMEDICAL_APPLICATION.test(focus);
  const openingAi = AI.test(focus);
  const explicit = (openingAi || lead.body_ai) && biomedical && !nonBiomedical;
  // Event type must be present in the headline, not a clinical-stage company boilerplate.
  const event_types = Object.entries(TYPES).filter(([, rule]) => rule.test(headline)).map(([key]) => key);
  const routine = ROUTINE.test(headline) && !SUBSTANTIVE.test(headline);
  const transaction = event_types.some(type => ['partnership','funding','acquisition','licensing'].includes(type));
  // Specialist identity supports its actual business updates, never unrelated
  // material/energy projects or a generic corporate model/platform headline.
  const identityAdmission = identity && !nonBiomedical && (transaction || (biomedical && event_types.length > 0));
  const relevant = official && !routine && (explicit || identityAdmission);
  const admission_reason = !official ? 'not-official-industry-source' : routine ? 'routine-notice'
    : nonBiomedical ? 'non-biomedical-subject' : explicit ? (openingAi ? 'explicit-ai-biomedical-opening' : 'biomedical-opening-with-ai-method-in-body')
    : identityAdmission ? (transaction ? 'verified-specialist-transaction' : 'verified-specialist-biomedical-update')
    : 'no-substantive-ai-biomedical-opening';
  return {
    relevant,
    ai_related: explicit || identityAdmission,
    event_types,
    method: 'official-source-and-keyword-rules',
    version: 'industry-relevance-v3',
    admission_reason,
    subject_focus: nonBiomedical ? 'non-biomedical' : biomedical ? 'biomedical' : 'unspecified',
    ai_basis: explicit ? (openingAi ? 'opening' : 'substantive-body') : identityAdmission ? 'verified-specialist' : null,
    boilerplate_truncated: lead.boilerplate_truncated,
    routine_notice: routine,
    identity_basis: identityAdmission && !explicit ? 'dated-official-company-evidence' : 'explicit-ai-and-biomedical-terms',
    review_status: 'unreviewed',
  };
}
