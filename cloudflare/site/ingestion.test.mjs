import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {dispatch,consume} from './ingestion.js';
import {classify,TOPICS,QUERY_VERSION,FOCUSED_QUERY} from './topics.js';

const JOB='10000000-0000-4000-8000-000000000001',TOKEN='20000000-0000-4000-8000-000000000001';
const source=adapter=>({id:'30000000-0000-4000-8000-000000000001',adapter,url:'https://www.xtalpi.com/feed/',config:{query_version:QUERY_VERSION,bootstrap_days:1,window_days:7}});
const msg=()=>({body:{job_id:JOB},acked:0,retries:[],ack(){this.acked++;},retry(options){this.retries.push(options.delaySeconds);}});
const epmcItem=(id='PPR123')=>({source:'PPR',id,doi:'10.1101/example',title:'Machine learning virtual cell perturbation prediction',abstractText:'A foundation model predicts perturbation responses.',firstPublicationDate:'2026-10-07',pubTypeList:{pubType:['Preprint']},bookOrReportDetails:{publisher:'bioRxiv'}});
function mockSQL(s,checkpoint={},overrides={}) {
  const calls=[];
  return {calls,async query(text,params=[]){
    calls.push({text,params});
    if(text.includes('ingestion_claim'))return [{result:overrides.claim||{status:'claimed',job:{id:JOB,lease_token:TOKEN,checkpoint},source:s}}];
    if(text.includes('ingestion_checkpoint'))return [{result:{status:overrides.checkpointStatus||'checkpoint',job_id:JOB,inserted:JSON.parse(params[2]).length}}];
    if(text.includes('ingestion_finish'))return [{result:{status:overrides.finishStatus||'succeeded',job_id:JOB,inserted:JSON.parse(params[2]).length}}];
    if(text.includes('ingestion_fail'))return [{result:{status:overrides.failStatus||'retry',retry_after:180}}];
    if(text.startsWith('SELECT id,checkpoint'))return overrides.history||[];
    throw new Error('Unexpected SQL');
  }};
}
const envFor=body=>({NOW:()=>Date.parse('2026-10-08T10:00:00Z'),FETCH:async()=>new Response(body,{status:200}),INGEST_QUEUE:{sent:[],async send(body){this.sent.push(body);}}});
const callOf=(sql,name)=>sql.calls.find(call=>call.text.includes(name));

