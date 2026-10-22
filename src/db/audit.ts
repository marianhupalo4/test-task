import type { Db } from './pool.js';

export type AuditAction = 'store' | 'use' | 'revoke' | 'audit_read';
export type AuditOutcome = 'allowed' | 'denied' | 'error';

export interface AuditEventInput {
  action: AuditAction;
  outcome: AuditOutcome;
  httpStatus: number;
  tokenId: string | null;
  clientId: string | null;
  credentialId: string | null;
  provider: string | null;
  purpose: string | null;
  reason: string | null;
}

export interface AuditEventRow {
  id: string;
  ts: Date;
  action: AuditAction;
  outcome: AuditOutcome;
  http_status: number;
  token_id: string | null;
  service: string | null;
  credential_id: string | null;
  provider: string | null;
  purpose: string | null;
  reason: string | null;
}

export async function insertAuditEvent(db: Db, event: AuditEventInput): Promise<void> {
  await db.query(
    `INSERT INTO audit_events
       (action, outcome, http_status, token_id, client_id, credential_id, provider, purpose, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      event.action,
      event.outcome,
      event.httpStatus,
      event.tokenId,
      event.clientId,
      event.credentialId,
      event.provider,
      event.purpose,
      event.reason,
    ],
  );
}

export async function listAuditEvents(
  db: Db,
  query: { clientId: string; credentialId: string | null; before: string | null; limit: number },
): Promise<AuditEventRow[]> {
  const { rows } = await db.query<AuditEventRow>(
    `SELECT e.id, e.ts, e.action, e.outcome, e.http_status, e.token_id, t.name AS service,
            e.credential_id, e.provider, e.purpose, e.reason
       FROM audit_events e
       LEFT JOIN service_tokens t ON t.id = e.token_id
      WHERE e.client_id = $1
        AND ($2::uuid IS NULL OR e.credential_id = $2)
        AND ($3::bigint IS NULL OR e.id < $3)
      ORDER BY e.id DESC
      LIMIT $4`,
    [query.clientId, query.credentialId, query.before, query.limit],
  );
  return rows;
}
