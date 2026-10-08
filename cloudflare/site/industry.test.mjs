import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyIndustry } from './industry.js';

test('generic technology and pharmaceutical feeds require both AI and biomedical relevance', () => {
  const config = {official_industry_source:true};
  assert.equal(classifyIndustry('NVIDIA launches gaming AI', 'New graphics models', config).relevant, false);
  assert.equal(classifyIndustry('Pharma announces routine dividend', 'Company news', config).relevant, false);
  assert.equal(classifyIndustry('Lilly and NVIDIA partner on AI drug discovery', '', config).relevant, true);
  assert.equal(classifyIndustry('Organoid laboratory opens', 'New biology study', config).relevant, false);
});
test('verified specialist identity permits its financing updates without inventing approved events', () => {
  const r=classifyIndustry('Company raises Series B financing', '', {official_industry_source:true,ai_biopharma_identity_verified:true});
  assert.equal(r.relevant,true); assert.ok(r.event_types.includes('funding'));
  assert.equal(r.review_status,'unreviewed');
  assert.equal(classifyIndustry('Company raises financing', '', {ai_biopharma_identity_verified:true}).relevant,false);
});

test('routine investor notices and company boilerplate cannot become clinical candidates', () => {
 const config={official_industry_source:true,ai_biopharma_identity_verified:true};
 const boilerplate='Absci is a clinical-stage AI drug discovery company with collaboration partners.';
 const result=classifyIndustry('Absci to Participate in Upcoming Investor Conferences',boilerplate,config);
 assert.equal(result.relevant,false);assert.deepEqual(result.event_types,[]);
 assert.equal(classifyIndustry('Absci announces new partnership',boilerplate,config).relevant,true);
 assert.deepEqual(classifyIndustry('Our story',boilerplate,config).event_types,[]);
 assert.equal(classifyIndustry('Our story',boilerplate,config).relevant,false);
});

// Original short paraphrases of the two observed false positives. These are
// classification fixtures, not news content and are never inserted in the site.
test('recycled plastics cannot enter through a footer AI company introduction', () => {
 const title='新型塑料可按温度分解，生物制造降低回收成本';
 const content='研究团队用生物制造开发可循环塑料。材料可拆解回收，面向工业包装。分子结构决定聚合物性能。\n关于赋澈生物\n公司用AI和生物制造开发可循环材料。';
 for(const identity of [false,true]) {
  const result=classifyIndustry(title,content,{official_industry_source:true,ai_biopharma_identity_verified:identity});
  assert.equal(result.relevant,false);assert.equal(result.admission_reason,'non-biomedical-subject');
  assert.equal(result.boilerplate_truncated,true);
 }
});

test('general chemistry commentary is not admitted by a late drug example or AI paragraph', () => {
 const title='诺奖与手性：从发现化学规律到设计规律';
 const content='本文回顾不对称有机合成的科学历史。手性描述分子空间排列中的镜像差别。催化过程可以放大产物的方向偏好。实验体现了一般化学反应规律。随后文章举药物治疗为应用例子，并在结尾讨论AI分子设计。';
 const result=classifyIndustry(title,content,{official_industry_source:true,ai_biopharma_identity_verified:true});
 assert.equal(result.relevant,false);assert.equal(result.admission_reason,'no-substantive-ai-biomedical-opening');
});

test('generic molecular or biological terms do not establish a biomedical subject', () => {
 const config={official_industry_source:true};
 for(const [title,body] of [
  ['AI molecular design for industrial chemistry','A new computational platform predicts molecular reactions.'],
  ['AI designs polymers using biological manufacturing','Cells produce recyclable plastic for packaging.'],
  ['AI biotech company launches battery discovery','Biological catalysts improve energy storage.'],
  ['生成式AI用于化工分子设计','生物制造可以改善工业燃料成本。'],
 ]) assert.equal(classifyIndustry(title,body,config).relevant,false,title);
});

