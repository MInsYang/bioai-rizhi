export async function dispatchScheduled(controller, env, transport=fetch) {
  if (!env.API_BASE || !env.INGEST_SECRET || env.INGEST_SECRET.length<32) throw new Error('Missing dispatcher secrets');
  const base=new URL(env.API_BASE);
  if(base.protocol!=='https:' || base.username || base.password) throw new Error('API_BASE must be HTTPS');
  const body=JSON.stringify({scheduledAt:controller.scheduledTime,windowHours:1});
  const timestamp=String(Math.floor(Date.now()/1000));
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.INGEST_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signed=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+'.'+body));
  const signature=Array.from(new Uint8Array(signed),b=>b.toString(16).padStart(2,'0')).join('');
  const response=await transport(new URL('/internal/ingestion/dispatch',base),{method:'POST',headers:{'Content-Type':'application/json','X-BioAI-Timestamp':timestamp,'X-BioAI-Signature':signature},body,signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw new Error('Dispatch failed with HTTP '+response.status);
  return response.json();
}
export default {scheduled(controller,env,ctx){ctx.waitUntil(dispatchScheduled(controller,env));}};
