#!/usr/bin/env node
import { Command } from 'commander';
import { migrate } from '../db/migrate.js';
import { createPool } from '../db/pool.js';
import { seed } from './seed.js';

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  return url;
}

const program = new Command();

program.name('envkeep').description('Internal credential service').version('0.1.0');

program
  .command('migrate')
  .description('Apply pending database migrations')
  .action(async () => {
    const pool = createPool(databaseUrl());
    try {
      const applied = await migrate(pool);
      console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'No pending migrations');
    } finally {
      await pool.end();
    }
  });

program
  .command('seed')
  .description('Create development service tokens and print them once')
  .action(async () => {
    const pool = createPool(databaseUrl());
    try {
      for (const { name, token } of await seed(pool)) {
        console.log(`${name}: ${token}`);
      }
    } finally {
      await pool.end();
    }
  });

await program.parseAsync();
