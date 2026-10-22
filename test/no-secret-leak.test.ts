import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TestContext, createTestContext } from './helpers.js';

function encodings(value: string | Buffer): string[] {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
  return [bytes.toString('hex'), bytes.toString('base64'), bytes.toString('base64url')].concat(
    Buffer.isBuffer(value) ? [] : [value],
  );
}

describe('secrets do not leak into the database or logs', () => {
  let ctx: TestContext;
  const clientId = 'client-leak';
  const secrets = [
    `shpat_${randomBytes(16).toString('hex')}`,
    `EAAG${randomBytes(24).toString('base64url')}`,
  ];
  let sensitive: string[];

  beforeAll(async () => {
    ctx = await createTestContext();
    sensitive = [
      ...secrets.flatMap(encodings),
      ...encodings(ctx.tokens.backend),
      ...encodings(ctx.tokens.worker),
      ...encodings(ctx.masterKey),
    ];

    const ids: string[] = [];
    for (const [index, secret] of secrets.entries()) {
      const stored = await ctx.app.inject({
        method: 'POST',
        url: '/v1/credentials',
        headers: ctx.auth(ctx.tokens.backend),
        payload: { client_id: clientId, provider: index ? 'meta_ads' : 'shopify', secret },
      });
      ids.push(stored.json().credential_id);
    }
    for (const id of ids) {
      const used = await ctx.app.inject({
        method: 'POST',
        url: `/v1/credentials/${id}/use`,
        headers: ctx.auth(ctx.tokens.worker),
        payload: { purpose: 'alerts' },
      });
      expect(used.statusCode).toBe(200);
    }
    await ctx.app.inject({
      method: 'POST',
      url: `/v1/credentials/${ids[0]}/revoke`,
      headers: ctx.auth(ctx.tokens.backend),
    });
    await ctx.app.inject({
      method: 'POST',
      url: `/v1/credentials/${ids[0]}/use`,
      headers: ctx.auth(ctx.tokens.worker),
      payload: { purpose: 'alerts' },
    });
    await ctx.app.inject({
      method: 'GET',
      url: `/v1/audit?client_id=${clientId}`,
      headers: ctx.auth(ctx.tokens.backend),
    });
  });

  afterAll(() => ctx.close());

  it('database dump contains no secret, token or master key', async () => {
    const { rows: tables } = await ctx.pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const dump: string[] = [];
    for (const { table_name } of tables) {
      const { rows } = await ctx.pool.query<{ row: string }>(
        `SELECT row_to_json(t)::text AS row FROM "${table_name}" t`,
      );
      dump.push(...rows.map((r) => r.row));
    }
    const text = dump.join('\n');

    expect(dump.length).toBeGreaterThan(0);
    for (const value of sensitive) expect(text).not.toContain(value);
  });

  it('logs contain no secret, token or master key', () => {
    const text = ctx.logs.join('');

    expect(ctx.logs.length).toBeGreaterThan(0);
    for (const value of sensitive) expect(text).not.toContain(value);
    expect(text).not.toMatch(/evk_[A-Za-z0-9_-]{20,}/);
  });
});
