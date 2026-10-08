import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from './index.js';

test('hourly tick also retries the due daily digest without coupling queue failures', async()=>{
  const queries=[], tasks=[];
  const sql={async query(text,params){queries.push({text,params});return text.includes('ingestion_dispatch_hourly')?[{job_id:crypto.randomUUID()}]:[];}};
  const worker=createWorker(()=>sql);
  await worker.scheduled({cron:'7 * * * *',scheduledTime:Date.parse('2026-10-08T03:07:00Z')},
    {INGEST_QUEUE:{async send(){throw new Error('Queue temporarily unavailable');}}},{waitUntil(p){tasks.push(p);}});
  const results=await Promise.allSettled(tasks);
  assert.equal(results[0].status,'rejected');assert.equal(results[1].status,'fulfilled');
  assert(queries.some(q=>q.text.includes('generate_daily_digest')&&q.params[0]==='2026-10-08T03:07:00.000Z'));
  assert(queries.some(q=>q.text.includes("status='failed'")));
});
test('internal actions reject anonymous callers before opening the database',async()=>{
  const worker=createWorker(()=>{throw new Error('database should not be opened');});
  const response=await worker.fetch(new Request('https://bioai.example/internal/dispatch',{method:'POST'}),{ADMIN_TOKEN:'a'.repeat(40)},{});
  assert.equal(response.status,401);
});
