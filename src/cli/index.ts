#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program.name('envkeep').description('Internal credential vault').version('0.1.0');

await program.parseAsync();