test('five stable topic IDs and no generic AI biomedical admission',()=>{
  assert.deepEqual(TOPICS.map(t=>t.id),['virtual-cell','organoid','virtual-embryo','virtual-organ','drug-discovery']);
  assert.deepEqual(classify('Deep learning diagnosis of lung cancer','A CNN detects pathology images.').topic_ids,[]);
  assert.deepEqual(classify('Machine learning virtual cell','Predicting cell perturbations.').topic_ids,['virtual-cell']);
  assert.deepEqual(classify('Geneformer regulatory network inference','Single-cell gene expression.').topic_ids,['virtual-cell']);
  assert.ok(classify('STATE predicts single-cell perturbation responses','Arc model').topic_ids.includes('virtual-cell'));
  assert.ok(!classify('State of deep learning diagnostics','Clinical practice').topic_ids.includes('virtual-cell'));
  assert.ok(FOCUSED_QUERY.includes('SRC:PPR'));
});
test('biological organoids and embryo models are not automatically called virtual organs or embryos',()=>{
  const organoid=classify('Stem cell-derived liver organoids','In vitro tissue culture for disease biology.');
  assert.deepEqual(organoid.topic_ids,['organoid']);assert.equal(organoid.model_form,'biological');
  const embryo=classify('Stem cell-based embryo models and blastoids','Human stem cell culture');
  assert.ok(!embryo.topic_ids.includes('virtual-embryo'));assert.equal(embryo.biological_model,'stem_cell_based_embryo_model');
  assert.ok(!classify('Deep learning embryo quality prediction','IVF embryo selection using a machine learning model').topic_ids.includes('virtual-embryo'));
  assert.ok(classify('AI model of embryonic development','Generative spatiotemporal model of gastrulation and cell fate').topic_ids.includes('virtual-embryo'));
  const twin=classify('AI digital twin of the heart','Multiscale simulation of cardiac electrical activity.');
  assert.ok(twin.topic_ids.includes('virtual-organ'));assert.equal(twin.model_form,'computational');
});
test('Europe PMC preserves preprint origin and unknown version without inferring peer review',async()=>{
  const sql=mockSQL(source('europepmc')),m=msg(),env=envFor(JSON.stringify({hitCount:1,resultList:{result:[epmcItem()]},nextCursorMark:'end'}));
  let fetched=0;const fetch=env.FETCH;env.FETCH=async url=>{fetched++;assert.ok(url.includes('FIRST_IDATE'));assert.ok(url.includes('UPDATE_DATE'));return fetch(url);};
  await consume({messages:[m]},env,sql);
  const finish=callOf(sql,'ingestion_finish'),rows=JSON.parse(finish.params[2]);
  assert.equal(fetched,1);assert.equal(rows[0].raw_payload.academic.status,'preprint');assert.equal(rows[0].raw_payload.academic.version,null);
  assert.equal(rows[0].raw_payload.academic.publisher,'bioRxiv');assert.equal(rows[0].raw_payload.original.id,'PPR123');
  assert.equal(rows[0].raw_payload.classification.method,'automated_keyword_v1');assert.ok(!('peer_reviewed' in rows[0].raw_payload.academic));
  assert.equal(JSON.parse(finish.params[3]).cursor_date,'2026-10-08');assert.equal(m.acked,1);
});
test('one bounded Europe PMC page checkpoints before sending continuation',async()=>{
  const items=Array.from({length:25},(_,i)=>epmcItem('PPR'+i)),sql=mockSQL(source('europepmc')),m=msg();
  const env=envFor(JSON.stringify({hitCount:26,resultList:{result:items},nextCursorMark:'next'}));
  await consume({messages:[m]},env,sql);
  const checkpoint=callOf(sql,'ingestion_checkpoint');assert.equal(JSON.parse(checkpoint.params[2]).length,25);
  assert.equal(JSON.parse(checkpoint.params[3]).page_cursor,'next');assert.ok(!callOf(sql,'ingestion_finish'));
  assert.equal(env.INGEST_QUEUE.sent.length,1);assert.equal(m.acked,1);
});
test('checkpoint token loss discards completion and sends no continuation',async()=>{
  const sql=mockSQL(source('europepmc'),{},{checkpointStatus:'lease_lost'}),m=msg(),env=envFor(JSON.stringify({hitCount:2,resultList:{result:[epmcItem()]},nextCursorMark:'next'}));
  await consume({messages:[m]},env,sql);assert.equal(env.INGEST_QUEUE.sent.length,0);assert.equal(m.acked,1);
});
test('Europe PMC incomplete empty page retries without advancing cursor',async()=>{
  const sql=mockSQL(source('europepmc')),m=msg(),env=envFor(JSON.stringify({hitCount:2,resultList:{result:[]},nextCursorMark:'next'}));
  await consume({messages:[m]},env,sql);assert.ok(callOf(sql,'ingestion_fail'));assert.ok(!callOf(sql,'ingestion_finish'));assert.equal(m.retries.length,1);
});
test('query change ignores the former checkpoint and rebuilds the focused search',async()=>{
  const sql=mockSQL(source('europepmc'),{query_version:'old',target_date:'2020-01-01',from:'2020-01-01',to:'2020-01-01',page_cursor:'old'}),m=msg();
  const env=envFor(JSON.stringify({hitCount:0,resultList:{result:[]},nextCursorMark:'*'}));
  env.FETCH=async url=>{assert.ok(!url.includes('2020-01-01'));assert.equal(new URL(url).searchParams.get('cursorMark'),'*');return new Response(JSON.stringify({hitCount:0,resultList:{result:[]}}));};
  await consume({messages:[m]},env,sql);assert.ok(callOf(sql,'ingestion_finish'));
});
test('PubMed search is a separate page and saves a complete ID checkpoint',async()=>{
  const sql=mockSQL(source('pubmed')),m=msg(),env=envFor(JSON.stringify({esearchresult:{count:'2',idlist:['123','124']}}));
  await consume({messages:[m]},env,sql);
  const checkpoint=JSON.parse(callOf(sql,'ingestion_checkpoint').params[3]);assert.deepEqual(checkpoint.ids,['123','124']);assert.equal(checkpoint.phase,'fetch');
});
const state={query_version:QUERY_VERSION,target_date:'2026-10-08',from:'2026-10-07',to:'2026-10-08',window_days:7,phase:'fetch',page_cursor:'*',ids:['123','124'],offset:0,seen:0,retrieved_total:0,matched_total:0,bytes_total:0};
const article=(pmid='123',day='07')=>'<PubmedArticle><MedlineCitation><PMID>'+pmid+'</PMID><Article><ArticleTitle>Machine learning <i>virtual cell</i> design</ArticleTitle><Abstract><AbstractText>Foundation model predicts perturbations.</AbstractText></Abstract><ArticleDate><Year>2026</Year><Month>Oct</Month>'+ (day?'<Day>'+day+'</Day>':'')+'</ArticleDate><PublicationTypeList><PublicationType>Journal Article</PublicationType></PublicationTypeList><Journal><Title>Example journal</Title></Journal></Article></MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="doi">10.1000/example</ArticleId></ArticleIdList></PubmedData></PubmedArticle>';
test('partial PubMed EFetch never finishes the date window',async()=>{
  const sql=mockSQL(source('pubmed'),state),m=msg(),env=envFor('<PubmedArticleSet>'+article()+'</PubmedArticleSet>');
  await consume({messages:[m]},env,sql);assert.ok(!callOf(sql,'ingestion_finish'));assert.ok(JSON.parse(callOf(sql,'ingestion_fail').params[2]).message.includes('incomplete'));
});
test('PubMed inline text, original XML, precise date and indexed status survive',async()=>{
  const sql=mockSQL(source('pubmed'),{...state,ids:['123']}),m=msg(),env=envFor('<PubmedArticleSet>'+article()+'</PubmedArticleSet>');
  await consume({messages:[m]},env,sql);
  const row=JSON.parse(callOf(sql,'ingestion_finish').params[2])[0];assert.equal(row.title,'Machine learning virtual cell design');
  assert.equal(row.published_at,'2026-10-07T00:00:00.000Z');assert.equal(row.raw_payload.academic.status,'indexed');assert.ok(row.raw_payload.raw_xml.includes('<i>virtual cell</i>'));
});
test('PubMed month-only date remains unknown rather than invented',async()=>{
  const sql=mockSQL(source('pubmed'),{...state,ids:['123']}),m=msg(),env=envFor('<PubmedArticleSet>'+article('123','')+'</PubmedArticleSet>');
  await consume({messages:[m]},env,sql);assert.equal(JSON.parse(callOf(sql,'ingestion_finish').params[2])[0].published_at,null);
});
test('company RSS rejects a cross-origin redirect before fetching it',async()=>{
  const s=source('rss');s.config={...s.config,allowed_hosts:['www.xtalpi.com'],official_feed_verified:true};const sql=mockSQL(s,{},{failStatus:'dead'}),m=msg();
  let calls=0;const env={FETCH:async()=>{calls++;return new Response('',{status:302,headers:{Location:'https://example.com/unverified'}});}};
  await consume({messages:[m]},env,sql);assert.equal(calls,1);assert.equal(JSON.parse(callOf(sql,'ingestion_fail').params[2]).permanent,true);assert.equal(m.acked,1);
});
test('company RSS retains original item and drops articles outside the focus',async()=>{
  const s=source('rss');s.config={...s.config,allowed_hosts:['www.xtalpi.com'],official_feed_verified:true};const sql=mockSQL(s),m=msg();
  const body='<rss><channel><item><title>晶泰 AI 制药新药进展</title><link>https://www.xtalpi.com/news/a/?utm_source=rss</link><guid>one</guid><description>AI 药物研发创新药候选药物</description></item><item><title>Office event</title><link>https://www.xtalpi.com/event/</link><description>Employee celebration</description></item></channel></rss>';
  await consume({messages:[m]},envFor(body),sql);const row=JSON.parse(callOf(sql,'ingestion_finish').params[2])[0];
  assert.equal(JSON.parse(callOf(sql,'ingestion_finish').params[2]).length,1);assert.equal(row.canonical_url,'https://www.xtalpi.com/news/a/');assert.ok(row.raw_payload.raw_xml.includes('<guid>one</guid>'));
});
test('304 conditional RSS success has no fabricated new records',async()=>{
  const s=source('rss');s.config={...s.config,allowed_hosts:['www.xtalpi.com'],official_feed_verified:true};s.etag='"one"';const sql=mockSQL(s),m=msg();
  const env={FETCH:async(_url,options)=>{assert.equal(options.headers['If-None-Match'],'"one"');return new Response(null,{status:304});}};
  await consume({messages:[m]},env,sql);assert.deepEqual(JSON.parse(callOf(sql,'ingestion_finish').params[2]),[]);assert.equal(JSON.parse(callOf(sql,'ingestion_finish').params[4]).http_status,304);
});
test('HTTP 500 has HTTP metrics and respects Retry-After',async()=>{
  const sql=mockSQL(source('biorxiv')),m=msg(),env={FETCH:async()=>new Response('failure',{status:500,headers:{'Retry-After':'240'}})};
  await consume({messages:[m]},env,sql);const failure=JSON.parse(callOf(sql,'ingestion_fail').params[2]);assert.equal(failure.http_status,500);assert.equal(failure.retry_after,240);assert.equal(failure.permanent,false);
});
test('transport error codes remain inspectable without exposing proxy URLs',async()=>{
  const sql=mockSQL(source('rss')),m=msg();
  const s=source('europepmc'),db=mockSQL(s);
  await consume({messages:[m]},{FETCH:async()=>{throw new TypeError('fetch failed',{cause:Object.assign(new Error('Do not expose a private proxy URL'),{code:'ECONNRESET'})});}},db);
  const error=JSON.parse(callOf(db,'ingestion_fail').params[2]);assert.ok(error.message.includes('ECONNRESET'));assert.ok(!error.message.includes('proxy URL'));
});
test('already claimed jobs defer to the lease without fetching twice',async()=>{
  const sql=mockSQL(source('europepmc'),{},{claim:{status:'running',retry_after:100}}),m=msg();
  await consume({messages:[m]},{FETCH:async()=>{throw new Error('Must not fetch');}},sql);assert.deepEqual(m.retries,[100]);
});
test('empty dispatch still invokes the database heartbeat and manual kind remains explicit',async()=>{
  const calls=[],sql={async query(text,params){calls.push({text,params});return [];}};
  const result=await dispatch(sql,{send:async()=>{throw new Error('No jobs expected');}},Date.parse('2026-10-08T10:07:00Z'),'manual');
  assert.equal(result.enqueued,0);assert.equal(calls[0].params[1],'manual');
});
test('dispatch enqueue failures persist a failed heartbeat',async()=>{
  const calls=[],sql={async query(text,params){calls.push({text,params});return text.includes('ingestion_dispatch')?[{job_id:JOB}]:[];}};
  await assert.rejects(()=>dispatch(sql,{send:async()=>{throw new Error('Queue unavailable');}},Date.now(),'cron'),/Queue unavailable/);
  assert.ok(calls[1].text.includes("status='failed'"));assert.equal(calls[1].params[3],'cron');
});
test('native queue batch dispatch uses one bounded send for multiple jobs',async()=>{
  let batches=0;const sql={async query(){return [{job_id:JOB},{job_id:TOKEN}];}};
  const result=await dispatch(sql,{async sendBatch(messages){batches++;assert.equal(messages.length,2);assert.ok(messages.every(m=>m.body.job_id));}},Date.now());
  assert.equal(batches,1);assert.equal(result.enqueued,2);
});
test('a later job resumes the exact-query dead checkpoint without repeating fetched pages',async()=>{
  const s=source('europepmc'),sql=mockSQL(s,{},{history:[{id:TOKEN,checkpoint:{...state,phase:'fetch',ids:undefined,page_cursor:'saved-cursor',seen:25,retrieved_total:25,matched_total:25}}]}),m=msg();
  const query=sql.query.bind(sql);sql.query=async(text,params)=>{
    const rows=await query(text,params);if(text.includes('ingestion_claim'))rows[0].result.job.attempts=1;return rows;
  };
  const env=envFor(JSON.stringify({hitCount:26,resultList:{result:[epmcItem()]},nextCursorMark:'end'}));
  env.FETCH=async url=>{assert.equal(new URL(url).searchParams.get('cursorMark'),'saved-cursor');return new Response(JSON.stringify({hitCount:26,resultList:{result:[epmcItem()]},nextCursorMark:'end'}));};
  await consume({messages:[m]},env,sql);
  assert.ok(callOf(sql,'ingestion_finish'));assert.equal(JSON.parse(callOf(sql,'ingestion_finish').params[4]).retrieved_total,26);
  const history=sql.calls.find(call=>call.text.startsWith('SELECT id,checkpoint'));assert.equal(history.params[2],QUERY_VERSION);assert.ok(history.text.includes("checkpoint->>'target_date'>$4"));
});

