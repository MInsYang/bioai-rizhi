import { neon, neonConfig, Pool } from '@neondatabase/serverless';

// Queries use Neon's HTTPS endpoint; interactive editorial transactions use WSS.
// Create/close every transaction within the request: never share clients across isolates.
export function database(env) {
  if (!env.DATABASE_URL) throw new Error('Cloud PostgreSQL is not configured');
  const url = new URL(env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.neon.tech')) {
    throw new Error('Cloud runtime requires a Neon PostgreSQL connection');
  }
  const run = neon(env.DATABASE_URL);
  return {
    query(text, params = []) { return run.query(text, params, { fetchOptions: { signal: AbortSignal.timeout(15000) } }); },
    async transaction(operation) {
      if (Array.isArray(operation)) {
        return run.transaction(operation.map(q => run.query(q.text, q.params || [])));
      }
      neonConfig.webSocketConstructor = WebSocket;
      const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1, connectionTimeoutMillis: 15000 });
      let client;
      try {
        client = await pool.connect();
        await client.query('BEGIN');
        await client.query("SET LOCAL statement_timeout = '15s'");
        const result = await operation({ query: async (text, params = []) => (await client.query(text, params)).rows });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client?.release();
        await pool.end();
      }
    },
  };
}
