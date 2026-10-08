import {EUROPE_PMC_JOURNAL_QUERY,PUBMED_JOURNAL_QUERY} from './journals.js';

// Topic labels describe article content, never legal ownership or a company's capabilities.
export const QUERY_VERSION = 'focus-2026-10-v2';
// Classification changes do not invalidate an in-flight retrieval checkpoint.
export const CLASSIFICATION_POLICY_VERSION = 'biomedical-focus-2026-10-v3';
export const TOPICS = Object.freeze([
  {id:'virtual-cell', label:'AI 虚拟细胞', description:'细胞状态、扰动响应与细胞基础模型'},
  {id:'organoid', label:'类器官', description:'生物类器官、类器官分析及计算模型'},
  {id:'virtual-embryo', label:'AI 虚拟胚胎', description:'胚胎发育的计算模型；生物胚胎模型单独标注'},
  {id:'virtual-organ', label:'AI 虚拟器官', description:'器官数字孪生、多尺度模拟与生理预测'},
  {id:'drug-discovery', label:'虚拟药物研发', description:'计算靶点发现、虚拟筛选与生成式药物设计'},
]);

const aiTerms = ['artificial intelligence','machine learning','deep learning','foundation model','neural network','transformer','language model','reinforcement learning','generative model','diffusion model','生成式','人工智能','机器学习','深度学习','基础模型','大模型'];
const cellTerms = ['virtual cell','virtual-cell','virtual biology','cell foundation model','single-cell foundation','single cell foundation','cellular foundation model','perturbation prediction','perturbation response prediction','虚拟细胞','虚拟生物学','细胞基础模型','细胞大模型','扰动预测','扰动响应预测'];
const cellModels = ['scgpt','scfoundation','geneformer'];
const molecularModels = ['alphafold','alphafold 3','alphafold3','rfdiffusion','rfdiffusion2','chai-1','boltz-1','boltz-2','proteinmpnn'];
const organoidTerms = ['organoid','assembloid','类器官','组装体'];
const embryoTerms = ['embryo','embryonic development','gastrulation','embryogenesis','胚胎','原肠胚'];
const biologicalEmbryoTerms = ['blastoid','gastruloid','embryoid','stem cell-based embryo','stem-cell-based embryo','stem cell based embryo','胚胎样体','类胚胎','胚胎模型'];
const virtualTerms = ['digital twin','virtual twin','virtual organ','virtual embryo','computational model','in silico','simulation','multiscale model','multi-scale model','数字孪生','虚拟器官','虚拟胚胎','计算模型','多尺度模拟'];
const organTerms = ['heart','cardiac','brain','liver','kidney','lung','organ','心脏','脑','肝','肾','肺','器官'];
const drugTerms = ['drug discovery','drug design','drug development','drug candidate','drug pipeline','drug target','virtual screening','target discovery','target identification','molecular design','de novo design','therapeutic design','antibody design','protein design','binding affinity','protein structure prediction','protein folding','structure-based drug','small molecule','therapeutic antibody','biopharmaceutical','pharmaceutical','药物发现','药物设计','药物研发','新药','创新药','候选药物','靶点发现','虚拟筛选','分子设计','抗体设计','蛋白设计','制药','生物医药'];
const computationalTerms = ['computational','digital twin','virtual twin','virtual cell','virtual embryo','virtual organ','in silico','simulation','generative','foundation model','prediction','计算','数字孪生','虚拟','模拟','生成式','基础模型','预测'];
const wetTerms = ['in vitro','organoid','assembloid','blastoid','gastruloid','embryoid','stem cell-derived','stem-cell-derived','organ-on-a-chip','organ on a chip','类器官','类胚胎','胚胎样体','体外培养','干细胞来源','器官芯片'];
const genericDesignTerms = ['molecular design','de novo design','binding affinity','small molecule','分子设计'];
const biomedicalDrugTerms = drugTerms.filter(term=>!genericDesignTerms.includes(term)).concat(['drug delivery','therapeutic delivery','drug release','drug response','drug absorption','drug distribution','drug metabolism','drug toxicity','drug combination','combination regimen','treatment regimen','nanomedicine','protein-ligand docking','protein ligand docking','protein fitness','protein sequence','protein modification','synthetic DNA','antigen receptor','protein binder','RNA-guided nuclease','genome editing','small-molecule function','药物递送','药物输送','药物释放','纳米药物']);
const molecularContext = /\b(?:protein\w*|antibod\w*|ligand\w*|receptor\w*|drug\w*|therapeutic\w*|pharma\w*)\b|蛋白|抗体|配体|受体|药物|医药/i;
const policyFraming = /\b(?:governance|polic(?:y|ies)|ethic\w*|contestab\w*|epistem\w*|accountab\w*|regulat\w*|responsib\w*)\b|科研治理|科研政策|科技政策|伦理|学术治理/i;
const materialApplication = /\b(?:plastics?|polymers?|batter(?:y|ies)|photocatal\w*|solar cells?|recycl\w*|petrochem\w*|rare[ -]earth separations?)\b|塑料|聚合物|电池|光催化|能源材料|石化|回收材料/i;
const researchClaim = /\bwe\s+(?:introduce|develop|present|design|train|predict|validate|evaluate|demonstrate|show|benchmark|propose|use|synthesize|synthesise|generate|engineer|address)\b|(?:本研究|我们|研究团队).{0,35}(?:构建|提出|设计|训练|预测|验证|评估)/i;
const cellContext = /\b(?:single[ -]cell|cellular states?|cell states?|spatial transcriptomics|gene expression|cell embeddings?)\b|单细胞|细胞状态|空间转录组/i;
const cellModelTask = /\b(?:model\w*|learning|predict\w*|representation\w*|embedding\w*|infer\w*|imput\w*|dimension reduction|segmentation|annotation|framework)\b|模型|预测|表示|推断/i;

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

