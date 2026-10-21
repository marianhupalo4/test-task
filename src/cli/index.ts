#!/usr/bin/env node
import { Command } from 'commander';
import { runWithEnv } from './run.js';

const program = new Command();

program
  .name('envkeep')
  .description('Self-hosted secrets for small teams')
  .version('0.1.0')
  .enablePositionalOptions();

program
  .command('run')
  .description('Run a command with secrets injected as environment variables')
  .option('-p, --project <name>', 'project name')
  .option('-e, --env <name>', 'environment name')
  .argument('<command...>', 'command to run')
  .passThroughOptions()
  .action(async (command: string[]) => {
    const code = await runWithEnv(command, {});
    process.exit(code);
  });

await program.parseAsync();
