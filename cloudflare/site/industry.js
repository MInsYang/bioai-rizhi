/** Conservative topical admission; this is never editorial fact verification. */
const AI = /\b(?:AI|artificial intelligence|machine learning|deep learning|generative|foundation models?|in silico|computational (?:drug|biology|design))\b|人工智能|生成式|大模型|机器学习|AI制药/i;
const BIO = /\b(?:biopharma\w*|pharma\w*|drug\w*|therapeutic\w*|clinical|medicin\w*|biolog\w*|protein\w*|molecular|genomic\w*|oncolog\w*|cell\w*|organoid\w*)\b|制药|医药|药物|临床|蛋白|分子|生物|类器官|细胞/i;
const TYPES = {
  partnership: /\b(?:collaborat\w*|partner\w*|alliance|agreement)\b|合作|战略联盟/i,
  funding: /\b(?:financing|funding|raises?|raised|series [a-f]|investment|invests?)\b|融资|投资|募资/i,
  acquisition: /\b(?:acquir\w*|acquisition|merger)\b|收购|并购/i,
  licensing: /\b(?:licens\w*|rights agreement)\b|授权|许可/i,
  clinical: /\b(?:clinical|trial|phase [123I]+|first patient)\b|临床|首例患者/i,
  regulatory: /\b(?:FDA|approval|regulatory|IND)\b|获批|监管|批准/i,
  product: /\b(?:launch\w*|unveil\w*|introduc\w*|platform|model|release)\b|发布|平台|模型/i,
  strategy: /\b(?:expansion|expand\w*|opens?|center|centre|laboratory|lab)\b|布局|扩建|中心|实验室/i,
};

const ROUTINE = /(?:investor|investment|healthcare|health care) conferences?|quarter(?:ly)? (?:financial )?results|earnings (?:call|release)|inducement (?:grants?|awards?)|dividend|shareholder meeting|年度股东大会|财务业绩|业绩发布会|投资者会议/i;
const SUBSTANTIVE = /collaborat|partners? with|partnership|licens|acquir|acquisition|raises?|funding|financing|first patient|phase [123I]|FDA|IND clearance|合作|授权|收购|融资|首例患者|临床试验/i;
export function classifyIndustry(title, content, config = {}) {
  const text = `${title || ''}\n${content || ''}`;
  const official = config.official_industry_source === true;
  const identity = official && config.ai_biopharma_identity_verified === true;
  const explicit = AI.test(text) && BIO.test(text);
  // Event type must be present in the headline, not a clinical-stage company boilerplate.
  const event_types = Object.entries(TYPES).filter(([, rule]) => rule.test(title || '')).map(([key]) => key);
  const routine = ROUTINE.test(title || '') && !SUBSTANTIVE.test(title || '');
  return {
    relevant: official && !routine && (explicit || (identity && event_types.length > 0)),
    ai_related: explicit || (identity && event_types.length > 0),
    event_types,
    method: 'official-source-and-keyword-rules',
    version: 'industry-relevance-v2',
    routine_notice: routine,
    identity_basis: identity ? 'dated-official-company-evidence' : 'explicit-ai-and-biomedical-terms',
    review_status: 'unreviewed',
  };
}
