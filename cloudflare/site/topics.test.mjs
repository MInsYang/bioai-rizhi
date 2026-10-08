import test from 'node:test';
import assert from 'node:assert/strict';
import {classify,FOCUSED_QUERY,PUBMED_QUERY,QUERY_VERSION} from './topics.js';

test('journal discovery queries require selected venues and exclude preprints',()=>{
  assert.ok(FOCUSED_QUERY.includes('SRC:MED'));
  assert.ok(!FOCUSED_QUERY.includes('SRC:PPR'));
  assert.ok(FOCUSED_QUERY.includes('NOT PUB_TYPE:Preprint'));
  assert.ok(FOCUSED_QUERY.includes('ISSN:2522-5839'));
  assert.ok(PUBMED_QUERY.includes('"1087-0156"[ISSN]'));
  assert.ok(PUBMED_QUERY.includes('NOT "Preprint"[Publication Type]'));
  assert.equal(QUERY_VERSION,'focus-2026-10-v2');
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