function drugFocus(text) {
  return has(text,biomedicalDrugTerms)
    || (has(text,genericDesignTerms) && molecularContext.test(text))
    || (has(text,molecularModels) && molecularContext.test(text));
}

function topicFocus(topic,text) {
  const lower=text.toLowerCase();
  if(topic==='drug-discovery')return drugFocus(lower)||has(lower,['binding affinity prediction'])
    || (/\bproteins?\b|蛋白/i.test(text)&&/(?:design|engineer|modif|miniaturi|folding|structure|设计|工程|改造|结构)/i.test(text));
  if(topic==='virtual-cell')return has(lower,cellTerms)||has(lower,cellModels)
    || ((/\bscvi\b/i.test(text)||/\bSTATE\b/.test(text))&&/(?:perturbation|single[ -]cell|gene expression|扰动|细胞)/i.test(text))
    || (cellContext.test(text)&&cellModelTask.test(text))
    || (/(?:single[ -]cell|cellular|gene expression|细胞)/i.test(text)&&/(?:perturbation|扰动)/i.test(text)&&/(?:predict|model|预测|模型)/i.test(text));
  if(topic==='organoid')return has(lower,organoidTerms);
  if(topic==='virtual-embryo')return has(lower,embryoTerms);
  if(topic==='virtual-organ')return has(lower,organTerms)&&(has(lower,['digital twin','virtual twin','virtual organ','multiscale','multi-scale','physiological simulation','虚拟器官','数字孪生','生理模拟','多尺度'])||/(?:morphogen|physic|biomechan|hemodynamic|形态发生|生物力学)/i.test(text));
  return false;
}

function focusedBody(value) {
  const text=String(value).normalize('NFKC').slice(0,8000);
  // Source profiles are not evidence that the article itself studies a topic.
  const footer=text.search(/(?:^|[\n。.!?]\s*|\s{2,})(?:About\s+(?:the company|[A-Z][\w&-]+)|关\s*于\s*(?:公司|[\p{Script=Han}A-Z][\p{Script=Han}\w\s-]{1,30})|公司简介|Forward[- ]looking statements)/u);
  return footer<0?text:text.slice(0,footer);
}

