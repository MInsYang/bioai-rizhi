import {XMLParser, XMLValidator} from 'fast-xml-parser';
import {classify, FOCUSED_QUERY, PUBMED_QUERY, QUERY_VERSION} from './topics.js';

const MAX_BYTES=1_500_000;
const API_HOSTS={europepmc:['www.ebi.ac.uk'],pubmed:['eutils.ncbi.nlm.nih.gov'],biorxiv:['api.biorxiv.org']};
const parser=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false,parseAttributeValue:false});
const asArray=value=>value==null?[]:Array.isArray(value)?value:[value];
const dateOnly=value=>new Date(value).toISOString().slice(0,10);
const shift=(date,days)=>dateOnly(Date.parse(date+'T00:00:00Z')+days*86400000);
const rpcResult=rows=>rows[0]?.result;

class IngestionError extends Error {
  constructor(message,options={}) { super(message); Object.assign(this,options); }
}
function transportCode(error) {
  const candidates=[error.cause?.code,error.code,...(error.cause?.errors||[]).map(item=>item.code)];
  return [...new Set(candidates.filter(code=>/^[A-Z0-9_]+$/.test(String(code||''))))].join(',')||error.name;
}

function safeURL(value,hosts) {
  const url=new URL(value);
  if (url.protocol!=='https:' || url.username || url.password || (url.port && url.port!=='443') || !hosts.includes(url.hostname.toLowerCase())) {
    throw new IngestionError('URL is outside the verified official host allowlist',{permanent:true});
  }
  return url;
}

async function request(value,hosts,env,headers={}) {
  let url=safeURL(value,hosts);
  for (let redirects=0;redirects<4;redirects++) {
    let response;
    try {
      response=await (env.FETCH||globalThis.fetch)(url.href,{redirect:'manual',headers:{'User-Agent':'BioAIRegistry/2.0 public-news-metadata',...headers},signal:AbortSignal.timeout(15000)});
    } catch (error) { throw new IngestionError('Official source transport failed: '+transportCode(error),{permanent:false}); }
    if ([301,302,303,307,308].includes(response.status)) {
      if (!response.headers.get('location')) throw new IngestionError('Redirect has no Location');
      url=safeURL(new URL(response.headers.get('location'),url).href,hosts);
      continue;
    }
    if (response.status===304) return {url:url.href,status:304,headers:response.headers,body:'',bytes:0};
    if (response.status!==200) {
      const raw=response.headers.get('retry-after');
      const retry_after=raw ? (/^\d+$/.test(raw)?Number(raw):Math.max(0,Math.ceil((Date.parse(raw)-Date.now())/1000))) : 0;
      throw new IngestionError('Official source HTTP '+response.status,{http_status:response.status,permanent:[400,401,403,404,405,410].includes(response.status),retry_after:Number.isFinite(retry_after)?Math.min(retry_after,3600):0});
    }
    if (Number(response.headers.get('content-length')||0)>MAX_BYTES) throw new IngestionError('Official response exceeds bounded page size',{http_status:response.status});
    const reader=response.body?.getReader();
    if (!reader) throw new IngestionError('Official response has no body');
    const chunks=[];let bytes=0;
    try {
      while (true) {
        const {done,value:chunk}=await reader.read();if(done)break;
        bytes+=chunk.byteLength;
        if(bytes>MAX_BYTES) {await reader.cancel();throw new IngestionError('Official response exceeds bounded page size',{http_status:response.status,bytes_fetched:bytes});}
        chunks.push(chunk);
      }
    } catch(error) {
      if(error instanceof IngestionError)throw error;
      throw new IngestionError('Official source body transfer failed: '+transportCode(error),{http_status:response.status,bytes_fetched:bytes});
    }
    const body=new Uint8Array(bytes);let offset=0;
    for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
    return {url:url.href,status:response.status,headers:response.headers,body:new TextDecoder().decode(body),bytes};
  }
  throw new IngestionError('Official source redirect limit exceeded');
}