test('PostgreSQL RPC leases, checkpoints, retries and hourly slots', {skip:process.env.BIOAI_TEST_LOCAL!=='1'}, async t=>{
  const {default:pg}=await import('pg');
  let configured=process.env.DATABASE_URL;
  if(configured===undefined) {
    const content=await fs.readFile(new URL('../../.env',import.meta.url),'utf8');
    configured=content.split('\n').find(line=>line.startsWith('DATABASE_URL='))?.slice('DATABASE_URL='.length).trim();
  }
  const url=new URL(configured);assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'PG integration tests require a local database');
  const name='bioai_ingest_test_'+crypto.randomUUID().replaceAll('-','').slice(0,12),adminUrl=new URL(url);adminUrl.pathname='/postgres';
  const admin=new pg.Client({connectionString:adminUrl.href});await admin.connect();await admin.query('CREATE DATABASE '+name);
  const testUrl=new URL(url);testUrl.pathname='/'+name;const db=new pg.Client({connectionString:testUrl.href});await db.connect();
  try {
    for(const filename of ['001_foundation.sql','002_unified_publication.sql','003_academic_evidence.sql','004_hourly_ingestion.sql','007_host_request_intervals.sql','008_dispatch_queue_confirmation.sql'])await db.query(await fs.readFile(new URL('../../backend/migrations/'+filename,import.meta.url),'utf8'));
    await db.query("INSERT INTO polling_profiles VALUES('P0',1)");
    const sid='30000000-0000-4000-8000-000000000001';
    async function reset() {
      await db.query('TRUNCATE sources,scheduler_runs,ingestion_host_gates CASCADE');
      await db.query("INSERT INTO sources(id,name,source_type,url,poll_profile,enabled,verified,verification_status,adapter,config) VALUES($1,'Test only','academic_api','https://www.ebi.ac.uk/europepmc/webservices/rest/','P0',true,true,'verified','europepmc',$2)",[sid,{cloud_runtime_enabled:true,query_version:QUERY_VERSION}]);
    }
    const invoke=async(name,params,casts='')=>(await db.query('SELECT '+name+'('+params.map((_,i)=>'$'+(i+1)+(casts.split(',')[i]||'')).join(',')+') AS result',params.map((value,i)=>casts.split(',')[i]==='::jsonb'?JSON.stringify(value):value))).rows[0].result;
    const claim=async id=>invoke('ingestion_claim',[id,'test']);
    const dispatchJobs=async(kind='cron')=>(await db.query('SELECT * FROM ingestion_dispatch_hourly(now(),$1)',[kind])).rows;
    const metrics={http_status:200,duration_ms:10,bytes_fetched:100};
    const raw={external_id:'PPR:TEST',canonical_url:'https://europepmc.org/article/PPR/TEST',title:'Virtual cell test',content_text:'Test data only',published_at:null,content_hash:'a'.repeat(64),raw_payload:{classification:classify('AI virtual cell','Foundation model'),original:{id:'TEST'}}};
    await t.test('hourly dispatch idempotence and separate manual/cron heartbeats',async()=>{
      await reset();const first=await dispatchJobs();assert.equal(first.length,1);const second=await dispatchJobs();assert.equal(second[0].job_id,first[0].job_id);await dispatchJobs('manual');
      const heartbeats=(await db.query('SELECT * FROM scheduler_runs ORDER BY trigger_kind')).rows;assert.equal(heartbeats.length,2);assert.ok(heartbeats.every(r=>r.status==='running' && r.finished_at===null && r.dispatched_count===0));
    });
    await t.test('queue delivery confirmation moves a real SQL heartbeat from running to succeeded',async()=>{
      await reset();const at=Date.now();
      const sql={async query(text,params){return (await db.query(text,params)).rows;}};
      const result=await dispatch(sql,{async sendBatch(messages){
        assert.equal(messages.length,1);
        const [stage]=(await db.query("SELECT status,finished_at,dispatched_count FROM scheduler_runs WHERE trigger_kind='cron'")).rows;
        assert.equal(stage.status,'running');assert.equal(stage.finished_at,null);assert.equal(stage.dispatched_count,0);
      }},at,'cron');assert.equal(result.enqueued,1);
      const [final]=(await db.query("SELECT status,finished_at,dispatched_count FROM scheduler_runs WHERE trigger_kind='cron'")).rows;
      assert.equal(final.status,'succeeded');assert.ok(final.finished_at);assert.equal(final.dispatched_count,1);
    });
    await t.test('queue delivery failure persists a failed real SQL heartbeat and keeps the job queued',async()=>{
      await reset();const sql={async query(text,params){return (await db.query(text,params)).rows;}};
      await assert.rejects(()=>dispatch(sql,{async send(){
        const [stage]=(await db.query("SELECT status,finished_at FROM scheduler_runs WHERE trigger_kind='manual'")).rows;
        assert.equal(stage.status,'running');assert.equal(stage.finished_at,null);throw new Error('Injected queue outage');
      }},Date.now(),'manual'),/Injected queue outage/);
      const [final]=(await db.query("SELECT status,finished_at,dispatched_count,error FROM scheduler_runs WHERE trigger_kind='manual'")).rows;
      assert.equal(final.status,'failed');assert.ok(final.finished_at);assert.equal(final.dispatched_count,0);assert.match(final.error,/Injected queue outage/);
      assert.equal((await db.query('SELECT status FROM ingestion_jobs')).rows[0].status,'queued');
    });
    await t.test('one claim, stale token fence and page continuation does not exhaust retry budget',async()=>{
      await reset();const [row]=await dispatchJobs();let c=await claim(row.job_id);assert.equal(c.status,'claimed');assert.equal((await claim(row.job_id)).status,'running');
      const lost=await invoke('ingestion_finish',[row.job_id,crypto.randomUUID(),[raw],{query_version:QUERY_VERSION,cursor_date:'2026-10-08'},metrics],',,::jsonb,::jsonb,::jsonb');assert.equal(lost.status,'lease_lost');
      assert.equal((await db.query('SELECT count(*)::int n FROM raw_items')).rows[0].n,0);
      for(let i=0;i<6;i++) {
        const checkpoint=await invoke('ingestion_checkpoint',[row.job_id,c.job.lease_token,[raw],{query_version:QUERY_VERSION,target_date:'2026-10-08',page_cursor:'next'+i},metrics],',,::jsonb,::jsonb,::jsonb');assert.equal(checkpoint.status,'checkpoint');
        await db.query("UPDATE ingestion_host_gates SET next_request_at=now()-interval '1 second'");c=await claim(row.job_id);assert.equal(c.status,'claimed');
      }
      assert.equal(c.job.failure_count,0);assert.equal(c.job.attempts,7);
      const done=await invoke('ingestion_finish',[row.job_id,c.job.lease_token,[raw],{query_version:QUERY_VERSION,cursor_date:'2026-10-08'},metrics],',,::jsonb,::jsonb,::jsonb');assert.equal(done.status,'succeeded');
      assert.equal((await db.query('SELECT count(*)::int n FROM raw_items')).rows[0].n,1);
      const sourceRow=(await db.query('SELECT * FROM sources WHERE id=$1',[sid])).rows[0];assert.ok(sourceRow.last_success_at);assert.equal(sourceRow.next_poll_at.getUTCMinutes(),0);
      await db.query("UPDATE sources SET next_poll_at=now()-interval '1 second'");
      assert.equal((await db.query("SELECT * FROM ingestion_dispatch_hourly(now()+interval '1 hour')")).rows.length,1);
    });
    await t.test('source interval gates every job on the same host for ten seconds',async()=>{
      await reset();
      await db.query("UPDATE sources SET config=config||'{\"request_interval_seconds\":10}'::jsonb WHERE id=$1",[sid]);
      const second=crypto.randomUUID();
      await db.query("INSERT INTO sources(id,name,source_type,url,poll_profile,enabled,verified,verification_status,adapter,config) SELECT $1,'Same host','academic_api',url,poll_profile,enabled,verified,verification_status,adapter,config FROM sources WHERE id=$2",[second,sid]);
      const rows=await dispatchJobs();assert.equal(rows.length,2);
      const first=rows.find(r=>r.source_id===sid),other=rows.find(r=>r.source_id===second);
      assert.equal((await claim(first.job_id)).status,'claimed');
      const gate=(await db.query("SELECT extract(epoch FROM next_request_at-now())::float8 seconds FROM ingestion_host_gates WHERE host='www.ebi.ac.uk'")).rows[0];
      assert.ok(gate.seconds>9 && gate.seconds<=10,JSON.stringify(gate));
      const deferred=await claim(other.job_id);assert.equal(deferred.status,'rate_limited');assert.equal(deferred.retry_after,10);
      const untouched=(await db.query('SELECT attempts,failure_count FROM ingestion_jobs WHERE id=$1',[other.job_id])).rows[0];
      assert.equal(untouched.attempts,0);assert.equal(untouched.failure_count,0);
      await db.query("UPDATE ingestion_host_gates SET next_request_at=now()-interval '1 second'");
      assert.equal((await claim(other.job_id)).status,'claimed');
    });
    await t.test('request intervals bound numeric values and reject invalid configuration',async()=>{
      for(const [interval,expected] of [[null,1],['invalid',1],['NaN',1],[{},1],[false,1],[0,1],[-10,1],[10.2,11],[3601,3600],['1e3',1000]]) {
        await reset();
        await db.query("UPDATE sources SET config=config||jsonb_build_object('request_interval_seconds',$1::jsonb) WHERE id=$2",[JSON.stringify(interval),sid]);
        const [row]=await dispatchJobs();assert.equal((await claim(row.job_id)).status,'claimed');
        const {seconds}=(await db.query('SELECT extract(epoch FROM next_request_at-now())::float8 seconds FROM ingestion_host_gates')).rows[0];
        assert.ok(seconds>expected-1 && seconds<=expected,JSON.stringify({interval,expected,seconds}));
      }
    });
    await t.test('transient failure retains checkpoint and recorded status; permanent failure cools down',async()=>{
      await reset();const [row]=await dispatchJobs(),c=await claim(row.job_id);
      const retry=await invoke('ingestion_fail',[row.job_id,c.job.lease_token,{message:'HTTP 500 test',permanent:false,http_status:500,retry_after:240}],',,::jsonb');assert.equal(retry.status,'retry');assert.ok(retry.retry_after>=240);
      const attempt=(await db.query('SELECT * FROM ingestion_attempts')).rows[0];assert.equal(attempt.http_status,500);
      await db.query("UPDATE ingestion_jobs SET available_at=now()-interval '1 second'");await db.query("UPDATE ingestion_host_gates SET next_request_at=now()-interval '1 second'");const again=await claim(row.job_id);
      const dead=await invoke('ingestion_fail',[row.job_id,again.job.lease_token,{message:'Forbidden test',permanent:true,http_status:403}],',,::jsonb');assert.equal(dead.status,'dead');
      const next=(await db.query('SELECT next_poll_at FROM sources')).rows[0].next_poll_at;assert.ok(next-Date.now()>5*3600000);
    });
    await t.test('source revocation atomically closes the job and writes no records',async()=>{
      await reset();const [row]=await dispatchJobs(),c=await claim(row.job_id);await db.query('UPDATE sources SET enabled=false');
      const revoked=await invoke('ingestion_finish',[row.job_id,c.job.lease_token,[raw],{query_version:QUERY_VERSION,cursor_date:'2026-10-08'},metrics],',,::jsonb,::jsonb,::jsonb');assert.equal(revoked.status,'source_revoked');
      const job=(await db.query('SELECT * FROM ingestion_jobs WHERE id=$1',[row.job_id])).rows[0];assert.equal(job.status,'dead');assert.ok(job.finished_at);assert.equal(job.lease_token,null);
      assert.equal((await db.query('SELECT count(*)::int n FROM raw_items')).rows[0].n,0);
    });
    await t.test('empty SQL scheduling stage awaits queue confirmation without source claims',async()=>{
      await reset();await db.query('UPDATE sources SET enabled=false');assert.deepEqual(await dispatchJobs(),[]);assert.equal((await db.query('SELECT dispatched_count FROM scheduler_runs')).rows[0].dispatched_count,0);
    });
  } finally {
    await db.end();await admin.query('DROP DATABASE '+name+' WITH (FORCE)');await admin.end();
  }
});
