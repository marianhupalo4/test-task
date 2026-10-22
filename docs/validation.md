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

## What Changed

Differences from [srs.md](srs.md) and [design.md](design.md) found while implementing, and fixes made after review.

| Change                                                                                               | Why                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Postgres healthcheck uses `pg_isready -h 127.0.0.1` instead of the default socket check              | **Bug found by the manual curl check.** On a fresh volume the Postgres image first runs a temporary server that accepts only socket connections; the socket healthcheck reported healthy, `migrate` connected over TCP during the restart and failed. Unit and integration tests did not catch it because Testcontainers waits for the real server. |
| Migrations live in top-level `migrations/`, not `src/db/migrations/`                                 | `tsc` does not copy `.sql` files to `dist/`; the Docker image copies the directory as is. Design updated.                                                                                                                                                                                                                                           |
| "Vault" renamed to "credential service" in code, Compose, docs                                       | Avoids confusion with HashiCorp Vault, which [ADR-0001](adr/0001-own-service-instead-of-vault.md) rejects.                                                                                                                                                                                                                                          |
| OQ-7 resolved as D-27                                                                                | Audit failure on an already rejected request keeps the original status and is logged.                                                                                                                                                                                                                                                               |
| History ordered by `id DESC` instead of `(ts, id)`                                                   | `id` follows insert order and gives a simple keyset cursor.                                                                                                                                                                                                                                                                                         |
| Dev tokens via `envkeep seed` instead of `token issue / revoke / list`                               | Enough for the main scenario; the token CLI is a next step.                                                                                                                                                                                                                                                                                         |
| Audit failure in tests is simulated with a `BEFORE INSERT` trigger, not `REVOKE INSERT` (design §10) | The tests run as a superuser, which ignores grants.                                                                                                                                                                                                                                                                                                 |
| Fastify 4xx errors (for example an empty JSON body) are returned as `400`-class errors, not `500`    | Found while testing `revoke` without a body.                                                                                                                                                                                                                                                                                                        |

## Known Risks

1. **The service connects to PostgreSQL as a superuser.** The same `envkeep` user owns the schema, runs migrations and serves requests, so the audit is not append-only and the service can change the schema or delete audit rows (FR-28, NFR-7 not met). A bug or SQL injection would have full DB access. Fix: next step 1.
2. **Master key in an environment variable** is readable by anyone with access to the host or `docker inspect` (ADR-0004); one key per environment is not enforced yet.
3. **Implemented but untested paths**: rollback of `store` / `revoke` on audit failure and decryption failure (`500`) work in code but have no tests yet (next steps 2 and 3).

## Technical Debt

- **One DB user for everything** (see Known Risks 1): no `credential_owner` / `credential_app` roles, no append-only trigger.
- **Tests are not typechecked**: `tsconfig.json` includes only `src`; test files are checked only by Vitest at runtime.
- **All routes, the auth hook and the error handler in one file** `src/server/app.ts`; route handlers use non-null assertions (`req.actor!`, `req.audit!`) that rely on the auth hook running first.
- **Secret size is checked after JSON parsing**: Fastify accepts bodies up to its default 1 MiB before the 16 KiB check in `store`.
- **Constants duplicated between code and SQL**: providers, actions and outcomes are listed both in TypeScript and in `CHECK` constraints.
- **Key versions are hardcoded** (`key_version = 1`, `master_key_version = 1`); there is no rotation path yet.
- **Seed prints tokens to stdout** and creates new tokens on every run; acceptable for development only.
- **Some intermediate commits do not pass tests** (`a6c27f1`: code changed, tests updated in the next commit). From now on tests are committed together with the code.

## What I Would Do Next

1. **Audit append-only in the DB**: roles `credential_owner` / `credential_app`, grants and `BEFORE UPDATE OR DELETE` / `TRUNCATE` triggers; migrations run as owner, service as app role (FR-28, NFR-7, AC-15, design §6). Today everything runs as one superuser.
2. **Crypto unit tests**: tampered ciphertext, swapped ciphertext between credentials, changed `key_version` → `500` (AC-8), nonce uniqueness (AC-4), AAD encoding.
3. **Missing tests for implemented behaviour**: `store` / `revoke` rollback on audit failure (AC-16), size limit and validation on `store` (AC-2), one client key per client and concurrent first `store` (AC-3), startup with invalid master key as a process test (AC-17).
4. **Token management CLI**: `token issue / revoke / list` instead of seed only; test for a revoked token (AC-11).
5. **History**: `from` / `to` filters and cursor pagination tests (FR-19). Ordering is by `id DESC`, which follows insert order; switch to `(ts, id)` if that ever differs.
6. **Typecheck tests**: `tsconfig.json` covers only `src`; add a config for `test/`.
7. **Load test** for NFR-1 (AC-18) and a compose check for no published ports (AC-19).
8. **Deployment**: DB init script with roles and separate passwords, master key per environment (ADR-0004), CI running lint, typecheck and tests.
9. **Later, per SRS open questions**: AWS KMS for wrapping client keys, key rotation (OQ-3), crypto-shredding on offboarding (OQ-6), audit retention (OQ-5).
