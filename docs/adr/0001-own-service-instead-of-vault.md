# ADR-0001: Own Credential Service Instead of Vault

- Status: Accepted
- Date: 2026-10-22

## Context

Client credentials for Shopify, Meta Ads and Google Ads are stored in the main PostgreSQL database. A production restore to staging forced all clients to re-issue their keys ([problem.md](../problem.md)). We need per-client encryption and a per-client usage history with purpose that clients can see.

## Decision

Build a small internal service ([srs.md](../srs.md)) with its own PostgreSQL, using standard crypto primitives.

## Alternatives

| Option                                  | Why not                                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HashiCorp Vault / OpenBao               | Another system to operate (unseal, upgrades, backups, monitoring), and we have no one to own it. Per-client audit with purpose for clients would still have to be built on top. |
| AWS Secrets Manager, GCP Secret Manager | Cost per secret and per request; lock-in to one cloud provider; no client-facing audit either.                                                                                  |

## Consequences

- We own and maintain the crypto code; it is limited to standard library primitives and an isolated module.
- Operations stay within the stack we already run: Node.js, PostgreSQL, Docker Compose.
- Per-client audit with purpose is a first-class part of the data model.
- If we grow, OpenBao Transit can replace the master key for wrapping client keys, without changing the API or the data model.
