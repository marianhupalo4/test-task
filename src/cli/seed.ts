import type pg from 'pg';
import { type TokenSpec, issueToken } from '../vault/tokens.js';
import { PROVIDERS } from '../vault/vault.js';

export const SEED_TOKENS: TokenSpec[] = [
  {
    name: 'backend',
    permissions: [
      ...PROVIDERS.flatMap((provider) => [`store:${provider}`, `revoke:${provider}`]),
      'audit:read',
    ],
    purposes: [],
  },
  {
    name: 'worker',
    permissions: PROVIDERS.map((provider) => `use:${provider}`),
    purposes: ['daily_report', 'alerts'],
  },
];

export async function seed(pool: pg.Pool): Promise<{ name: string; token: string }[]> {
  const issued = [];
  for (const spec of SEED_TOKENS) {
    const { token } = await issueToken(pool, spec);
    issued.push({ name: spec.name, token });
  }
  return issued;
}
