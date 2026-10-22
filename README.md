# envkeep

Internal credential service for client tokens (Shopify, Meta Ads, Google Ads). Internal services store, use and revoke credentials through an HTTP API; every access is written to an append-only audit that the main backend shows to clients.

- Each client has its own encryption key (AES-256-GCM), wrapped by a master key that never reaches the database.
- A secret is returned only by `use`, only with an allowed purpose, and only after the audit event is written.
- The main database keeps only `credential_id`.

## Documentation

| Document                                 | Contents                                                         |
| ---------------------------------------- | ---------------------------------------------------------------- |
| [docs/problem.md](docs/problem.md)       | The incident and the problem we solve                            |
| [docs/srs.md](docs/srs.md)               | Requirements, API, data model, threat model, acceptance criteria |
| [docs/design.md](docs/design.md)         | Modules, request flow, crypto, database, deployment, testing     |
| [docs/adr/](docs/adr/)                   | Architecture decisions                                           |
| [docs/validation.md](docs/validation.md) | What is implemented, how it is verified, known risks, next steps |

## Requirements

- Node.js 22, pnpm 10
- Docker with Compose (also needed for tests)
- `curl`, `jq` and `openssl` for the manual check

## Run Locally

```sh
pnpm install
cp .env.example .env
```

Set `ENVKEEP_MASTER_KEY` in `.env` to the output of `openssl rand -base64 32`, then:

```sh
docker compose up --build -d --wait
```

The `migrate` service applies migrations before the service starts. `docker-compose.override.yml` publishes the service on `127.0.0.1:8080` and Postgres on `127.0.0.1:${CREDENTIAL_DB_PORT}` for local development only. Production uses only the base file, with no published ports:

```sh
docker compose -f docker-compose.yml up -d
```

## Manual Check with curl

The full scenario: the backend stores a secret, the worker uses it with a purpose, the backend revokes it, `use` returns `410`, the client history shows every step.

Create development tokens. `backend` can store, revoke and read the audit; `worker` can use credentials with purposes `daily_report` and `alerts`. Tokens are printed once:

```sh
TOKENS=$(docker compose exec -T credential-service node dist/cli/index.js seed)
BACKEND=$(echo "$TOKENS" | awk '/^backend:/ {print $2}')
WORKER=$(echo "$TOKENS" | awk '/^worker:/ {print $2}')
URL=http://127.0.0.1:8080
```

Health:

```sh
curl -s $URL/health
```

Store a secret as the backend:

```sh
ID=$(curl -s -X POST $URL/v1/credentials \
  -H "Authorization: Bearer $BACKEND" -H 'Content-Type: application/json' \
  -d '{"client_id":"client-1","provider":"shopify","secret":"shpat_demo_secret"}' | jq -r .credential_id)
echo $ID
```

Use it as the worker with an allowed purpose → `200` with the secret:

```sh
curl -s -X POST $URL/v1/credentials/$ID/use \
  -H "Authorization: Bearer $WORKER" -H 'Content-Type: application/json' \
  -d '{"purpose":"daily_report"}'
```

Purpose not allowed for the worker → `403`, no secret:

```sh
curl -s -X POST $URL/v1/credentials/$ID/use \
  -H "Authorization: Bearer $WORKER" -H 'Content-Type: application/json' \
  -d '{"purpose":"export"}'
```

Revoke as the backend → `200`; repeating it returns the same body:

```sh
curl -s -X POST $URL/v1/credentials/$ID/revoke -H "Authorization: Bearer $BACKEND"
```

Use after revoke → `410`:

```sh
curl -s -w '\n%{http_code}\n' -X POST $URL/v1/credentials/$ID/use \
  -H "Authorization: Bearer $WORKER" -H 'Content-Type: application/json' \
  -d '{"purpose":"daily_report"}'
```

Client history, newest first:

```sh
curl -s "$URL/v1/audit?client_id=client-1" -H "Authorization: Bearer $BACKEND" \
  | jq -r '.events[] | [.action, .outcome, .http_status, .service, .purpose // "-"] | @tsv' \
  | column -t
```

Expected output:

```
use     denied   410  worker   daily_report
revoke  allowed  200  backend  -
use     denied   403  worker   export
use     allowed  200  worker   daily_report
store   allowed  201  backend  -
```

Stop and remove the local data:

```sh
docker compose down -v
```

## Tests

```sh
pnpm test
```

Vitest starts PostgreSQL 17 in Docker via Testcontainers, applies migrations into a template database and gives each test file its own copy. Docker must be running.

| Test file                     | What it checks                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `test/scenario.test.ts`       | Full scenario, rejections (`400`, `401`, `403`, `404`, `410`), `503` without the secret when the audit cannot be written |
| `test/no-secret-leak.test.ts` | No secret, token or master key in a full database dump or in the logs                                                    |
| `test/config.test.ts`         | Startup config validation, including the master key                                                                      |
| `test/health.test.ts`         | `GET /health`                                                                                                            |

Other checks:

```sh
pnpm typecheck
pnpm format:check
```
