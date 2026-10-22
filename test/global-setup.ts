import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import { migrate } from '../src/db/migrate.js';
import { createPool } from '../src/db/pool.js';
import { TEMPLATE_DB, databaseUrl } from './db.js';

declare module 'vitest' {
  export interface ProvidedContext {
    pgUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const adminUrl = container.getConnectionUri();

  const admin = createPool(adminUrl);
  await admin.query(`CREATE DATABASE ${TEMPLATE_DB}`);
  await admin.end();

  const template = createPool(databaseUrl(adminUrl, TEMPLATE_DB));
  await migrate(template);
  await template.end();

  project.provide('pgUrl', adminUrl);
  return async () => {
    await container.stop();
  };
}
