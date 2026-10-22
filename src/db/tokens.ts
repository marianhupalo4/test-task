import type { Db } from './pool.js';

export interface TokenRow {
  id: string;
  name: string;
  permissions: string[];
  purposes: string[];
}

export async function insertToken(
  db: Db,
  token: { id: string; name: string; hash: Buffer; permissions: string[]; purposes: string[] },
): Promise<void> {
  await db.query('INSERT INTO service_tokens (id, name, token_hash) VALUES ($1, $2, $3)', [
    token.id,
    token.name,
    token.hash,
  ]);
  await db.query(
    'INSERT INTO token_permissions (token_id, permission) SELECT $1, unnest($2::text[])',
    [token.id, token.permissions],
  );
  await db.query('INSERT INTO token_purposes (token_id, purpose) SELECT $1, unnest($2::text[])', [
    token.id,
    token.purposes,
  ]);
}

export async function findActiveTokenByHash(db: Db, hash: Buffer): Promise<TokenRow | null> {
  const { rows } = await db.query<TokenRow>(
    `SELECT t.id, t.name,
            ARRAY(SELECT permission FROM token_permissions WHERE token_id = t.id) AS permissions,
            ARRAY(SELECT purpose FROM token_purposes WHERE token_id = t.id) AS purposes
       FROM service_tokens t
      WHERE t.token_hash = $1
        AND t.revoked_at IS NULL`,
    [hash],
  );
  return rows[0] ?? null;
}