export function classify(title='', abstract='') {
  const heading=String(title).normalize('NFKC').slice(0,1000),body=focusedBody(abstract);
  const original=heading+' '+body;
  const text=original.toLowerCase();
  const namedCellModel=has(text,cellModels);
  const predictiveCellContext=/(?:perturbation|cellular|single[ -]cell|gene expression|细胞|扰动)/i.test(text);
  const contextualCellModel=(/\bscvi\b/.test(text)||/\bSTATE\b/.test(original)) && predictiveCellContext && /(?:predict|generative|foundation|virtual|预测|生成|虚拟)/i.test(text);
  const namedMolecularModel=has(text,molecularModels) && /(?:protein|molecular|ligand|antibody|drug|蛋白|分子|配体|抗体|药物)/i.test(text);
  const ai=has(text,aiTerms) || namedCellModel || contextualCellModel || namedMolecularModel || /(?:\bai\b|ai4s|ai制药|ai药物|ai\s*[+×])/i.test(text);
  const computational=has(text,computationalTerms);
  const biological=has(text,wetTerms);
  let topic_ids=[];
  if (namedCellModel || contextualCellModel || (ai&&cellContext.test(text)&&cellModelTask.test(text)) || (has(text,cellTerms) && (ai || has(text,['虚拟细胞','perturbation prediction','perturbation response prediction'])))) topic_ids.push('virtual-cell');
  if (has(text,organoidTerms)) topic_ids.push('organoid');
  // A biological embryo model without a predictive/computational component is not a virtual embryo.
  const embryoDevelopment=has(text,['embryonic development','embryogenesis','gastrulation','morphogenesis','胚胎发育','原肠胚','形态发生']);
  const embryoDynamics=has(text,['generative','simulation','trajectory','cell fate','spatiotemporal','发育轨迹','细胞命运','模拟','生成']);
  if (has(text,embryoTerms) && (has(text,['virtual embryo','虚拟胚胎']) || (embryoDevelopment && (has(text,virtualTerms)||(ai && embryoDynamics))))) topic_ids.push('virtual-embryo');
  const organTwin=has(text,['digital twin','virtual twin','virtual organ','虚拟器官','数字孪生']);
  const organDynamics=has(text,['physiological','multiscale','multi-scale','simulation','hemodynamic','生理模拟','多尺度']);
  if (has(text,organTerms) && (organTwin || (ai && organDynamics && has(text,virtualTerms)))) topic_ids.push('virtual-organ');
  if (drugFocus(text) && (ai || has(text,['virtual screening','in silico','computational drug','计算药物','虚拟筛选']))) topic_ids.push('drug-discovery');
  const candidates=[...topic_ids],topic_evidence={};
  const sentences=[...new Set(body.split(/[。！？\n]|[.!?](?=\s|$)/u).map(sentence=>sentence.trim()).filter(Boolean))];
  const generalPolicy=policyFraming.test(heading)&&!candidates.some(topic=>topicFocus(topic,heading));
  const unrelatedMaterials=materialApplication.test(heading)&&!candidates.some(topic=>topicFocus(topic,heading));
  topic_ids=topic_ids.filter(topic=>{
    if(generalPolicy||unrelatedMaterials)return false;
    if(topicFocus(topic,heading)){topic_evidence[topic]='title';return true;}
    const relevantSentences=sentences.filter(sentence=>topicFocus(topic,sentence));
    if(relevantSentences.some(sentence=>researchClaim.test(sentence))){topic_evidence[topic]='explicit-research-claim';return true;}
    if(sentences.slice(0,2).some(sentence=>topicFocus(topic,sentence))&&sentences.some(sentence=>researchClaim.test(sentence))){
      topic_evidence[topic]='research-with-biomedical-introduction';return true;
    }
    if(relevantSentences.length>=2&&relevantSentences.length>=Math.ceil(sentences.length/2)){
      topic_evidence[topic]='multiple-focused-content-sentences';return true;
    }
    return false;
  });
  const model_form=biological && computational ? 'hybrid' : biological ? 'biological' : computational || (ai && topic_ids.length) ? 'computational' : 'unspecified';
  const biological_model=has(text,biologicalEmbryoTerms) ? 'stem_cell_based_embryo_model' : has(text,organoidTerms) ? 'organoid' : has(text,['organ-on-a-chip','organ on a chip','器官芯片']) ? 'organ_on_chip' : null;
  return {topic_ids,model_form,biological_model,ai_related:ai,in_scope:topic_ids.length>0,
    scope_reason:topic_ids.length?'substantive-topic-focus':generalPolicy?'general-ai-policy':unrelatedMaterials?'non-biomedical-materials':candidates.length?'incidental-topic-mention':'no-biomedical-model-topic',
    topic_evidence,method:'automated_keyword_v1',policy_version:CLASSIFICATION_POLICY_VERSION,query_version:QUERY_VERSION};
}

const aiQuery=['artificial intelligence','machine learning','deep learning','foundation model','neural network','language model','generative model','diffusion model'];
const scopeQueries=[
  [['virtual cell','cell foundation model','single-cell foundation model','perturbation prediction'],true],
  [['scGPT','scFoundation','Geneformer'],false],
  [['scVI'],true,['single-cell','single cell','perturbation']],
  [['STATE'],true,['perturbation']],
  [['organoid*','assembloid*'],true],
  [['virtual embryo','embryogenesis','embryonic development','gastrulation'],true],
  [['virtual organ','digital twin','virtual twin'],false],
  [['drug discovery','drug design','drug development','virtual screening','target discovery','molecular design','antibody design','protein design','protein structure prediction','protein folding','binding affinity'],true],
  [['AlphaFold','RFdiffusion','ProteinMPNN','Boltz-1','Boltz-2'],false],
];
const epmcTerm=t=>t.endsWith('*')?'TITLE_ABS:'+t:'TITLE_ABS:"'+t+'"';
const pubmedTerm=t=>t.endsWith('*')?t+'[Title/Abstract]':'"'+t+'"[Title/Abstract]';
function buildQuery(term) {
  const ai='('+aiQuery.map(term).join(' OR ')+')';
  return '('+scopeQueries.map(([terms,requireAi,context])=>'(('+terms.map(term).join(' OR ')+')'+(requireAi?' AND '+ai:'')+(context?' AND ('+context.map(term).join(' OR ')+')':'')+')').join(' OR ')+')';
}
export const FOCUSED_QUERY='SRC:MED AND NOT PUB_TYPE:Preprint AND '+EUROPE_PMC_JOURNAL_QUERY+' AND '+buildQuery(epmcTerm);
export const PUBMED_QUERY=buildQuery(pubmedTerm)+' AND '+PUBMED_JOURNAL_QUERY+' NOT "Preprint"[Publication Type]';
