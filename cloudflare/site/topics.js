// Topic labels describe article content, never legal ownership or a company's capabilities.
export const QUERY_VERSION = 'focus-2026-10-v1';
export const TOPICS = Object.freeze([
  {id:'virtual-cell', label:'AI 虚拟细胞', description:'细胞状态、扰动响应与细胞基础模型'},
  {id:'organoid', label:'类器官', description:'生物类器官、类器官分析及计算模型'},
  {id:'virtual-embryo', label:'AI 虚拟胚胎', description:'胚胎发育的计算模型；生物胚胎模型单独标注'},
  {id:'virtual-organ', label:'AI 虚拟器官', description:'器官数字孪生、多尺度模拟与生理预测'},
  {id:'drug-discovery', label:'虚拟药物研发', description:'计算靶点发现、虚拟筛选与生成式药物设计'},
]);

const aiTerms = ['artificial intelligence','machine learning','deep learning','foundation model','neural network','transformer','generative model','diffusion model','生成式','人工智能','机器学习','深度学习','基础模型','大模型'];
const cellTerms = ['virtual cell','virtual-cell','cell foundation model','single-cell foundation','single cell foundation','cellular foundation model','perturbation prediction','perturbation response prediction','虚拟细胞','细胞基础模型','细胞大模型','扰动预测','扰动响应预测'];
const cellModels = ['scgpt','scfoundation','geneformer'];
const organoidTerms = ['organoid','assembloid','类器官','组装体'];
const embryoTerms = ['embryo','embryonic development','gastrulation','embryogenesis','胚胎','原肠胚'];
const biologicalEmbryoTerms = ['blastoid','gastruloid','embryoid','stem cell-based embryo','stem-cell-based embryo','stem cell based embryo','胚胎样体','类胚胎','胚胎模型'];
const virtualTerms = ['digital twin','virtual twin','virtual organ','virtual embryo','computational model','in silico','simulation','multiscale model','multi-scale model','数字孪生','虚拟器官','虚拟胚胎','计算模型','多尺度模拟'];
const organTerms = ['heart','cardiac','brain','liver','kidney','lung','organ','心脏','脑','肝','肾','肺','器官'];
const drugTerms = ['drug discovery','drug design','drug development','virtual screening','target discovery','target identification','molecular design','de novo design','therapeutic design','antibody design','protein design','binding affinity','药物发现','药物设计','药物研发','新药','创新药','候选药物','靶点发现','虚拟筛选','分子设计','抗体设计','蛋白设计','制药'];
const computationalTerms = ['computational','digital twin','virtual twin','virtual cell','virtual embryo','virtual organ','in silico','simulation','generative','foundation model','prediction','计算','数字孪生','虚拟','模拟','生成式','基础模型','预测'];
const wetTerms = ['in vitro','organoid','assembloid','blastoid','gastruloid','embryoid','stem cell-derived','stem-cell-derived','organ-on-a-chip','organ on a chip','类器官','类胚胎','胚胎样体','体外培养','干细胞来源','器官芯片'];

const patterns=new Map();
function has(text, terms) {
  return terms.some(term => {
    if (/^[a-z ]+$/.test(term)) {
      if(!patterns.has(term))patterns.set(term,new RegExp('\\b'+term.replace(/ /g,'[\\s-]+')+'(?:s)?\\b','i'));
      return patterns.get(term).test(text);
    }
    return text.includes(term);
  });
}