function json(body) {
  try{return JSON.parse(body);}catch{throw new IngestionError('Official API returned invalid JSON');}
}
function xml(body) {
  if (/<!ENTITY\b/i.test(body) || XMLValidator.validate(body)!==true) throw new IngestionError('Official feed/API returned invalid or unsupported XML');
  return parser.parse(body);
}
function decode(text) {
  return String(text||'').replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:x[0-9a-f]+|\d+);/gi,entity=>{
    const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '};
    if(named[entity.toLowerCase()]!==undefined)return named[entity.toLowerCase()];
    const number=entity[2]?.toLowerCase()==='x'?parseInt(entity.slice(3,-1),16):parseInt(entity.slice(2,-1),10);
    return number>0&&number<=0x10ffff?String.fromCodePoint(number):'';
  });
}
function plain(value) {
  return decode(String(value||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
}
const scalar=value=>value && typeof value==='object'?String(value['#text']||''):String(value||'');
const fragmentText=(fragment,tag)=>plain(fragment.match(new RegExp('<'+tag+'\\b[^>]*>([\\s\\S]*?)</'+tag+'>','i'))?.[1]||'');
function iso(value) {
  if (!value) return null;
  const time=Date.parse(value);return Number.isFinite(time)?new Date(time).toISOString():null;
}
function pubmedDate(value) {
  if (!value) return null;
  const monthNames=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const year=scalar(value.Year),rawMonth=scalar(value.Month),day=scalar(value.Day);
  const month=/^\d+$/.test(rawMonth)?Number(rawMonth):monthNames.indexOf(rawMonth.toLowerCase().slice(0,3))+1;
  if (!/^\d{4}$/.test(year) || month<1 || month>12 || !/^\d+$/.test(day)) return null;
  const date=year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  const parsed=iso(date);return parsed?.slice(0,10)===date?parsed:null;
}

async function record(source,fields,payload,state,response) {
  const title=String(fields.title||'').slice(0,1000),content_text=String(fields.content_text||title).slice(0,200000);
  if (!title || !fields.canonical_url) throw new IngestionError('Official record lacks title or URL');
  const classification=classify(title,content_text);
  if (!classification.topic_ids.length) return null;
  const canonical=new URL(fields.canonical_url);
  if (canonical.protocol!=='https:' || canonical.username || canonical.password) throw new IngestionError('Official record URL is not public HTTPS');
  const stable=JSON.stringify([canonical.href,title,content_text,fields.published_at||null,fields.external_id||null,payload.academic||null]);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable));
  const content_hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  return {...fields,canonical_url:canonical.href,title,content_text,content_hash,raw_payload:{...payload,classification,
    http_status:response.status,fetched_url:response.url,parser_version:'cloud-ingestion-v1',
    retrieval:{adapter:source.adapter,from:state.from||null,to:state.to||null,query:source.config.query||null,
      query_version:state.query_version,page_cursor:state.page_cursor??state.offset??null,complete_window:false}}};
}

function initialState(source,checkpoint,now) {
  const version=source.config.query_version||QUERY_VERSION;
  if (checkpoint?.query_version===version && checkpoint.target_date) return {...checkpoint};
  const today=dateOnly(now),lookback=Math.min(7,Math.max(0,Number(source.config.lookback_days??3)));
  const from=source.config.cursor_date?shift(source.config.cursor_date,-lookback):shift(today,-Math.min(90,Math.max(1,Number(source.config.bootstrap_days??30))));
  const windowDays=Math.min(7,Math.max(1,Number(source.config.window_days??7)));
  return {query_version:version,target_date:today,from,to:[shift(from,windowDays-1),today].sort()[0],window_days:windowDays,
    phase:source.adapter==='pubmed'?'search':'fetch',page_cursor:'*',offset:0,seen:0,retrieved_total:0,matched_total:0,bytes_total:0};
}
function advanceWindow(state,adapter) {
  if(state.to>=state.target_date)return {done:true,state};
  const from=shift(state.to,1);
  return {done:false,state:{...state,from,to:[shift(from,state.window_days-1),state.target_date].sort()[0],
    phase:adapter==='pubmed'?'search':'fetch',page_cursor:'*',offset:0,seen:0,ids:[],last_page_ids:[]}};
}
function counts(state,response,retrieved,matched) {
  return {...state,retrieved_total:state.retrieved_total+retrieved,matched_total:state.matched_total+matched,bytes_total:state.bytes_total+response.bytes};
}

