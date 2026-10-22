import { randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createPool } from '../src/db/pool.js';
import { buildApp } from '../src/server/app.js';

describe('GET /health', () => {
  const pool = createPool('postgres://localhost:1/unused');
  const app = buildApp({ logLevel: 'silent', pool, masterKey: randomBytes(32) });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('returns ok without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', version: '0.1.0' });
  });
});
