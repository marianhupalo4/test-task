import type { Db } from './pool.js';

export interface ClientKeyRow {
  client_id: string;
  key_version: number;
  wrapped_key: Buffer;
  wrap_nonce: Buffer;
  master_key_version: number;
}

export interface CredentialRow {
  id: string;
  client_id: string;
  key_version: number;
  provider: string;
  status: 'active' | 'revoked';
  ciphertext: Buffer | null;
  nonce: Buffer | null;
  revoked_at: Date | null;
}

export type CredentialWithKeyRow = CredentialRow & ClientKeyRow;

export async function findClientKey(db: Db, clientId: string): Promise<ClientKeyRow | null> {
  const { rows } = await db.query<ClientKeyRow>(
    `SELECT client_id, key_version, wrapped_key, wrap_nonce, master_key_version
       FROM client_keys
      WHERE client_id = $1
      ORDER BY key_version DESC
      LIMIT 1`,
    [clientId],
  );
  return rows[0] ?? null;
}

export async function insertClientKeyIfMissing(db: Db, key: ClientKeyRow): Promise<void> {
  await db.query(
    `INSERT INTO client_keys (client_id, key_version, wrapped_key, wrap_nonce, master_key_version)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING`,
    [key.client_id, key.key_version, key.wrapped_key, key.wrap_nonce, key.master_key_version],
  );
}

export async function insertCredential(
  db: Db,
  credential: {
    id: string;
    clientId: string;
    keyVersion: number;
    provider: string;
    label: string | null;
    ciphertext: Buffer;
    nonce: Buffer;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO credentials (id, client_id, key_version, provider, label, ciphertext, nonce, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
    [
      credential.id,
      credential.clientId,
      credential.keyVersion,
      credential.provider,
      credential.label,
      credential.ciphertext,
      credential.nonce,
    ],
  );
}

export async function findCredentialWithKey(
  db: Db,
  id: string,
): Promise<CredentialWithKeyRow | null> {
  const { rows } = await db.query<CredentialWithKeyRow>(
    `SELECT c.id, c.client_id, c.key_version, c.provider, c.status, c.ciphertext, c.nonce,
            c.revoked_at, k.wrapped_key, k.wrap_nonce, k.master_key_version
       FROM credentials c
       JOIN client_keys k ON k.client_id = c.client_id AND k.key_version = c.key_version
      WHERE c.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findCredentialForUpdate(db: Db, id: string): Promise<CredentialRow | null> {
  const { rows } = await db.query<CredentialRow>(
    `SELECT id, client_id, key_version, provider, status, ciphertext, nonce, revoked_at
       FROM credentials
      WHERE id = $1
        FOR UPDATE`,
    [id],
  );
  return rows[0] ?? null;
}

export async function markRevoked(db: Db, id: string): Promise<Date> {
  const { rows } = await db.query<{ revoked_at: Date }>(
    `UPDATE credentials
        SET status = 'revoked', revoked_at = now(), ciphertext = NULL, nonce = NULL
      WHERE id = $1
      RETURNING revoked_at`,
    [id],
  );
  return rows[0]!.revoked_at;
}
