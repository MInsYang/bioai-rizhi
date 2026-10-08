// Editorial selection for this product, not an impact-factor or universal quality ranking.
// Full journal titles are preferred because serial registries can merge ISSN records.
export const JOURNAL_POLICY_VERSION = 'selected-journals-2026-10-v1';
const entries = [
  ['nature','Nature',['0028-0836','1476-4687'],['Nature (London)'],'https://www.nature.com/nature/','综合科研'],
  ['science','Science',['0036-8075','1095-9203'],['Science (New York, N.Y.)'],'https://www.science.org/journal/science','综合科研'],
  ['cell','Cell',['0092-8674','1097-4172'],[],'https://www.cell.com/cell/home','生命科学'],
  ['nature-biotechnology','Nature Biotechnology',['1087-0156','1546-1696'],[],'https://www.nature.com/nbt/','生物技术与转化'],
  ['nature-methods','Nature Methods',['1548-7091','1548-7105'],[],'https://www.nature.com/nmeth/','生命科学方法'],
  ['nature-medicine','Nature Medicine',['1078-8956','1546-170X'],[],'https://www.nature.com/nm/','医学与转化'],
  ['nature-genetics','Nature Genetics',['1061-4036','1546-1718'],[],'https://www.nature.com/ng/','基因组学'],
  ['nature-machine-intelligence','Nature Machine Intelligence',['2522-5839'],[],'https://www.nature.com/natmachintell/','AI 与机器学习'],
  ['nature-computational-science','Nature Computational Science',['2662-8457'],[],'https://www.nature.com/natcomputsci/','计算科学'],
  ['nature-biomedical-engineering','Nature Biomedical Engineering',['2157-846X'],[],'https://www.nature.com/natbiomedeng/','生物医学工程'],
  ['nature-chemical-biology','Nature Chemical Biology',['1552-4450','1552-4469'],[],'https://www.nature.com/nchembio/','化学生物学'],
  ['science-translational-medicine','Science Translational Medicine',['1946-6234','1946-6242'],[],'https://www.science.org/journal/stm','转化医学'],
  ['cell-systems','Cell Systems',['2405-4712','2405-4720'],[],'https://www.cell.com/cell-systems/home','系统生物学'],
  ['cancer-discovery','Cancer Discovery',['2159-8274','2159-8290'],[],'https://aacrjournals.org/cancerdiscovery','肿瘤学与药物研发'],
  ['nature-reviews-drug-discovery','Nature Reviews Drug Discovery',['1474-1776','1474-1784'],[],'https://www.nature.com/nrd/','药物研发综述'],
  ['nature-chemistry','Nature Chemistry',['1755-4330','1755-4349'],[],'https://www.nature.com/nchem/','化学与分子设计'],
  ['nature-structural-molecular-biology','Nature Structural & Molecular Biology',['1545-9993','1545-9985'],['Nature Structural and Molecular Biology'],'https://www.nature.com/nsmb/','结构与分子生物学'],
];
export const SELECTED_JOURNALS = Object.freeze(entries.map(([id,title,issns,aliases,url,focus])=>Object.freeze({
  id,title,issns:Object.freeze(issns),aliases:Object.freeze(aliases),url,focus,
  metadata_url:'https://api.crossref.org/journals/'+issns[0],tier:'selected',
})));
export const normalizeJournalTitle = value => String(value||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');
export function normalizeISSN(value) {
  const text=String(value||'').normalize('NFKC').toUpperCase().replace(/[^0-9X]/g,'');
  return /^\d{7}[\dX]$/.test(text)?text.slice(0,4)+'-'+text.slice(4):null;
}
const byTitle=new Map(),byISSN=new Map();
for(const journal of SELECTED_JOURNALS) {
  for(const title of [journal.title,...journal.aliases])byTitle.set(normalizeJournalTitle(title),journal);
  for(const issn of journal.issns)byISSN.set(issn,journal);
}
export const SELECTED_TITLE_KEYS = Object.freeze([...byTitle.keys()]);
export const SELECTED_ISSNS = Object.freeze([...byISSN.keys()]);

export function selectJournal(academic={}) {
  const base={policy_version:JOURNAL_POLICY_VERSION,tier:'unknown',journal_id:null,title:null,matched_by:null};
  const types=Array.isArray(academic.publication_types)?academic.publication_types:[];
  if(academic.status==='preprint'||academic.source==='PPR'||types.some(type=>/preprint/i.test(String(type))))return {...base,tier:'preprint'};
  const key=normalizeJournalTitle(academic.journal);
  let journal=byTitle.get(key),matched_by=journal?'title':null;
  // An unknown explicit title cannot borrow a selected title's ISSN. Crossref's
  // /journals entries occasionally contain several differently named serials.
  if(!key) {
    const issns=[...(Array.isArray(academic.issns)?academic.issns:[]),academic.issn,academic.eissn,academic.print_issn];
    const matches=new Map(issns.map(normalizeISSN).map(issn=>byISSN.get(issn)).filter(Boolean).map(value=>[value.id,value]));
    if(matches.size===1){journal=[...matches.values()][0];matched_by='issn';}
  }
  return journal?{...base,tier:'selected',journal_id:journal.id,title:journal.title,matched_by}:{...base,tier:key?'outside_selection':'unknown'};
}

// Keep the SQL filter and JS response decoration on the same explicit policy.
// p() supplies bound parameters; no titles or identifiers are interpolated as SQL.
export function selectedJournalSQL(payload,p) {
  const academic=`${payload}->'academic'`,title=`lower(regexp_replace(normalize(COALESCE(${academic}->>'journal',''),NFKC),'[^a-zA-Z0-9]','','g'))`;
  const types=`CASE WHEN jsonb_typeof(${academic}->'publication_types')='array' THEN ${academic}->'publication_types' ELSE '[]'::jsonb END`;
  const issns=`CASE WHEN jsonb_typeof(${academic}->'issns')='array' THEN ${academic}->'issns' ELSE '[]'::jsonb END || jsonb_build_array(${academic}->>'issn',${academic}->>'eissn',${academic}->>'print_issn')`;
  const names=p(SELECTED_TITLE_KEYS),ids=p(SELECTED_ISSNS.map(value=>value.replace('-',''))),journalIDs=p(SELECTED_ISSNS.map(value=>byISSN.get(value).id));
  return `(COALESCE(${academic}->>'status','')<>'preprint' AND COALESCE(${academic}->>'source','')<>'PPR'
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(${types}) pt(value) WHERE pt.value ILIKE '%preprint%')
    AND (${title}=ANY(${names}::text[]) OR (${title}='' AND (SELECT count(DISTINCT selected.journal_id)
      FROM jsonb_array_elements_text(${issns}) ji(value) JOIN unnest(${ids}::text[],${journalIDs}::text[]) selected(issn,journal_id)
      ON upper(regexp_replace(normalize(ji.value,NFKC),'[^0-9xX]','','g'))=selected.issn)=1)))`;
}

export function journalPolicy() {
  return {policy_version:JOURNAL_POLICY_VERSION,tier:'selected',items:SELECTED_JOURNALS,
    selection_basis:'编辑精选的固定期刊名单；不是影响因子排名或对单篇论文质量的背书。',
    article_rule:'默认仅展示名单内期刊、AI 与生物医药主题相关的记录；预印本不进入精选期刊视图。',
    archive_access:'journal_tier=all 可查阅保留的其他期刊与预印本来源记录。'};
}

export const EUROPE_PMC_JOURNAL_QUERY='('+SELECTED_ISSNS.map(issn=>'ISSN:'+issn).join(' OR ')+')';
export const PUBMED_JOURNAL_QUERY='('+SELECTED_ISSNS.map(issn=>'"'+issn+'"[ISSN]').join(' OR ')+')';
