export interface Config {
  host: string;
  port: number;
  databaseUrl: string;
  logLevel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    host: env.HOST ?? '0.0.0.0',
    port: Number(env.PORT ?? 8080),
    databaseUrl: env.DATABASE_URL ?? '',
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