async function europePMC(source,state,env) {
  const range='['+state.from+' TO '+state.to+']';
  const query='('+String(source.config.query||FOCUSED_QUERY)+') AND (FIRST_IDATE:'+range+' OR UPDATE_DATE:'+range+')';
  const args=new URLSearchParams({query,format:'json',resultType:'core',pageSize:'25',cursorMark:state.page_cursor||'*'});
  const response=await request('https://www.ebi.ac.uk/europepmc/webservices/rest/search?'+args,API_HOSTS.europepmc,env);
  const data=json(response.body),items=data.resultList?.result;
  if (!Number.isInteger(data.hitCount) || data.hitCount<0 || !Array.isArray(items) || items.length>25) throw new IngestionError('Europe PMC result structure is incomplete');
  if(data.hitCount>state.seen && !items.length)throw new IngestionError('Europe PMC empty page before declared count');
  const pageIds=items.map(item=>item.source+':'+item.id);
  if (new Set(pageIds).size!==pageIds.length || (items.length && JSON.stringify(pageIds)===JSON.stringify(state.last_page_ids))) throw new IngestionError('Europe PMC repeated page');
  const records=[];
  for(const item of items) {
    if (!['MED','PPR'].includes(item.source) || !item.id || !item.title) throw new IngestionError('Unexpected Europe PMC record identity');
    const pubTypes=asArray(item.pubTypeList?.pubType),preprint=item.source==='PPR'||pubTypes.some(t=>/preprint/i.test(t));
    const row=await record(source,{external_id:item.source+':'+item.id,canonical_url:'https://europepmc.org/article/'+item.source+'/'+item.id,
      title:plain(item.title),content_text:plain(item.abstractText)||plain(item.title),published_at:iso(item.firstPublicationDate)},
      {original:item,academic:{doi:item.doi||null,pmid:item.pmid||(item.source==='MED'?item.id:null),pmcid:item.pmcid||null,
        europe_pmc_id:item.id,source:item.source,status:preprint?'preprint':'indexed',version:item.versionNumber==null?null:String(item.versionNumber),
        journal:item.journalInfo?.journal?.title||null,publisher:item.bookOrReportDetails?.publisher||null,publication_types:pubTypes,
        first_index_date:item.firstIndexDate||null,first_publication_date:item.firstPublicationDate||null,original_url:item.doi?'https://doi.org/'+item.doi:null}},state,response);
    if(row)records.push(row);
  }
  const seen=state.seen+items.length,next=data.nextCursorMark;
  let updated=counts({...state,seen,last_page_ids:pageIds},response,items.length,records.length);
  if(seen>=data.hitCount){const advanced=advanceWindow(updated,source.adapter);return {...advanced,records,response};}
  if(!next || next===state.page_cursor)throw new IngestionError('Europe PMC pagination stalled');
  updated.page_cursor=next;
  return {done:false,state:updated,records,response};
}