export function classify(title='', abstract='') {
  const original=(String(title)+' '+String(abstract)).normalize('NFKC').slice(0,100_000);
  const text=original.toLowerCase();
  const namedCellModel=has(text,cellModels);
  const predictiveCellContext=/(?:perturbation|cellular|single[ -]cell|gene expression|细胞|扰动)/i.test(text);
  const contextualCellModel=(/\bscvi\b/.test(text)||/\bSTATE\b/.test(original)) && predictiveCellContext && /(?:predict|generative|foundation|virtual|预测|生成|虚拟)/i.test(text);
  const ai=has(text,aiTerms) || namedCellModel || contextualCellModel || /(?:\bai\b|ai4s|ai制药|ai药物|ai\s*[+×])/i.test(text);
  const computational=has(text,computationalTerms);
  const biological=has(text,wetTerms);
  const topic_ids=[];
  if (namedCellModel || contextualCellModel || (has(text,cellTerms) && (ai || has(text,['虚拟细胞','perturbation prediction','perturbation response prediction'])))) topic_ids.push('virtual-cell');
  if (has(text,organoidTerms)) topic_ids.push('organoid');
  // A biological embryo model without a predictive/computational component is not a virtual embryo.
  const embryoDevelopment=has(text,['embryonic development','embryogenesis','gastrulation','morphogenesis','胚胎发育','原肠胚','形态发生']);
  const embryoDynamics=has(text,['generative','simulation','trajectory','cell fate','spatiotemporal','发育轨迹','细胞命运','模拟','生成']);
  if (has(text,embryoTerms) && (has(text,['virtual embryo','虚拟胚胎']) || (embryoDevelopment && (has(text,virtualTerms)||(ai && embryoDynamics))))) topic_ids.push('virtual-embryo');
  const organTwin=has(text,['digital twin','virtual twin','virtual organ','虚拟器官','数字孪生']);
  const organDynamics=has(text,['physiological','multiscale','multi-scale','simulation','hemodynamic','生理模拟','多尺度']);
  if (has(text,organTerms) && (organTwin || (ai && organDynamics && has(text,virtualTerms)))) topic_ids.push('virtual-organ');
  if (has(text,drugTerms) && (ai || has(text,['virtual screening','in silico','computational drug','计算药物','虚拟筛选']))) topic_ids.push('drug-discovery');
  const model_form=biological && computational ? 'hybrid' : biological ? 'biological' : computational || (ai && topic_ids.length) ? 'computational' : 'unspecified';
  const biological_model=has(text,biologicalEmbryoTerms) ? 'stem_cell_based_embryo_model' : has(text,organoidTerms) ? 'organoid' : has(text,['organ-on-a-chip','organ on a chip','器官芯片']) ? 'organ_on_chip' : null;
  return {topic_ids,model_form,biological_model,ai_related:ai,method:'automated_keyword_v1',query_version:QUERY_VERSION};
}

const aiQuery=['artificial intelligence','machine learning','deep learning','foundation model','neural network','generative model','diffusion model'];
const scopeQueries=[
  [['virtual cell','cell foundation model','single-cell foundation model','perturbation prediction'],true],
  [['scGPT','scFoundation','Geneformer'],false],
  [['scVI'],true,['single-cell','single cell','perturbation']],
  [['STATE'],true,['perturbation']],
  [['organoid*','assembloid*'],false],
  [['virtual embryo','embryogenesis','embryonic development','gastrulation'],true],
  [['virtual organ','digital twin','virtual twin'],false],
  [['drug discovery','drug design','virtual screening','target discovery','molecular design','antibody design','protein design'],true],
];
const epmcTerm=t=>t.endsWith('*')?'TITLE_ABS:'+t:'TITLE_ABS:"'+t+'"';
const pubmedTerm=t=>t.endsWith('*')?t+'[Title/Abstract]':'"'+t+'"[Title/Abstract]';
function buildQuery(term) {
  const ai='('+aiQuery.map(term).join(' OR ')+')';
  return '('+scopeQueries.map(([terms,requireAi,context])=>'(('+terms.map(term).join(' OR ')+')'+(requireAi?' AND '+ai:'')+(context?' AND ('+context.map(term).join(' OR ')+')':'')+')').join(' OR ')+')';
}
export const FOCUSED_QUERY='(SRC:MED OR SRC:PPR) AND '+buildQuery(epmcTerm);
export const PUBMED_QUERY=buildQuery(pubmedTerm);
