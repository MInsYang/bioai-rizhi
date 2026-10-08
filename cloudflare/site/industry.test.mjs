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
});
