import Fastify, { type FastifyError } from 'fastify';
import type pg from 'pg';
import type { HealthResponse } from '../shared/types.js';
import type { AuditAction } from '../db/audit.js';
import { CredentialServiceError, errors } from '../credential-service/errors.js';
import { type Actor, authenticate } from '../credential-service/tokens.js';
import {
  type AuditContext,
  PROVIDERS,
  type Provider,
  CredentialService,
} from '../credential-service/credential-service.js';

declare module 'fastify' {
  interface FastifyContextConfig {
    action?: AuditAction;
  }
  interface FastifyRequest {
    audit: AuditContext | null;
    actor: Actor | null;
  }
}

export interface AppOptions {
  logLevel: string;
  logStream?: { write(msg: string): void };
  pool: pg.Pool;
  masterKey: Buffer;
}

const uuidParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
} as const;

export function buildApp(options: AppOptions) {
  const app = Fastify({
    logger: {
      level: options.logLevel,
      redact: {
        paths: ['req.headers.authorization', '*.secret', '*.token'],
        censor: '[REDACTED]',
      },
      ...(options.logStream ? { stream: options.logStream } : {}),
    },
  });
  const credentialService = new CredentialService(options.pool, options.masterKey);

  app.decorateRequest('audit', null);
  app.decorateRequest('actor', null);

  app.addHook('onRequest', async (req) => {
    const action = req.routeOptions.config.action;
    if (!action) return;
    req.audit = {
      action,
      tokenId: null,
      clientId: null,
      credentialId: null,
      provider: null,
      purpose: null,
    };
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
    const actor = token ? await authenticate(options.pool, token) : null;
    if (!actor) throw errors.unauthorized();
    req.actor = actor;
    req.audit.tokenId = actor.tokenId;
  });

  app.setErrorHandler(async (err: FastifyError, req, reply) => {
    const error =
      err instanceof CredentialServiceError
        ? err
        : err.validation
          ? errors.validation(err.message)
          : err.statusCode && err.statusCode < 500
            ? new CredentialServiceError(err.statusCode, 'bad_request', err.message)
            : new CredentialServiceError(500, 'internal_error', 'Internal error');
    if (error.code === 'internal_error') req.log.error({ err }, 'request failed');
    if (req.audit && error.code !== 'audit_unavailable') {
      try {
        await credentialService.recordRejection(req.audit, error);
      } catch (auditErr) {
        req.log.error({ err: auditErr }, 'audit write failed for rejected request');
      }
    }
    return reply.status(error.status).send({ error: { code: error.code, message: error.message } });
  });

  app.get('/health', async (): Promise<HealthResponse> => ({
    status: 'ok',
    version: '0.1.0',
  }));

  app.post<{
    Body: { client_id: string; provider: Provider; secret: string; label?: string };
  }>(
    '/v1/credentials',
    {
      config: { action: 'store' },
      schema: {
        body: {
          type: 'object',
          required: ['client_id', 'provider', 'secret'],
          additionalProperties: false,
          properties: {
            client_id: { type: 'string', minLength: 1 },
            provider: { type: 'string', enum: PROVIDERS },
            secret: { type: 'string', minLength: 1 },
            label: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const result = await credentialService.store(req.actor!, req.audit!, {
        clientId: req.body.client_id,
        provider: req.body.provider,
        secret: req.body.secret,
        label: req.body.label ?? null,
      });
      return reply.status(201).send({ credential_id: result.credentialId });
    },
  );

  app.post<{ Params: { id: string }; Body: { purpose: string } }>(
    '/v1/credentials/:id/use',
    {
      config: { action: 'use' },
      schema: {
        params: uuidParams,
        body: {
          type: 'object',
          required: ['purpose'],
          additionalProperties: false,
          properties: { purpose: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (req) => {
      const result = await credentialService.use(
        req.actor!,
        req.audit!,
        req.params.id,
        req.body.purpose,
      );
      return { secret: result.secret, provider: result.provider, client_id: result.clientId };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/v1/credentials/:id/revoke',
    { config: { action: 'revoke' }, schema: { params: uuidParams } },
    async (req) => {
      const result = await credentialService.revoke(req.actor!, req.audit!, req.params.id);
      return {
        credential_id: result.credentialId,
        status: result.status,
        revoked_at: result.revokedAt.toISOString(),
      };
    },
  );

  app.get<{
    Querystring: { client_id: string; credential_id?: string; cursor?: string; limit: number };
  }>(
    '/v1/audit',
    {
      config: { action: 'audit_read' },
      schema: {
        querystring: {
          type: 'object',
          required: ['client_id'],
          additionalProperties: false,
          properties: {
            client_id: { type: 'string', minLength: 1 },
            credential_id: { type: 'string', format: 'uuid' },
            cursor: { type: 'string', pattern: '^[0-9]+$' },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
        },
      },
    },
    async (req) => {
      const result = await credentialService.history(req.actor!, req.audit!, {
        clientId: req.query.client_id,
        credentialId: req.query.credential_id ?? null,
        cursor: req.query.cursor ?? null,
        limit: req.query.limit,
      });
      return {
        events: result.events.map((event) => ({
          id: event.id,
          ts: event.ts.toISOString(),
          action: event.action,
          outcome: event.outcome,
          http_status: event.http_status,
          service: event.service,
          token_id: event.token_id,
          credential_id: event.credential_id,
          provider: event.provider,
          purpose: event.purpose,
          reason: event.reason,
        })),
        next_cursor: result.nextCursor,
      };
    },
  );

  return app;
}
