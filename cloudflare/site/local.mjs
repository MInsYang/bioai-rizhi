// Local acceptance harness for the exact Worker handlers against local PostgreSQL.
// The local queue is an explicit test transport, never a deployment substitute.
import http from 'node:http';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { createWorker } from './index.js';
import { dispatch, consume } from './ingestion.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
try{process.loadEnvFile(path.join(root,'.env'));}catch{}
const dbURL=new URL(process.env.DATABASE_URL || 'postgresql://missing');
if(!['127.0.0.1','localhost'].includes(dbURL.hostname))throw new Error('Local harness requires local PostgreSQL');
const pool=new pg.Pool({connectionString:dbURL.href});
const sql={
  query:async(text,params=[]) => (await pool.query(text,params)).rows,
  async transaction(operation){
    const c=await pool.connect();try{await c.query('BEGIN');const tx={query:async(t,p=[]) => (await c.query(t,p)).rows};
      const result=Array.isArray(operation)?await Promise.all(operation.map(q=>tx.query(q.text,q.params))):await operation(tx);
      await c.query('COMMIT');return result;
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  },
};
const pending=[];
const queue={async send(body,options={}){pending.push({body,at:Date.now()+(options.delaySeconds||0)*1000});}};
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const port=Number(process.env.BIOAI_PREVIEW_PORT || 8788);
const env={ADMIN_TOKEN:process.env.ADMIN_TOKEN,INGEST_QUEUE:queue,SITE_ORIGIN:'http://127.0.0.1:'+port,GITHUB_URL:process.env.GITHUB_URL,
  ASSETS:{async fetch(request){
    let name=new URL(request.url).pathname;if(name==='/')name='/index.html';
    const target=path.resolve(root,'dist','.'+decodeURIComponent(name));
    if(!target.startsWith(path.join(root,'dist')+path.sep))return new Response('Not found',{status:404});
    try{return new Response(await fs.readFile(target),{headers:{'Content-Type':mime[path.extname(target)] || 'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}
  }},
};
const worker=createWorker(()=>sql);

if(process.argv.includes('--ingest')){
  const report={started_at:new Date().toISOString(),runtime:'local PostgreSQL + exact Worker ingestion handlers',queue_transport:'in-process acceptance harness',real_network:true,pages:[],status:'running'};
  try{
    report.dispatch=await dispatch(sql,queue,Date.now(),'manual');
    while(pending.length && report.pages.length<500){
      pending.sort((a,b)=>a.at-b.at);const message=pending.shift();
      const delay=message.at-Date.now();if(delay>0)await new Promise(r=>setTimeout(r,Math.min(delay,61000)));
      if(message.at>Date.now()){pending.push(message);continue;}
      const results=await consume({messages:[{body:message.body,ack(){},retry(o){queue.send(message.body,o);}}]},env,sql);
      report.pages.push(...results);console.log(JSON.stringify({page:report.pages.length,...results[0]}));
    }
    report.sources=await sql.query(`SELECT name,adapter,last_success_at,consecutive_failures,config->'last_collection' AS last_collection FROM sources WHERE config->>'cloud_runtime_enabled'='true'`);
    report.jobs=await sql.query(`SELECT j.id,j.status,j.attempts,j.failure_count,j.last_error FROM ingestion_jobs j JOIN sources s ON s.id=j.source_id WHERE s.config->>'cloud_runtime_enabled'='true' ORDER BY j.created_at DESC LIMIT 10`);
    report.counts=(await sql.query(`SELECT (SELECT count(*) FROM public_resources) AS resources,(SELECT count(*) FROM raw_items) AS raw_records,(SELECT count(*) FROM companies) AS companies`))[0];
    report.status=pending.length?'incomplete':report.jobs.some(j=>j.status==='dead')?'completed_with_source_failures':'passed';
  }catch(error){report.status='failed';report.error=error.message;process.exitCode=1;}
  finally{report.finished_at=new Date().toISOString();await fs.writeFile(path.join(root,'docs/cloud-ingestion-e2e.json'),JSON.stringify(report,null,2));await pool.end();}
}else{
  http.createServer(async(req,res)=>{
    try{
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>1024*1024){res.writeHead(413).end();return;}chunks.push(chunk);}
      const request=new Request('http://127.0.0.1:'+port+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
      const response=await worker.fetch(request,env,{waitUntil(p){p.catch(()=>{});}});
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
    }catch(error){console.error(error.name,error.message);res.writeHead(500).end('Local harness error');}
  }).listen(port,'127.0.0.1',()=>console.log('Worker handlers + local PostgreSQL: http://127.0.0.1:'+port));
}
