import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  DecryptionError,
  clientKeyAad,
  credentialAad,
  decrypt,
  encrypt,
  generateKey,
} from '../crypto/index.js';
import {
  type AuditAction,
  type AuditEventRow,
  insertAuditEvent,
  listAuditEvents,
} from '../db/audit.js';
import {
  type ClientKeyRow,
  findClientKey,
  findCredentialForUpdate,
  findCredentialWithKey,
  insertClientKeyIfMissing,
  insertCredential,
  markRevoked,
} from '../db/credentials.js';
import { type Db, withTransaction } from '../db/pool.js';
import { VaultError, errors } from './errors.js';
import type { Actor } from './tokens.js';

export const PROVIDERS = ['shopify', 'meta_ads', 'google_ads'] as const;
export type Provider = (typeof PROVIDERS)[number];

const MAX_SECRET_BYTES = 16 * 1024;
const CLIENT_KEY_VERSION = 1;
const MASTER_KEY_VERSION = 1;

export interface AuditContext {
  action: AuditAction;
  tokenId: string | null;
  clientId: string | null;
  credentialId: string | null;
  provider: string | null;
  purpose: string | null;
}

export class Vault {
  constructor(
    private readonly pool: pg.Pool,
    private readonly masterKey: Buffer,
  ) {}

  async store(
    actor: Actor,
    audit: AuditContext,
    input: { clientId: string; provider: Provider; secret: string; label: string | null },
  ): Promise<{ credentialId: string }> {
    audit.clientId = input.clientId;
    audit.provider = input.provider;
    requirePermission(actor, `store:${input.provider}`);
    if (Buffer.byteLength(input.secret, 'utf8') > MAX_SECRET_BYTES) {
      throw errors.validation('secret must not exceed 16 KiB');
    }

    return withTransaction(this.pool, async (tx) => {
      const { key, keyVersion } = await this.loadOrCreateClientKey(tx, input.clientId);
      const credentialId = randomUUID();
      audit.credentialId = credentialId;
      const { ciphertext, nonce } = encrypt(
        key,
        Buffer.from(input.secret, 'utf8'),
        credentialAad(credentialId, input.clientId, keyVersion),
      );
      await insertCredential(tx, {
        id: credentialId,
        clientId: input.clientId,
        keyVersion,
        provider: input.provider,
        label: input.label,
        ciphertext,
        nonce,
      });
      await writeAudit(tx, audit, 201);
      return { credentialId };
    });
  }

  async use(
    actor: Actor,
    audit: AuditContext,
    credentialId: string,
    purpose: string,
  ): Promise<{ secret: string; provider: string; clientId: string }> {
    audit.credentialId = credentialId;
    audit.purpose = purpose;
    const row = await findCredentialWithKey(this.pool, credentialId);
    if (!row) throw errors.notFound();
    audit.clientId = row.client_id;
    audit.provider = row.provider;
    requirePermission(actor, `use:${row.provider}`);
    if (!actor.purposes.has(purpose)) throw errors.purposeNotAllowed();
    if (row.status === 'revoked' || !row.ciphertext || !row.nonce) throw errors.revoked();

    let secret: string;
    try {
      const key = this.unwrapClientKey(row);
      secret = decrypt(
        key,
        row.ciphertext,
        row.nonce,
        credentialAad(row.id, row.client_id, row.key_version),
      ).toString('utf8');
    } catch (err) {
      if (err instanceof DecryptionError) throw errors.decryptionFailed();
      throw err;
    }

    await writeAudit(this.pool, audit, 200);
    return { secret, provider: row.provider, clientId: row.client_id };
  }

  async revoke(
    actor: Actor,
    audit: AuditContext,
    credentialId: string,
  ): Promise<{ credentialId: string; status: 'revoked'; revokedAt: Date }> {
    audit.credentialId = credentialId;
    return withTransaction(this.pool, async (tx) => {
      const row = await findCredentialForUpdate(tx, credentialId);
      if (!row) throw errors.notFound();
      audit.clientId = row.client_id;
      audit.provider = row.provider;
      requirePermission(actor, `revoke:${row.provider}`);
      const revokedAt =
        row.status === 'revoked' && row.revoked_at
          ? row.revoked_at
          : await markRevoked(tx, credentialId);
      await writeAudit(tx, audit, 200);
      return { credentialId, status: 'revoked' as const, revokedAt };
    });
  }

  async history(
    actor: Actor,
    audit: AuditContext,
    query: { clientId: string; credentialId: string | null; cursor: string | null; limit: number },
  ): Promise<{ events: AuditEventRow[]; nextCursor: string | null }> {
    audit.clientId = query.clientId;
    audit.credentialId = query.credentialId;
    requirePermission(actor, 'audit:read');
    const events = await listAuditEvents(this.pool, {
      clientId: query.clientId,
      credentialId: query.credentialId,
      before: query.cursor,
      limit: query.limit,
    });
    await writeAudit(this.pool, audit, 200);
    const nextCursor = events.length === query.limit ? (events.at(-1)?.id ?? null) : null;
    return { events, nextCursor };
  }

  async recordRejection(audit: AuditContext, error: VaultError): Promise<void> {
    await insertAuditEvent(this.pool, {
      ...audit,
      outcome: error.status >= 500 ? 'error' : 'denied',
      httpStatus: error.status,
      reason: error.code,
    });
  }

  private async loadOrCreateClientKey(
    tx: pg.PoolClient,
    clientId: string,
  ): Promise<{ key: Buffer; keyVersion: number }> {
    let row = await findClientKey(tx, clientId);
    if (!row) {
      const key = generateKey();
      const wrapped = encrypt(
        this.masterKey,
        key,
        clientKeyAad(clientId, CLIENT_KEY_VERSION, MASTER_KEY_VERSION),
      );
      await insertClientKeyIfMissing(tx, {
        client_id: clientId,
        key_version: CLIENT_KEY_VERSION,
        wrapped_key: wrapped.ciphertext,
        wrap_nonce: wrapped.nonce,
        master_key_version: MASTER_KEY_VERSION,
      });
      row = await findClientKey(tx, clientId);
    }
    return { key: this.unwrapClientKey(row!), keyVersion: row!.key_version };
  }

  private unwrapClientKey(row: ClientKeyRow): Buffer {
    return decrypt(
      this.masterKey,
      row.wrapped_key,
      row.wrap_nonce,
      clientKeyAad(row.client_id, row.key_version, row.master_key_version),
    );
  }
}

function requirePermission(actor: Actor, permission: string): void {
  if (!actor.permissions.has(permission)) throw errors.forbidden();
}

async function writeAudit(db: Db, audit: AuditContext, httpStatus: number): Promise<void> {
  try {
    await insertAuditEvent(db, {
      ...audit,
      outcome: 'allowed',
      httpStatus,
      reason: null,
    });
  } catch {
    throw errors.auditUnavailable();
  }
}
