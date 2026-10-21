# Problem Statement

## Context

- We are a company that collects data and sends reports and alerts to our clients.
- We integrate with Shopify, Meta Ads and Google Ads on behalf of our clients, using their access tokens and API keys.
- Since the early days of the product, all client credentials have been stored in our main PostgreSQL database. This approach was never revisited.

## The Incident

- Due to an issue with the production database, a copy of it was restored to the staging environment.
- Staging has weaker access controls than production, so client secrets were exposed to a broader surface and could potentially have leaked.
- There is no evidence that a leak actually happened, but we could not prove otherwise.
- As a precaution, we had to ask every client to revoke and re-issue their keys.
- This was a significant reputational hit for the company.

## Problems

1. **Single point of compromise.** Credentials live in the same database as the rest of the product data. Anyone with access to a database dump (backup, staging restore, misconfigured replica) gets every client's tokens at once.
2. **No per-client isolation.** There is no cryptographic boundary between clients. A compromise affecting one area exposes all clients simultaneously.
3. **No usage visibility.** We cannot tell when, by whom, or for what purpose a client's token was used.
4. **Client demand for transparency.** Clients want to see who used their tokens.
5. **Costly incident response.** Without isolation or audit history, the only safe reaction to any suspected exposure is a full, company-wide key rotation.

## Project Idea

Build an internal secrets service dedicated to storing client credentials.

### Core Principle

Compromising a single encryption key or a database dump must not reveal the tokens of all clients at once.

### Scope

- **Store** — securely save a client credential.
- **Use** — retrieve a credential for an authorized internal consumer at the moment it is needed.
- **Revoke** — invalidate a credential so it can no longer be used.

### Key Properties

- **Per-client encryption key.** Each client's credentials are encrypted with a dedicated key, limiting the blast radius of any single key compromise.
- **Separation from product data.** Credentials are no longer stored in the main application database in a usable form; a dump of that database is not enough to obtain secrets.
- **Usage history.** Every access to a credential is recorded, building an audit trail of who used which token and when.
- **Client-facing transparency.** The usage history can be exposed to clients so they can see who used their tokens.
