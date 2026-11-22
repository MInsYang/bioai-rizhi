import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {userInfo} from 'node:os';

const migrations = new URL('../../backend/migrations/', import.meta.url);
const fixtures = new URL('../../backend/tests/fixtures/', import.meta.url);
const migrationName = '017_index_metadata.sql';

test('metadata migration preserves existing rows, lease RPCs and evidence views', async () => {
  const text = await readFile(new URL(migrationName, migrations), 'utf8');
  assert.doesNotMatch(text, /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i);
  assert.doesNotMatch(text, /^\s*(?:UPDATE|ALTER\s+TABLE|CREATE\s+TABLE)\b/mi);
  assert.deepEqual([...text.matchAll(/CREATE OR REPLACE FUNCTION (\w+)/g)].map(x => x[1]),
    ['ingestion_store_records', 'propose_industry_candidates', 'generate_daily_digest']);
  assert.deepEqual([...text.matchAll(/CREATE OR REPLACE VIEW (\w+)/g)].map(x => x[1]),
    ['public_records', 'public_resources']);
  // The production caller still owns its existing job -> source lock order.
  assert.doesNotMatch(text, /\bFOR\s+(?:UPDATE|SHARE)\b|pg_advisory_xact_lock/i);
});

test('metadata SQL behavior in an explicitly selected disposable Unix-socket PostgreSQL',
  {skip: process.env.BIOAI_TEST_INDEX_METADATA_SQL !== '1'}, async t => {
    // No .env or DATABASE_URL loading, TCP connections, admin DB, or credentials.
    assert.match(process.env.PGHOST || '', /^\/tmp\/wx-iambic-pg-[A-Za-z0-9_-]+$/);
    assert.equal(process.env.PGDATABASE, 'iambic_test');
    assert.match(process.env.PGPORT || '', /^\d{4,5}$/);
    const {default: pg} = await import('pg');
    const client = new pg.Client({host: process.env.PGHOST, port: Number(process.env.PGPORT),
      database: process.env.PGDATABASE, user: process.env.PGUSER || userInfo().username,
      password: '', ssl: false, connectionTimeoutMillis: 5000,
      application_name: 'bioai-index-metadata-fixture'});
    await client.connect();
    try {
      await client.query('BEGIN');
      const previous = (await readdir(migrations)).filter(x => x.endsWith('.sql') && x < migrationName).sort();
      assert.equal(previous.length, 16);
      for (const name of previous) await client.query(await readFile(new URL(name, migrations), 'utf8'));
      // Historical rows and an immutable digest exist before the new migration.
      await client.query(await readFile(new URL('index_metadata_setup.sql', fixtures), 'utf8'));
      await client.query(await readFile(new URL(migrationName, migrations), 'utf8'));
      await client.query(await readFile(new URL('index_metadata_assertions.sql', fixtures), 'utf8'));
      const {rows} = await client.query('SELECT count(*)::integer AS passed FROM index_metadata_checks');
      assert.ok(rows[0].passed >= 30, `Expected full behavioral fixture, got ${rows[0].passed} checks`);
      t.diagnostic(`${rows[0].passed} PostgreSQL behavior assertions passed; transaction rolled back`);
    } finally {
      try { await client.query('ROLLBACK'); } finally { await client.end(); }
    }
  });
