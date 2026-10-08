import { database } from './db.js';
import { apiRead, handleApi } from './api.js';
import { dispatch, consume } from './ingestion.js';
import { handleMcp } from './mcp.js';
import { publication } from './publication.js';
import { candidateApi } from './candidates.js';

const json = (data, status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function admin(request, env) {
  const expected=env.ADMIN_TOKEN || '', supplied=request.headers.get('authorization')?.replace(/^Bearer /,'') || '';
  if(expected.length<32)return false;
  const digest=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
  const [a,b]=await Promise.all([digest(expected),digest(supplied)]);let diff=0;
  for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}

function secure(response) {
  const result=new Response(response.body,response);
  result.headers.set('X-Content-Type-Options','nosniff');
  result.headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  result.headers.set('X-Frame-Options','DENY');
  if(result.headers.get('content-type')?.includes('text/html'))result.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  return result;
}

export function createWorker(dbFactory=database) {
  return {
    async fetch(request,env,ctx) {
      try {
        const url=new URL(request.url), path=url.pathname;
        if(path.startsWith('/internal/') && !(await admin(request,env)))return json({detail:'Admin token required'},401);
        if(path.startsWith('/api/admin/candidates') && !(await admin(request,env)))return json({detail:'Admin token required'},401);
        if(path.startsWith('/api/') && env.API_RATE_LIMITER){
          const check=await env.API_RATE_LIMITER.limit({key:request.headers.get('cf-connecting-ip') || 'unknown'});
          if(!check.success)return new Response('Too many requests',{status:429,headers:{'Retry-After':'60'}});
        }
        // Static assets do not need a database connection.
        if(!path.startsWith('/api/') && !path.startsWith('/internal/') && path!='/mcp' && path!='/health' && !['/','/feed.xml','/robots.txt','/llms.txt','/sitemap.xml','/connect'].includes(path) && !/^\/(topics|companies|records|events|digest)\//.test(path))return secure(await env.ASSETS.fetch(request));
        if(path==='/api/config')return json({version:'3.1.0',github_url:env.GITHUB_URL || null,cadence_hours:1,daily_digest_time:'08:00',timezone:'Asia/Shanghai',mcp_url:(env.SITE_ORIGIN || url.origin)+'/mcp'});
        const sql=dbFactory(env), read=(p,params={})=>apiRead(p,params,sql);
        if(path.startsWith('/api/admin/candidates')) {
          return secure(await candidateApi(request,sql));
        }
        if(path==='/mcp')return secure(await handleMcp(request,env,ctx,read));
        if(path==='/health'){
          const rows=await sql.query('SELECT 1 AS ok');
          return json({database:rows[0].ok,version:'3.1.0',runtime:'cloudflare',cadence_hours:1});
        }
        if(path==='/internal/dispatch' && request.method==='POST')return json(await dispatch(sql,env.INGEST_QUEUE,Date.now(),'manual'));
        if(path==='/internal/digest' && request.method==='POST')return json((await sql.query('SELECT generate_daily_digest(now()) AS digest'))[0]);
        if(path.startsWith('/internal/'))return json({detail:'Not found'},404);
        const published=await publication(request,env,sql,read);if(published)return secure(published);
        const api=await handleApi(request,env,sql);if(api)return secure(api);
        return json({detail:'Not found'},404);
      }catch(error){
        // Do not expose database URLs, request bodies or upstream raw errors publicly.
        const status=Number(error.status || error.statusCode);
        if(status>=400 && status<500)return json({detail:error.detail || error.message},status);
        console.error(JSON.stringify({event:'request_failed',name:error.name || 'Error'}));
        return json({detail:'数据服务暂不可用，请稍后重试。'},503);
      }
    },
    async scheduled(controller,env,ctx) {
      const sql=dbFactory(env);
      if(controller.cron==='0 0 * * *')ctx.waitUntil(sql.query('SELECT generate_daily_digest($1::timestamptz)',[new Date(controller.scheduledTime).toISOString()]));
      else {
        ctx.waitUntil(dispatch(sql,env.INGEST_QUEUE,controller.scheduledTime));
        ctx.waitUntil(sql.query('SELECT propose_industry_candidates()'));
        // Retry the immutable daily selection on hourly ticks if 08:00 invocation failed.
        ctx.waitUntil(sql.query('SELECT generate_daily_digest($1::timestamptz)',[new Date(controller.scheduledTime).toISOString()]));
      }
    },
    async queue(batch,env) { await consume(batch,env,dbFactory(env)); },
  };
}
export default createWorker();
