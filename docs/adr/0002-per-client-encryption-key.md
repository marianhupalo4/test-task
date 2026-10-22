# ADR-0002: Encryption Key per Client

- Status: Accepted
- Date: 2026-10-22

## Context

A single leaked key or dump must not reveal the tokens of all clients at once ([problem.md](../problem.md)).

## Decision

Each client has its own 256-bit key. Credentials are encrypted with the client key (AES-256-GCM); client keys are stored only wrapped by the master key ([srs.md](../srs.md) FR-3, FR-4).

## Alternatives

| Option                      | Why not                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| One key for all credentials | Its leak exposes every client; no cryptographic boundary between clients.                     |
| Key per credential          | No gain in client isolation over a per-client key, and loses the per-client operations below. |

## Consequences

- A leaked client key exposes only that client's credentials.
- A client key can be rotated or destroyed for one client without touching others (SRS OQ-3, OQ-6).
- The master key still protects all client keys: master key and vault DB leaked together expose everything (SRS §9). [ADR-0004](0004-master-key-in-env.md) addresses this later with AWS KMS.
- One extra table (`client_keys`) and one unwrap per `use`.
