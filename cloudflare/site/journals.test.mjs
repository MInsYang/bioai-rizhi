import test from 'node:test';
import assert from 'node:assert/strict';
import {JOURNAL_POLICY_VERSION,SELECTED_JOURNALS,journalPolicy,normalizeISSN,selectJournal,selectedJournalSQL} from './journals.js';

test('selected journals are an explicit versioned list with unique valid ISSNs and original links',()=>{
  assert.equal(SELECTED_JOURNALS.length,17);
  const ids=new Set(),issns=new Set();
  for(const journal of SELECTED_JOURNALS) {
    assert.ok(!ids.has(journal.id));ids.add(journal.id);
    assert.equal(new URL(journal.url).protocol,'https:');
    for(const issn of journal.issns) {
      assert.equal(normalizeISSN(issn),issn);assert.ok(!issns.has(issn));issns.add(issn);
      const digits=issn.replace('-','').split('').map(value=>value==='X'?10:Number(value));
      assert.equal(digits.reduce((sum,value,index)=>sum+value*(8-index),0)%11,0,issn);
    }
  }
  const policy=journalPolicy();
  assert.equal(policy.policy_version,JOURNAL_POLICY_VERSION);
  assert.ok(policy.selection_basis.includes('不是影响因子排名'));
  assert.ok(!('impact_factor' in policy.items[0]));
});

test('exact normalized titles, documented aliases and title-missing ISSNs identify selected journals',()=>{
  assert.equal(selectJournal({journal:'NATURE biotechnology',status:'indexed'}).journal_id,'nature-biotechnology');
  assert.equal(selectJournal({journal:'Science (New York, N.Y.)',status:'indexed'}).journal_id,'science');
  assert.equal(selectJournal({journal:'Nature Structural and Molecular Biology'}).journal_id,'nature-structural-molecular-biology');
  assert.equal(selectJournal({issns:['1476 4687']}).journal_id,'nature');
  assert.equal(selectJournal({issn:'25225839'}).matched_by,'issn');
  assert.equal(selectJournal({issns:['1476-4687','2522-5839']}).tier,'unknown');
});

test('preprints, absent metadata and an unrelated title borrowing a selected ISSN are excluded',()=>{
  assert.equal(selectJournal({journal:'Nature',status:'preprint'}).tier,'preprint');
  assert.equal(selectJournal({journal:'Nature',source:'PPR',status:'indexed'}).tier,'preprint');
  assert.equal(selectJournal({journal:'Nature',publication_types:['Preprint']}).tier,'preprint');
  // Live Crossref /journals/1474-1776 currently merges NR Cancer and NR Drug Discovery.
  assert.equal(selectJournal({journal:'Nature Reviews Cancer',issns:['1474-1776']}).tier,'outside_selection');
  assert.equal(selectJournal({journal:'Nature Medicine and Clinical Reviews'}).tier,'outside_selection');
  assert.equal(selectJournal({}).tier,'unknown');
});

test('journal SQL binds policy lists and rejects explicit preprint status and publication types',()=>{
  const params=[];
  const query=selectedJournalSQL('r.raw_payload',value=>{params.push(value);return '$'+params.length;});
  assert.equal(params.length,3);
  assert.ok(params[0].includes('naturebiotechnology'));
  assert.ok(params[1].includes('10870156'));
  assert.ok(query.includes("<>'preprint'"));
  assert.ok(query.includes("ILIKE '%preprint%'"));
  assert.ok(query.includes("='' AND (SELECT count(DISTINCT selected.journal_id)"));
  assert.ok(params[2].includes('nature-biotechnology'));
  assert.ok(!query.includes('Nature Biotechnology'));
});
