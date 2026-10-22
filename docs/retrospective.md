# Retrospective

## What I Would Change

- **Fix the naming on day one.** "Vault" lived in code, Compose and docs until a late rename touched almost every file.
- **Ask the AI to list its own decisions before it writes, from the first document.** I had to ask for this twice (SRS, then design); a Decision Log from the start would have saved a round of edits.
- **Create DB roles in the first migration.** Running as a superuser was meant to be temporary and is now the top risk in [validation.md](validation.md).
- **Run the manual Docker check earlier.** The Postgres healthcheck bug surfaced only when writing the README, although it existed since the first Compose file.
- **Commit tests together with code** so every commit stays green.
- **Keep design and implementation in sync in the same change**: the migrations path and OQ-7 drifted until a separate pass.

## What Next

The ordered list is in [validation.md › What I Would Do Next](validation.md#what-i-would-do-next). The first three:

1. Roles `credential_owner` / `credential_app` and the append-only trigger on the audit.
2. Crypto unit tests and the missing tests for implemented paths (rollback on audit failure, decryption failure).
3. Token management CLI instead of the seed script.

After that: load test for NFR-1, CI, then AWS KMS for wrapping client keys ([ADR-0004](adr/0004-master-key-in-env.md)).

## How I Used AI

- Claude Code in the terminal for the whole cycle: problem → SRS → design and ADRs → implementation → tests → README → commits. The conversation is exported to [chat-history.md](chat-history.md) by a hook.
- I gave decisions as short bullet lists; the AI turned them into documents and code; I reviewed each step and sent corrections as numbered points.
- For the design I asked it to review my decisions first and ask questions before writing. It came back with 12 questions, and I answered them in one message.
- Commits only on my explicit command, always with me as the author.

## Where It Helped

- **Drafting structured documents fast**: SRS with requirement IDs, acceptance criteria linked to requirements, threat model, Mermaid diagrams.
- **Reviewing my decisions**:
  - grants alone do not stop the table owner, so we kept the trigger;
  - a token prefix only catches our own tokens, so logs are protected by redaction and tests search for the actual secret values;
  - port `5432` was published, which contradicts NFR-3;
  - Vault / OpenBao Transit is a strong alternative, which made the ADR honest.
- **Test setup**: Testcontainers with a migrated template database per test file; audit failure simulated by a real DB trigger instead of a mock; mutation check that the leak tests actually fail when a secret leaks.
- **The manual curl check** found the Postgres healthcheck race on a fresh volume.
- **Tooling**: fixed the chat-history export hook (lost pasted messages, duplicated branches, written only at the end of a turn).

## Where I Corrected It

| AI's version                                                                                                                  | My correction                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Repeated `revoke` returned `410`                                                                                              | Idempotent: `200` with status `revoked`                                                                                         |
| History filtered by provider permission                                                                                       | Limited by client (tenant), permission `audit:read`, read only by our backend                                                   |
| `purpose` as free text                                                                                                        | Allowlist per service; missing purpose `400`, purpose not allowed `403` (it proposed `400` for both)                            |
| 16 KiB secret limit as a requirement                                                                                          | Marked as an assumption                                                                                                         |
| AAD without key version                                                                                                       | `key_version` added to AAD                                                                                                      |
| Decisions not in my list made silently                                                                                        | Separate section, later a Decision Log with status and reason for each decision                                                 |
| Implementation details (AAD encoding, Node.js `crypto`, grants and trigger) in the SRS                                        | Only the essence in the SRS, details moved to [design.md](design.md)                                                            |
| Proposed the Vault license (BSL) as an argument                                                                               | Removed, since OpenBao exists; added OpenBao Transit as a future option in [ADR-0001](adr/0001-own-service-instead-of-vault.md) |
| In the design, still decided some details itself (one-shot `migrate` service, DB per test file) after I asked it to ask first | It listed them afterwards for review; I accepted them                                                                           |
| Kept leftover code from an earlier product idea                                                                               | Removed                                                                                                                         |
| Chat history in the wrong order                                                                                               | Fixed the export hook                                                                                                           |
| "Vault" as the service name                                                                                                   | Renamed to "credential service" everywhere                                                                                      |
| Migrations path in the design out of date, OQ-7 left open although implemented                                                | Design fixed, OQ-7 marked resolved                                                                                              |
| Superuser access mentioned only in next steps                                                                                 | Listed as the first known risk                                                                                                  |
| Tests committed separately from the code                                                                                      | Tests go in the same commit as the code                                                                                         |
