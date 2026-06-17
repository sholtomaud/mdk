#!/usr/bin/env node
import { Command } from 'commander';
import { cmdNew }             from './commands/new.js';
import { cmdSynth }           from './commands/synth.js';
import { cmdValidate }        from './commands/validate.js';
import { cmdFirmware }        from './commands/firmware.js';
import { cmdScipy }           from './commands/scipy.js';
import { cmdSimulink }        from './commands/simulink.js';
import {
  cmdSearch, cmdAdd, cmdRemove, cmdList,
  cmdPackageValidate, cmdPackagePublish,
} from './commands/registry.js';

const program = new Command();

program
  .name('mdk')
  .version('0.1.0')
  .description('Model-Driven Kit — Bond Graph and Odum ESL systems engineering CLI');

/* ── Project scaffolding ──────────────────────────────────────────── */

program
  .command('new <project>')
  .description('Scaffold a new MDK project')
  .action((project: string) => cmdNew(project));

/* ── Model synthesis & validation ────────────────────────────────── */

program
  .command('synth')
  .description('Synthesise the TypeScript model to JSON and invoke @mdk/sim-kernel')
  .option('-o, --output <file>', 'Output file (default: model.mdk.json)')
  .option('--validate', 'Validate schema before synthesis')
  .action((opts: { output?: string; validate?: boolean }) => void cmdSynth(opts));

program
  .command('validate')
  .description('Run causality linter without full synthesis')
  .action(() => void cmdValidate());

/* ── Output generators (T2.4) ────────────────────────────────────── */

program
  .command('firmware')
  .description('Generate C state-space firmware (mdk_ss.h / mdk_ss.c) from model.mdk.json')
  .option('-o, --output <dir>', 'Output directory (default: .)')
  .option('--dt <seconds>', 'Override discretisation timestep')
  .action((opts: { output?: string; dt?: string }) => cmdFirmware(opts));

program
  .command('scipy')
  .description('Generate a SciPy/matplotlib simulation script from model.mdk.json')
  .option('-o, --output <file>', 'Output file (default: mdk_simulation.py)')
  .action((opts: { output?: string }) => cmdScipy(opts));

program
  .command('simulink')
  .description('Generate a MATLAB/Simulink script from model.mdk.json')
  .option('-o, --output <file>', 'Output file (default: mdk_model.m)')
  .action((opts: { output?: string }) => cmdSimulink(opts));

/* ── Vendor package registry (T3.2) ──────────────────────────────── */

program
  .command('search <query>')
  .description('Search npm for @mdk/* vendor packages')
  .action((query: string) => void cmdSearch(query));

program
  .command('add <package>')
  .description('Install an @mdk/* vendor package')
  .action((pkg: string) => cmdAdd(pkg));

program
  .command('remove <package>')
  .description('Remove an @mdk/* vendor package')
  .action((pkg: string) => cmdRemove(pkg));

program
  .command('list')
  .description('List installed @mdk/* packages in the current project')
  .action(() => cmdList());

const pkg = program
  .command('package')
  .description('Vendor package tools (validate, publish)');

pkg
  .command('validate [dir]')
  .description('Validate mdk-package.json against the MDK vendor spec')
  .action((dir?: string) => cmdPackageValidate(dir));

pkg
  .command('publish [dir]')
  .description('Validate and publish a vendor package to npm')
  .action((dir?: string) => cmdPackagePublish(dir));

program.parse(process.argv);
