# Validation

State of the first working slice of [srs.md](srs.md) and what comes next.

## Implemented

Main scenario: backend stores a secret → worker uses it with a purpose → audit has the event → after revoke `use` returns `410` → client history is readable.

| Part                                                                                                         | Where                                                                 |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Tables `client_keys`, `credentials`, `service_tokens`, `token_permissions`, `token_purposes`, `audit_events` | `migrations/0001_init.sql`                                            |
| Migration runner (`schema_migrations`, advisory lock, one transaction per file)                              | `src/db/migrate.ts`, `envkeep migrate`                                |
| AES-256-GCM, per-client key wrapped by the master key, AAD with `key_version`                                | `src/crypto/index.ts`, `src/credential-service/credential-service.ts` |
| `store`, `use`, `revoke` (idempotent), `history`                                                             | `src/credential-service/credential-service.ts`, `src/server/app.ts`   |
| Service tokens with permissions and purposes, stored as SHA-256                                              | `src/credential-service/tokens.ts`, `src/db/tokens.ts`                |
| Dev tokens `backend` and `worker`                                                                            | `src/cli/seed.ts`, `envkeep seed`                                     |
| `use` returns no secret if the audit insert fails (`503`)                                                    | `src/credential-service/credential-service.ts`                        |
| Rejected requests are audited (`400`, `401`, `403`, `404`, `410`)                                            | `src/server/app.ts` error handler                                     |
| One-shot `migrate` service in Docker Compose                                                                 | `docker-compose.yml`                                                  |

## Verified by Tests

Vitest with a real PostgreSQL 17 via Testcontainers; every test file gets its own database created from a migrated template.

| Test                                    | Covers                                                                                                                                                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/scenario.test.ts` › main scenario | Store → use → audit events → idempotent revoke with ciphertext deleted → `410` → full history newest first (AC-1, AC-5, AC-9, AC-14)                                                                        |
| `test/scenario.test.ts` › rejections    | Missing purpose `400`, purpose not allowed `403`, missing permission `403`, worker cannot read history, invalid token `401` with null token id, unknown credential `404` (AC-6, AC-6a, AC-10, AC-11, AC-12) |
| `test/scenario.test.ts` › audit failure | A DB trigger makes the audit insert fail: `use` returns `503` without the secret (AC-7)                                                                                                                     |
| `test/no-secret-leak.test.ts`           | Full DB dump and captured logs at `trace` level contain no secret, service token or master key in plain, hex, base64 or base64url form (AC-3, AC-13, AC-20)                                                 |

Both leak checks were mutation-tested: writing the secret into `label` fails the DB check, logging the secret fails the log check.

Manual run in Docker Compose: migrate → seed → store → use → revoke → `410` → history, all through `curl`.

## What I Would Do Next

1. **Audit append-only in the DB**: roles `credential_owner` / `credential_app`, grants and `BEFORE UPDATE OR DELETE` / `TRUNCATE` triggers; migrations run as owner, service as app role (FR-28, NFR-7, AC-15, design §6). Today everything runs as one superuser.
2. **Crypto unit tests**: tampered ciphertext, swapped ciphertext between credentials, changed `key_version` → `500` (AC-8), nonce uniqueness (AC-4), AAD encoding.
3. **Missing tests for implemented behaviour**: `store` / `revoke` rollback on audit failure (AC-16), size limit and validation on `store` (AC-2), one client key per client and concurrent first `store` (AC-3), startup with invalid master key as a process test (AC-17).
4. **Token management CLI**: `token issue / revoke / list` instead of seed only; test for a revoked token (AC-11).
5. **History**: `from` / `to` filters and cursor pagination tests (FR-19). Ordering is by `id DESC`, which follows insert order; switch to `(ts, id)` if that ever differs.
6. **OQ-7**: if the audit write fails for an already rejected request, the original status is returned and the failure is logged. Needs a decision.
7. **Typecheck tests**: `tsconfig.json` covers only `src`; add a config for `test/`.
8. **Load test** for NFR-1 (AC-18) and a compose check for no published ports (AC-19).
9. **Deployment**: DB init script with roles and separate passwords, master key per environment (ADR-0004), CI running lint, typecheck and tests.
10. **Later, per SRS open questions**: AWS KMS for wrapping client keys, key rotation (OQ-3), crypto-shredding on offboarding (OQ-6), audit retention (OQ-5).
