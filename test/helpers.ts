import { randomBytes, randomUUID } from 'node:crypto';
import { inject } from 'vitest';
import { seed } from '../src/cli/seed.js';
import { createPool } from '../src/db/pool.js';
import { buildApp } from '../src/server/app.js';
import { TEMPLATE_DB, databaseUrl } from './db.js';

export async function createTestContext() {
  const adminUrl = inject('pgUrl');
  const dbName = `test_${randomUUID().replaceAll('-', '')}`;
  const admin = createPool(adminUrl);
  await admin.query(`CREATE DATABASE ${dbName} TEMPLATE ${TEMPLATE_DB}`);
  await admin.end();

  const pool = createPool(databaseUrl(adminUrl, dbName));
  const masterKey = randomBytes(32);
  const logs: string[] = [];
  const app = buildApp({
    logLevel: 'trace',
    logStream: { write: (msg) => logs.push(msg) },
    pool,
    masterKey,
  });
  const issued = await seed(pool);
  const token = (name: string) => issued.find((t) => t.name === name)!.token;

  return {
    app,
    pool,
    masterKey,
    logs,
    tokens: { backend: token('backend'), worker: token('worker') },
    auth: (value: string) => ({ authorization: `Bearer ${value}` }),
    async close() {
      await app.close();
      await pool.end();
    },
  };
}

export type TestContext = Awaited<ReturnType<typeof createTestContext>>;
