# envkeep

Internal credential service for client tokens. See [docs/](docs/).

## Development

```sh
cp .env.example .env
openssl rand -base64 32
pnpm install
pnpm test
docker compose up --build
```

Put the generated key into `ENVKEEP_MASTER_KEY` in `.env`.

Migrations run automatically in the `migrate` service. Create development tokens:

```sh
docker compose exec credential-service node dist/cli/index.js seed
```

`docker-compose.override.yml` publishes Postgres and the service on `127.0.0.1` for local development. Production uses only the base file:

```sh
docker compose -f docker-compose.yml up -d
```
