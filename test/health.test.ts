import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/server/app.js';

describe('GET /health', () => {
  const app = buildApp({ logLevel: 'silent' });

  afterAll(() => app.close());

  it('returns ok without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', version: '0.1.0' });
  });
});
