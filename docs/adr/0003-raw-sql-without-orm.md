# ADR-0003: Raw SQL Without an ORM

- Status: Accepted
- Date: 2026-10-22

## Context

The schema has five tables. Correctness depends on database features: transactions that include the audit insert, `SELECT … FOR UPDATE`, `ON CONFLICT`, role grants and triggers on the audit table ([design.md](../design.md) §3, §6).

## Decision

Use the `pg` driver with parameterized raw SQL, kept in the `db` module. Migrations are plain `.sql` files applied by our own runner.

## Alternatives

| Option               | Why not                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| Prisma               | Generated client and its own migration engine; grants, triggers and locking still end up as raw SQL.    |
| Drizzle              | Lighter, but still an abstraction over a handful of queries; triggers and grants are outside its model. |
| Knex (query builder) | Little gain over plain SQL for this number of queries.                                                  |

## Consequences

- Every query is visible and reviewable as SQL; transaction boundaries are explicit.
- Fewer dependencies in a security-sensitive service.
- Row-to-type mapping is written by hand; queries are covered by integration tests against a real PostgreSQL.
- Only parameterized queries are allowed; string concatenation into SQL is rejected in review.
