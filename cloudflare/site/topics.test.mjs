import test from 'node:test';
import assert from 'node:assert/strict';
import {classify,FOCUSED_QUERY,PUBMED_QUERY,QUERY_VERSION,CLASSIFICATION_POLICY_VERSION} from './topics.js';

test('journal discovery queries require selected venues and exclude preprints',()=>{
  assert.ok(FOCUSED_QUERY.includes('SRC:MED'));
  assert.ok(!FOCUSED_QUERY.includes('SRC:PPR'));
  assert.ok(FOCUSED_QUERY.includes('NOT PUB_TYPE:Preprint'));
  assert.ok(FOCUSED_QUERY.includes('ISSN:2522-5839'));
  assert.ok(PUBMED_QUERY.includes('"1087-0156"[ISSN]'));
  assert.ok(PUBMED_QUERY.includes('NOT "Preprint"[Publication Type]'));
  assert.equal(QUERY_VERSION,'focus-2026-10-v2');
  assert.equal(CLASSIFICATION_POLICY_VERSION,'biomedical-focus-2026-10-v3');
});

test('general AI science policy and incidental protein examples never establish a biomedical research topic',()=>{
  const cases=[
    ['Making AI-supported science accountable','AlphaFold transformed protein structure prediction. RFdiffusion enabled antibody design. Researchers must be able to contest automated claims and evidence.'],
    ['AI is changing every field','AlphaFold improved protein structure prediction. Newer agents search literature and write code. Systems transform climate science and manufacturing. This essay discusses the governance of research.'],
    ['Advancing scientific infrastructure','Protein language models illustrate scientific progress. This commentary calls for democratic governance and reproducible claims.'],
  ];
  for(const [title,abstract] of cases){
    const row=classify(title,abstract);
    assert.equal(row.in_scope,false,title);assert.deepEqual(row.topic_ids,[],title);
    assert.equal(row.policy_version,CLASSIFICATION_POLICY_VERSION);
    assert.equal(row.query_version,'focus-2026-10-v2');
  }
});

test('true protein, cell, organoid and medical delivery research remains in scope',()=>{
  const cases=[
    ['A scalable generative framework','We develop a neural network for protein design and therapeutic antibody binding affinity.','drug-discovery'],
    ['Generalizable learning across experiments','A foundation model predicts single-cell perturbation responses. The cell foundation model captures gene expression.','virtual-cell'],
    ['AI designs polymer biomaterials for drug delivery','We design therapeutic delivery nanoparticles and validate controlled drug release.','drug-discovery'],
    ['Machine learning controls hydrogel drug release','A neural network designs biomaterials for drug delivery.','drug-discovery'],
    ['Organoid disease models','Patient-derived organoids enable in vitro research.','organoid'],
    ['Protein structure prediction with AlphaFold','A neural network predicts protein folding.','drug-discovery'],
    ['Learning protein fitness landscapes','A neural network evaluates protein sequences and experimental fitness.','drug-discovery'],
    ['A general sequence framework','Protein modification is essential to therapeutic design. We introduce a diffusion model that generates diverse variants and validate experimental activity.','drug-discovery'],
    ['RNA-guided nuclease engineering','We use a protein language model to engineer genome editing activity.','drug-discovery'],
    ['Single-cell representation learning','We introduce a deep learning framework that predicts gene expression and cell states.','virtual-cell'],
    ['Selection and prioritization of candidate combination regimens for the treatment of tuberculosis','A machine learning model predicts the efficacy of drug combinations in disease models.','drug-discovery'],
  ];
  for(const [title,abstract,topic] of cases){
    const row=classify(title,abstract);assert.equal(row.in_scope,true,title);assert.ok(row.topic_ids.includes(topic),title);
  }
  assert.deepEqual(classify('Generative molecular design for recyclable polymers','AI predicts polymer properties. About Future Bio The company also develops AI drug discovery workflows.').topic_ids,[]);
  assert.equal(classify('Advances in polymers','New methods recycle plastic materials. About Example The company uses machine learning for protein design and drug discovery.').in_scope,false);
});

test('AI biopharma topics include molecular foundations with explicit biological context',()=>{
  for(const [title,abstract] of [
    ['Accurate protein structure prediction with AlphaFold','Protein folding and ligand interactions'],
    ['De novo protein design with RFdiffusion','Designing therapeutic antibodies'],
    ['Protein language models accelerate drug development','Target identification and binding affinity'],
    ['AI pharma partnership launches a drug pipeline','Biopharmaceutical therapeutic development'],
  ]) {
    const result=classify(title,abstract);
    assert.equal(result.ai_related,true,title);
    assert.ok(result.topic_ids.includes('drug-discovery'),title);
  }
  assert.deepEqual(classify('Diffusion model for weather forecasting','Atmospheric dynamics').topic_ids,[]);
  assert.deepEqual(classify('The alphafold convention in a word game','Office competition').topic_ids,[]);
});

test('wet-lab organoid articles retain their biological label but never imply AI relevance',()=>{
  const basic=classify('Stem cell-derived liver organoids','In vitro culture for disease biology');
  assert.deepEqual(basic.topic_ids,['organoid']);
  assert.equal(basic.ai_related,false);
  assert.equal(basic.model_form,'biological');
  const model=classify('Deep learning predicts organoid drug responses','Machine learning for patient-derived organoids');
  assert.equal(model.ai_related,true);assert.ok(model.topic_ids.includes('organoid'));
});

test('AI virtual biology initiatives retain their cell-model topic without an invented drug-discovery topic',()=>{
  const result=classify('Isomorphic Labs joins the Virtual Biology Initiative to build foundational data for AI models to predict and treat disease',
    'Convened by Biohub, participating organisations are investing funding, data, computation and new measurement technology');
  assert.equal(result.ai_related,true);
  assert.deepEqual(result.topic_ids,['virtual-cell']);
  assert.deepEqual(classify('A virtual biology classroom','Students play educational games').topic_ids,[]);
});
