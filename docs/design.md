# Design: Credential Vault Service

Implementation details for [srs.md](srs.md). Decision IDs refer to the [SRS Decision Log](srs.md#13-decision-log).

## 1. Cryptography

### Library (D-7)

- Node.js built-in `crypto` module (backed by OpenSSL): `createCipheriv` / `createDecipheriv` with `aes-256-gcm`, `randomBytes` for keys and nonces, `createHash('sha256')` for token hashes.
- No third-party or custom crypto code.

### Nonce (D-5)

- 96-bit (12 bytes) from `randomBytes(12)` for every encryption, stored next to the ciphertext.
- Random 96-bit nonces stay safe up to about 2³² encryptions per key, far above the expected number of credentials per client.

### AAD encoding (D-5)

Fields in fixed order, each as a 4-byte big-endian length followed by the UTF-8 bytes:

| Order | Field         | Value                     |
| ----- | ------------- | ------------------------- |
| 1     | credential_id | UUID, lowercase canonical |
| 2     | client_id     | as received               |
| 3     | key_version   | decimal string            |

Length prefixes make the encoding unambiguous, so `("ab", "c")` and `("a", "bc")` produce different AAD.

The client key wrap (D-6) uses the same encoding with `client_id`, `key_version`, `master_key_version`.

### Authentication tag

- 128-bit GCM tag stored together with the ciphertext.
- Any tag verification failure is a decryption failure (FR-13).

## 2. Audit Storage

### Roles (D-19)

| Role          | Used by         | Privileges                                                                                                                         |
| ------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `vault_owner` | Migrations only | Owns schema and tables                                                                                                             |
| `vault_app`   | Running service | `SELECT`, `INSERT`, `UPDATE` on credential and token tables; `SELECT`, `INSERT` on `audit_events`; `USAGE` on its sequence; no DDL |

### Append-only enforcement (D-19)

- `vault_app` has no `UPDATE`, `DELETE` or `TRUNCATE` on `audit_events`.
- A `BEFORE UPDATE OR DELETE` row trigger and a `BEFORE TRUNCATE` statement trigger on `audit_events` raise an exception for any role, including `vault_owner`.
- A DB superuser can still bypass this (see SRS §9).