test('medical delivery materials, protein design and core life-science applications remain in scope', () => {
 const config={official_industry_source:true};
 for(const [title,body] of [
  ['AI designs polymers for targeted drug delivery','The new material carries cancer drugs into cells.'],
  ['机器学习设计药物递送材料','聚合物载体用于肿瘤治疗并改善药物释放。'],
  ['Generative AI platform for protein design','The system predicts protein structures and engineers new sequences.'],
  ['AI protein design with free-energy optimization','The model predicts protein folding and binding energetics.'],
  ['RFdiffusion advances therapeutic protein design','Protein candidates are designed for cancer treatment.'],
  ['AI single-cell foundation model released','The model predicts gene expression after perturbation.'],
  ['AI organoid discovery platform launched','Researchers use organoids for drug screening.'],
  ['AI models virtual embryos','The computational model predicts embryonic development.'],
  ['AI digital twins of the heart','The model simulates cardiac physiology.'],
 ]) assert.equal(classifyIndustry(title,body,config).relevant,true,title);
});

test('specialist scientific terms and later substantive AI methods retain real biomedical updates', () => {
 const config={official_industry_source:true,ai_biopharma_identity_verified:true};
 const vbi=classifyIndustry('Isomorphic Labs joins the Virtual Biology Initiative to build foundational data for AI models to predict and treat disease',
  'Participants contribute data and measurement methods for predictive models of human disease.',config);
 assert.equal(vbi.relevant,true);assert.equal(vbi.subject_focus,'biomedical');
 const molecularGlue=classifyIndustry('分子胶管线公布进展','药物项目针对自身免疫相关靶点。团队先检验候选分子的活性。这些实验提供进一步开发的数据。平台随后挑选下一批分子。研究人员训练AI模型，判断蛋白组合的优先级。',{official_industry_source:true});
 assert.equal(molecularGlue.relevant,true);assert.equal(molecularGlue.ai_basis,'substantive-body');
 assert.equal(classifyIndustry('Drug pipeline enters IND-enabling studies','The therapeutic program completes safety studies. Manufacturing research will guide formulation. More data will support the next stage. Researchers review the experimental results. AI models guide further drug design.',{official_industry_source:true}).relevant,true);
 const option=classifyIndustry('Company Reports Quarterly Financial Results; Partner Options First Neuroscience Target into Discovery Program','',config);
 assert.equal(option.relevant,true);assert.equal(option.routine_notice,false);assert.ok(option.event_types.includes('licensing'));
});

test('verified identity admits real deal headlines but cannot override a competing sector', () => {
 const config={official_industry_source:true,ai_biopharma_identity_verified:true};
 assert.equal(classifyIndustry('Company raises Series C funding','',config).relevant,true);
 assert.equal(classifyIndustry('Company enters strategic collaboration','',config).relevant,true);
 assert.equal(classifyIndustry('Company raises funding for plastic recycling','AI will optimize industrial polymers.',config).relevant,false);
 assert.equal(classifyIndustry('Company partners on solar energy','A new AI chemistry laboratory.',config).relevant,false);
 assert.equal(classifyIndustry('Company launches general research platform','Automating chemistry research.',config).relevant,false);
 assert.equal(classifyIndustry('Company launches drug discovery platform','A new therapeutic discovery service.',config).relevant,true);
});

test('footer removal works for short English and flattened Chinese source summaries', () => {
 const config={official_industry_source:true};
 const title='Company celebrates a local community event';
 assert.equal(classifyIndustry(title,'Employees met at a community gathering. About Example Bio\nExample Bio is an AI drug discovery company.',config).relevant,false);
 const result=classifyIndustry(title,'企业员工共同参加社区活动，介绍了当地公益项目。 关 于示例生物 示例生物采用人工智能开展药物设计。',config);
 assert.equal(result.relevant,false);assert.equal(result.boilerplate_truncated,true);
 assert.equal(classifyIndustry(title,'A community event brought local employees together. '+('The organizers thanked visitors for joining this annual celebration. '.repeat(15))+'AI drug discovery is part of the company background.',config).relevant,false);
 assert.equal(classifyIndustry('药物项目进展','临床团队完成本轮随访，正在整理研究记录。公司专注于人工智能与药物研发。',config).relevant,false);
});