async function pubmed(source,state,env) {
  const base='https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
  if(state.phase==='search') {
    const args=new URLSearchParams({db:'pubmed',term:source.config.query||PUBMED_QUERY,datetype:'edat',mindate:state.from,maxdate:state.to,
      retmode:'json',retmax:'1000',tool:'bioai_registry'});
    const response=await request(base+'esearch.fcgi?'+args,API_HOSTS.pubmed,env),result=json(response.body).esearchresult;
    if (!result || result.ERROR || !/^\d+$/.test(String(result.count)) || !Array.isArray(result.idlist)) throw new IngestionError('PubMed search response is invalid');
    const count=Number(result.count);
    if(count>1000) {
      if(state.from===state.to)throw new IngestionError('PubMed single-day query exceeds 1000; query review required',{permanent:true});
      const days=Math.floor((Date.parse(state.to)-Date.parse(state.from))/86400000);
      return {done:false,state:counts({...state,to:shift(state.from,Math.floor(days/2))},response,0,0),records:[],response};
    }
    if(result.idlist.length!==count || new Set(result.idlist).size!==count || result.idlist.some(id=>!/^\d+$/.test(id))) throw new IngestionError('PubMed identifier list is incomplete');
    const updated=counts({...state,phase:'fetch',ids:result.idlist,offset:0},response,0,0);
    return count?{done:false,state:updated,records:[],response}:{...advanceWindow(updated,source.adapter),records:[],response};
  }
  const expected=state.ids?.slice(state.offset,state.offset+10)||[];
  if(!expected.length)throw new IngestionError('PubMed checkpoint contains no expected IDs');
  const args=new URLSearchParams({db:'pubmed',id:expected.join(','),retmode:'xml',tool:'bioai_registry'});
  const response=await request(base+'efetch.fcgi?'+args,API_HOSTS.pubmed,env),doc=xml(response.body);
  if(!doc.PubmedArticleSet)throw new IngestionError('PubMed EFetch is not a PubmedArticleSet');
  const articles=asArray(doc.PubmedArticleSet.PubmedArticle),fragments=response.body.match(/<PubmedArticle\b[^>]*>[\s\S]*?<\/PubmedArticle>/g)||[];
  const actual=articles.map(article=>scalar(article.MedlineCitation?.PMID));
  if(actual.length!==expected.length || new Set(actual).size!==expected.length || actual.some(id=>!expected.includes(id)) || fragments.length!==articles.length) throw new IngestionError('PubMed EFetch batch incomplete; highwater unchanged');
  const records=[];
  for(let i=0;i<articles.length;i++) {
    const article=articles[i],citation=article.MedlineCitation,details=citation.Article||{},fragment=fragments[i],pmid=actual[i];
    const title=fragmentText(fragment,'ArticleTitle');
    const abstract=asArray(fragment.match(/<AbstractText\b[^>]*>[\s\S]*?<\/AbstractText>/g)).map(part=>fragmentText(part,'AbstractText')).join('\n');
    const ids=asArray(article.PubmedData?.ArticleIdList?.ArticleId),doi=ids.find(id=>id['@_IdType']==='doi');
    const types=asArray(details.PublicationTypeList?.PublicationType).map(scalar),date=asArray(details.ArticleDate)[0]||details.Journal?.JournalIssue?.PubDate;
    const row=await record(source,{external_id:'PMID:'+pmid,canonical_url:'https://pubmed.ncbi.nlm.nih.gov/'+pmid+'/',title,content_text:abstract||title,published_at:pubmedDate(date)},
      {raw_xml:fragment,academic:{pmid,doi:doi?scalar(doi):null,status:types.includes('Preprint')?'preprint':'indexed',version:null,
        journal:scalar(details.Journal?.Title),publication_types:types,publication_date_text:date||null}},state,response);
    if(row)records.push(row);
  }
  const offset=state.offset+expected.length,updated=counts({...state,offset},response,articles.length,records.length);
  return offset>=state.ids.length?{...advanceWindow(updated,source.adapter),records,response}:{done:false,state:updated,records,response};
}

async function bioRxiv(source,state,env) {
  const suffix=source.config.category?'?category='+encodeURIComponent(source.config.category):'';
  const response=await request('https://api.biorxiv.org/details/biorxiv/'+state.from+'/'+state.to+'/'+state.offset+'/json'+suffix,API_HOSTS.biorxiv,env);
  const data=json(response.body),message=data.messages?.[0],items=data.collection;
  if(!message || !['ok','no posts found'].includes(message.status) || !Array.isArray(items) || items.length>30) throw new IngestionError('bioRxiv API response is invalid');
  const total=Number(message.total||0);
  if(!Number.isInteger(total) || total<0 || (!items.length && state.offset<total)) throw new IngestionError('bioRxiv pagination stalled');
  const records=[],pageIds=items.map(item=>item.doi+':v'+item.version);
  if(items.length && JSON.stringify(pageIds)===JSON.stringify(state.last_page_ids))throw new IngestionError('bioRxiv repeated page');
  for(const item of items) {
    if(!item.doi || !item.version || !item.title)throw new IngestionError('bioRxiv manuscript identity missing');
    const version=String(item.version),row=await record(source,{external_id:item.doi+':v'+version,canonical_url:'https://www.biorxiv.org/content/'+item.doi+'v'+version,
      title:item.title,content_text:plain(item.abstract)||item.title,published_at:iso(item.date)},
      {original:item,academic:{doi:item.doi,version,status:'preprint',publisher:'bioRxiv',category:item.category||null,
        journal_doi:item.published && item.published!=='NA'?item.published:null}},state,response);
    if(row)records.push(row);
  }
  const offset=state.offset+items.length,updated=counts({...state,offset,last_page_ids:pageIds},response,items.length,records.length);
  return offset>=total?{...advanceWindow(updated,source.adapter),records,response}:{done:false,state:updated,records,response};
}

