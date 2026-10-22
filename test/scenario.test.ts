import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TestContext, createTestContext } from './helpers.js';

describe('main scenario', () => {
  let ctx: TestContext;
  const clientId = 'client-scenario';
  const secret = 'shpat_scenario_secret_value';
  let credentialId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(() => ctx.close());

  const history = async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/v1/audit?client_id=${clientId}`,
      headers: ctx.auth(ctx.tokens.backend),
    });
    expect(res.statusCode).toBe(200);
    return res.json().events as Array<Record<string, unknown>>;
  };

  it('backend stores a secret', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/credentials',
      headers: ctx.auth(ctx.tokens.backend),
      payload: { client_id: clientId, provider: 'shopify', secret },
    });

    expect(res.statusCode).toBe(201);
    credentialId = res.json().credential_id;
    expect(credentialId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('worker uses the secret with an allowed purpose', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/v1/credentials/${credentialId}/use`,
      headers: ctx.auth(ctx.tokens.worker),
      payload: { purpose: 'daily_report' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ secret, provider: 'shopify', client_id: clientId });
  });

  it('audit has the store and use events', async () => {
    const events = await history();

    expect(events.map((e) => [e.action, e.outcome, e.service])).toEqual([
      ['use', 'allowed', 'worker'],
      ['store', 'allowed', 'backend'],
    ]);
    expect(events[0]).toMatchObject({
      credential_id: credentialId,
      provider: 'shopify',
      purpose: 'daily_report',
      http_status: 200,
    });
  });

  it('revoke is idempotent', async () => {
    const revoke = () =>
      ctx.app.inject({
        method: 'POST',
        url: `/v1/credentials/${credentialId}/revoke`,
        headers: ctx.auth(ctx.tokens.backend),
      });

    const first = await revoke();
    const second = await revoke();

    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ credential_id: credentialId, status: 'revoked' });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());

    const { rows } = await ctx.pool.query(
      'SELECT ciphertext, nonce FROM credentials WHERE id = $1',
      [credentialId],
    );
    expect(rows[0]).toEqual({ ciphertext: null, nonce: null });
  });

  it('use after revoke returns 410', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/v1/credentials/${credentialId}/use`,
      headers: ctx.auth(ctx.tokens.worker),
      payload: { purpose: 'daily_report' },
    });

    expect(res.statusCode).toBe(410);
    expect(res.body).not.toContain(secret);
  });

  it('client history shows the whole lifecycle, newest first', async () => {
    const events = await history();

    expect(events.map((e) => [e.action, e.outcome, e.http_status])).toEqual([
      ['use', 'denied', 410],
      ['revoke', 'allowed', 200],
      ['revoke', 'allowed', 200],
      ['audit_read', 'allowed', 200],
      ['use', 'allowed', 200],
      ['store', 'allowed', 201],
    ]);
    expect(events[0]).toMatchObject({ reason: 'revoked', service: 'worker' });
  });
});

describe('rejections', () => {
  let ctx: TestContext;
  const clientId = 'client-rejections';
  const secret = 'shpat_rejection_secret_value';
  let credentialId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/credentials',
      headers: ctx.auth(ctx.tokens.backend),
      payload: { client_id: clientId, provider: 'meta_ads', secret },
    });
    credentialId = res.json().credential_id;
  });

  afterAll(() => ctx.close());

  const use = (payload: object, token = ctx.tokens.worker) =>
    ctx.app.inject({
      method: 'POST',
      url: `/v1/credentials/${credentialId}/use`,
      headers: ctx.auth(token),
      payload,
    });

  const lastEvent = async () => {
    const { rows } = await ctx.pool.query('SELECT * FROM audit_events ORDER BY id DESC LIMIT 1');
    return rows[0];
  };

  it('missing purpose returns 400 and is audited', async () => {
    const res = await use({});

    expect(res.statusCode).toBe(400);
    expect(await lastEvent()).toMatchObject({ action: 'use', outcome: 'denied', http_status: 400 });
  });

  it('purpose not allowed for the service returns 403 and is audited', async () => {
    const res = await use({ purpose: 'export' });

    expect(res.statusCode).toBe(403);
    expect(res.body).not.toContain(secret);
    expect(await lastEvent()).toMatchObject({
      action: 'use',
      outcome: 'denied',
      http_status: 403,
      purpose: 'export',
      reason: 'purpose_not_allowed',
      client_id: clientId,
    });
  });

  it('token without use permission returns 403', async () => {
    const res = await use({ purpose: 'daily_report' }, ctx.tokens.backend);

    expect(res.statusCode).toBe(403);
  });

  it('worker cannot read history', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/v1/audit?client_id=${clientId}`,
      headers: ctx.auth(ctx.tokens.worker),
    });

    expect(res.statusCode).toBe(403);
  });

  it('invalid token returns 401 and is audited without a token id', async () => {
    const res = await use({ purpose: 'daily_report' }, 'evk_invalid');

    expect(res.statusCode).toBe(401);
    expect(await lastEvent()).toMatchObject({ action: 'use', http_status: 401, token_id: null });
  });

  it('unknown credential returns 404', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/credentials/00000000-0000-4000-8000-000000000000/use',
      headers: ctx.auth(ctx.tokens.worker),
      payload: { purpose: 'daily_report' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('use does not return the secret when the audit cannot be written', async () => {
    await ctx.pool.query(`
      CREATE FUNCTION fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'audit down'; END $$;
      CREATE TRIGGER fail_audit BEFORE INSERT ON audit_events
        FOR EACH ROW EXECUTE FUNCTION fail_audit();
    `);
    try {
      const res = await use({ purpose: 'daily_report' });

      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe('audit_unavailable');
      expect(res.body).not.toContain(secret);
    } finally {
      await ctx.pool.query('DROP TRIGGER fail_audit ON audit_events; DROP FUNCTION fail_audit();');
    }
  });
});
