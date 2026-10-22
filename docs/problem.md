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

## Users

| User                                                        | Need                                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Main backend                                                | Store a client's credential on onboarding, revoke it on disconnect, show the client its usage history. |
| Worker services (data collectors, report and alert senders) | Get a client's token at the moment they call Shopify, Meta Ads or Google Ads.                          |
| Operator (our engineers)                                    | Deploy the service, keep the master key, decide which service may use which credentials and for what.  |
| Clients                                                     | See who used their tokens, when and why. They never call the service directly.                         |

## Value

- **A database dump is no longer a full leak.** A backup, replica or staging restore of either database does not reveal client tokens.
- **Smaller blast radius.** A leaked client key affects one client, so incident response no longer means asking every client to re-issue keys.
- **Accountability.** Every use of a token is tied to a service and a declared purpose.
- **Trust.** Clients can see the usage history of their own tokens, which answers the question the incident raised.

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

## Non-Goals

- Not a general-purpose secrets manager: only client credentials for Shopify, Meta Ads and Google Ads.
- No direct access for clients; the main backend shows them their history.
- No in-place update: replacing a credential means storing a new one and revoking the old one.
- No refreshing or validating tokens against the providers.
- No high availability or multi-region setup in the first version.
- No custom cryptography.

## Why Not Vault

HashiCorp Vault or OpenBao would be another system to operate, and we have no one to own it. The per-client usage history with purpose that clients need would still have to be built on top. Cloud secret managers charge per secret and per request, lock us into one provider and have no client-facing audit either. Details and consequences: [ADR-0001](adr/0001-own-service-instead-of-vault.md).