async function rss(source,state,env) {
  const hosts=source.config.allowed_hosts;
  if(!Array.isArray(hosts) || !hosts.length || source.config.official_feed_verified!==true)throw new IngestionError('Company RSS has no verified official host allowlist',{permanent:true});
  const headers={};if(source.etag)headers['If-None-Match']=source.etag;if(source.last_modified)headers['If-Modified-Since']=source.last_modified;
  const response=await request(source.url,hosts,env,headers);
  if(response.status===304)return {done:true,state:counts(state,response,0,0),records:[],response};
  const doc=xml(response.body),feed=doc.rss?.channel||doc.feed||doc.RDF;
  if(!feed)throw new IngestionError('Company source is not RSS/Atom');
  const items=asArray(feed.item||feed.entry);
  if(items.length>40)throw new IngestionError('Feed exceeds 40 items; dedicated adapter required',{permanent:true});
  const fragments=response.body.match(/<(?:[\w]+:)?(?:item|entry)\b[^>]*>[\s\S]*?<\/(?:[\w]+:)?(?:item|entry)>/g)||[];
  const records=[];let rejected=0;
  for(let i=0;i<items.length;i++) {
    const item=items[i],links=asArray(item.link),link=links.find(value=>typeof value==='string'||!value['@_rel']||value['@_rel']==='alternate');
    const href=typeof link==='string'?link:link?.['@_href'];
    const title=plain(scalar(item.title));
    if(!title || !href){rejected++;continue;}
    let url;try{url=safeURL(new URL(href,response.url).href,hosts);}catch{rejected++;continue;}
    for(const key of [...url.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/.test(key))url.searchParams.delete(key);
    url.hash='';
    const row=await record(source,{external_id:scalar(item.guid||item.id)||url.href,canonical_url:url.href,title,
      content_text:plain(scalar(item.encoded||item.content||item.description||item.summary))||title,
      published_at:iso(scalar(item.pubDate||item.published||item.updated))},
      {raw_xml:fragments[i]||null,format:doc.feed?'atom':'rss',date_raw:scalar(item.pubDate||item.published||item.updated),source_company_id:source.company_id||null},state,response);
    if(row)records.push(row);
  }
  return {done:true,state:{...counts(state,response,items.length,records.length),rejected_links:rejected},records,response};
}

export async function dispatch(sql,queue,scheduledAt=Date.now(),triggerKind='cron') {
  if(!['cron','manual'].includes(triggerKind))throw new Error('Unknown scheduler trigger kind');
  const rows=await sql.query('SELECT * FROM ingestion_dispatch_hourly($1::timestamptz,$2)',[new Date(scheduledAt).toISOString(),triggerKind]);
  let enqueued=0;
  try {
    if(rows.length && typeof queue.sendBatch==='function') {
      await queue.sendBatch(rows.map(row=>({body:{job_id:row.job_id}})));enqueued=rows.length;
    } else {
      for(const row of rows){await queue.send({job_id:row.job_id});enqueued++;}
    }
    await sql.query("UPDATE scheduler_runs SET status='succeeded',finished_at=now(),error=NULL,dispatched_count=$2 WHERE scheduled_at=date_trunc('hour',$1::timestamptz) AND trigger_kind=$3",
      [new Date(scheduledAt).toISOString(),enqueued,triggerKind]);
  } catch(error) {
    await sql.query("UPDATE scheduler_runs SET status='failed',finished_at=now(),error=$2,dispatched_count=$3 WHERE scheduled_at=date_trunc('hour',$1::timestamptz) AND trigger_kind=$4",
      [new Date(scheduledAt).toISOString(),'Queue delivery failed: '+String(error.message).slice(0,300),enqueued,triggerKind]);
    throw error;
  }
  return {status:'succeeded',due:rows.length,enqueued};
}

export async function consume(batch,env,sql) {
  const results=[];
  for(const message of batch.messages) {
    let claimed;const started=Date.now();
    try {
      const id=message.body?.job_id;
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id||''))){message.ack();results.push({status:'invalid_message'});continue;}
      const claim=rpcResult(await sql.query('SELECT ingestion_claim($1::uuid,$2) AS result',[id,'cf-'+crypto.randomUUID()]));
      if(!claim)throw new Error('Database claim returned no result');
      if(['running','not_due','rate_limited'].includes(claim.status)){message.retry({delaySeconds:Math.min(3600,Math.max(1,Number(claim.retry_after)||60))});results.push({status:claim.status});continue;}
      if(claim.status!=='claimed'){message.ack();results.push({status:claim.status});continue;}
      claimed=claim;
      const {job,source}=claim;
      let checkpoint=job.checkpoint;
      if(job.attempts===1 && !checkpoint?.target_date && source.adapter!=='rss') {
        const history=await sql.query("SELECT id,checkpoint FROM ingestion_jobs WHERE source_id=$1::uuid AND id<>$2::uuid AND status='dead' AND checkpoint->>'query_version'=$3 AND checkpoint ? 'target_date' AND ($4::text IS NULL OR checkpoint->>'target_date'>$4) ORDER BY created_at DESC LIMIT 1",
          [source.id,job.id,source.config.query_version||QUERY_VERSION,source.config.cursor_date||null]);
        if(history[0])checkpoint={...history[0].checkpoint,resumed_from_job_id:history[0].id};
      }
      const state=initialState(source,checkpoint,env.NOW?.()||Date.now());
      const adapter={europepmc:europePMC,pubmed,biorxiv:bioRxiv,rss}[source.adapter];
      if(!adapter)throw new IngestionError('Unsupported cloud adapter',{permanent:true});
      const page=await adapter(source,state,env);
      const metrics={http_status:page.response.status,duration_ms:Date.now()-started,bytes_fetched:page.response.bytes,
        retrieved_total:page.state.retrieved_total,matched_total:page.state.matched_total,bytes_total:page.state.bytes_total,
        rejected_links:page.state.rejected_links||0,query_version:page.state.query_version};
      let result;
      if(page.done) {
        const cursor={query_version:page.state.query_version,...(source.adapter!=='rss'?{cursor_date:page.state.target_date}:{}),
          etag:page.response.headers.get('etag'),last_modified:page.response.headers.get('last-modified')};
        result=rpcResult(await sql.query('SELECT ingestion_finish($1::uuid,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb) AS result',
          [id,job.lease_token,JSON.stringify(page.records),JSON.stringify(cursor),JSON.stringify(metrics)]));
      } else {
        result=rpcResult(await sql.query('SELECT ingestion_checkpoint($1::uuid,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb) AS result',
          [id,job.lease_token,JSON.stringify(page.records),JSON.stringify(page.state),JSON.stringify(metrics)]));
        if(result?.status==='checkpoint') {
          // The durable checkpoint is committed first. A send failure is recovered by the hourly dispatcher.
          if(!env.INGEST_QUEUE)throw new Error('INGEST_QUEUE binding is required for page continuation');
          await env.INGEST_QUEUE.send({job_id:id},{delaySeconds:1});
        }
      }
      if(!result)throw new Error('Database page completion returned no result');
      message.ack();results.push({...result,records:page.records.length});
    } catch(error) {
      if(claimed) {
        try {
          const details={message:String(error.message).slice(0,1000),permanent:error.permanent===true,http_status:error.http_status??null,
            retry_after:error.retry_after||0,bytes_fetched:error.bytes_fetched??null,duration_ms:Date.now()-started};
          const failed=rpcResult(await sql.query('SELECT ingestion_fail($1::uuid,$2::uuid,$3::jsonb) AS result',
            [claimed.job.id,claimed.job.lease_token,JSON.stringify(details)]));
          if(failed?.status==='dead'||failed?.status==='lease_lost'){message.ack();results.push(failed);continue;}
          message.retry({delaySeconds:Math.min(3600,Number(failed?.retry_after)||60)});results.push({status:'retry'});continue;
        } catch { /* PG or network unavailable: keep queue delivery pending. */ }
      }
      message.retry({delaySeconds:60});results.push({status:'infrastructure_retry'});
    }
  }
  return results;
}
