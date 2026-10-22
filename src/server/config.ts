export interface Config {
  host: string;
  port: number;
  databaseUrl: string;
  logLevel: string;
  masterKey: Buffer;
}

export class ConfigError extends Error {}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new ConfigError(`${name} is required`);
  return value;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError('PORT must be an integer between 1 and 65535');
  }
  return port;
}

function parseMasterKey(value: string): Buffer {
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value) {
    throw new ConfigError('ENVKEEP_MASTER_KEY must be 32 bytes encoded as base64');
  }
  return key;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    host: env.HOST ?? '0.0.0.0',
    port: parsePort(env.PORT ?? '8080'),
    databaseUrl: required(env, 'DATABASE_URL'),
    logLevel: env.LOG_LEVEL ?? 'info',
    masterKey: parseMasterKey(required(env, 'ENVKEEP_MASTER_KEY')),
  };
}
