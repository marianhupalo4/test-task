import { randomUUID } from 'node:crypto';
import { generateServiceToken, hashServiceToken } from '../crypto/index.js';
import type { Db } from '../db/pool.js';
import { findActiveTokenByHash, insertToken } from '../db/tokens.js';

export interface Actor {
  tokenId: string;
  name: string;
  permissions: Set<string>;
  purposes: Set<string>;
}

export interface TokenSpec {
  name: string;
  permissions: string[];
  purposes: string[];
}

export async function issueToken(db: Db, spec: TokenSpec): Promise<{ id: string; token: string }> {
  const id = randomUUID();
  const token = generateServiceToken();
  await insertToken(db, { id, hash: hashServiceToken(token), ...spec });
  return { id, token };
}

export async function authenticate(db: Db, token: string): Promise<Actor | null> {
  const row = await findActiveTokenByHash(db, hashServiceToken(token));
  if (!row) return null;
  return {
    tokenId: row.id,
    name: row.name,
    permissions: new Set(row.permissions),
    purposes: new Set(row.purposes),
  };
}
