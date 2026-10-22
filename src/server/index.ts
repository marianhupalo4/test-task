import { createPool } from '../db/pool.js';
import { buildApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  if (!(err instanceof ConfigError)) throw err;
  console.error(`Invalid configuration: ${err.message}`);
  process.exit(1);
}

const pool = createPool(config.databaseUrl);
const app = buildApp({ logLevel: config.logLevel, pool, masterKey: config.masterKey });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
