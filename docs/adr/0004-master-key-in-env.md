# ADR-0004: Master Key in an Environment Variable, AWS KMS Later

- Status: Accepted
- Date: 2026-10-22

## Context

Client keys are wrapped by a master key ([ADR-0002](0002-per-client-encryption-key.md)). The master key must never be stored in the vault database, so a DB dump alone is useless. We run on AWS.

## Decision

For the first version the master key is read from `ENVKEEP_MASTER_KEY` (base64, 32 bytes). Later, wrapping of client keys moves to AWS KMS.

## Alternatives

| Option                  | Why not now                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| AWS KMS from the start  | Adds IAM setup, network calls and local-dev emulation before the core service exists. It is the target, not rejected. |
| Docker secrets file     | Same trust level as env on a single Compose host; little gain for the extra setup.                                    |
| Vault / OpenBao Transit | Rejected in [ADR-0001](0001-own-service-instead-of-vault.md); remains an option if we grow.                           |

## Consequences

- Anyone with access to the host environment (for example `docker inspect`) can read the master key; together with a vault DB dump that exposes all credentials (SRS §9).
- Every environment must have its own master key. A production dump restored to staging is then unreadable there, which is exactly the incident this project addresses.
- `client_keys.master_key_version` allows re-wrapping client keys under a new master key or under AWS KMS without re-encrypting credentials.
- Moving to AWS KMS changes only the wrap / unwrap step; the API, data model and credential ciphertexts stay the same. KMS only wraps client keys, so switching provider later means re-wrapping keys, not migrating secrets.
