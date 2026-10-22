import Fastify from 'fastify';
import type { HealthResponse } from '../shared/types.js';
import type { Config } from './config.js';

export function buildApp(config: Pick<Config, 'logLevel'>) {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: {
        paths: ['req.headers.authorization', '*.secret', '*.token'],
        censor: '[REDACTED]',
      },
    },
  });

  app.get('/health', async (): Promise<HealthResponse> => ({
    status: 'ok',
    version: '0.1.0',
  }));

  return app;
}
