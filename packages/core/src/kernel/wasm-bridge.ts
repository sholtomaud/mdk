import { BondGraphModel } from '../schema/bondgraph.js';
import { OdumEslModel } from '../schema/odum-esl.js';
import { collectUnresolvedTokens, TokenResolutionError } from '../system/token.js';
import type { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs';

/* ── Sim-kernel result types ─────────────────────────────────────── */

export interface BgStateSpace {
  state_count: number;
  input_count: number;
  state_names: string[];
  input_names: string[];
  A: number[][];
  B: number[][];
  C: number[][];
  D: number[][];
}

export interface BgSimulation {
  state_variables: string[];
  time: number[];
  data: number[][];
}

export interface KernelResult {
  success: boolean;
  domain: 'bondgraph' | 'odum-esl';
  causality?: {
    success: boolean;
    status: string;
    bonds: Array<{ id: number; source_causality: string; target_causality: string }>;
    diagnostics: Array<{ status: string; message: string; element_id: number; bond_id: number }>;
  };
  state_space?: BgStateSpace;
  simulation?: BgSimulation;
  sim_error?: string;
}

/* ── WASM module interface (Emscripten output) ───────────────────── */

interface SimKernelModule {
  ccall(name: string, returnType: string, argTypes: string[], args: unknown[]): string;
}

type SimKernelFactory = () => Promise<SimKernelModule>;

let _kernel: SimKernelModule | null = null;

/* Resolve path to the compiled sim_kernel.js (Emscripten output) */
function findKernelJs(): string | null {
  const candidates = [
    path.resolve(__dirname, '../../sim-kernel/build-wasm/sim_kernel.js'),
    path.resolve(__dirname, '../../../sim-kernel/build-wasm/sim_kernel.js'),
    path.resolve(__dirname, '../../sim-kernel/dist/sim_kernel.js'),
    path.resolve(__dirname, '../../../sim-kernel/dist/sim_kernel.js'),
    path.resolve(process.cwd(), 'node_modules/@mdk/sim-kernel/dist/sim_kernel.js'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function getKernel(): Promise<SimKernelModule> {
  if (_kernel) return _kernel;

  const kernelPath = findKernelJs();
  if (!kernelPath) {
    throw new Error(
      'sim_kernel.wasm not found. Build it with:\n' +
      '  cd packages/sim-kernel && emcmake cmake .. && make'
    );
  }

  /* eslint-disable @typescript-eslint/no-var-requires */
  const factory = require(kernelPath) as SimKernelFactory;
  _kernel = await factory();
  return _kernel;
}

/* ── ID normalisation ────────────────────────────────────────────────
 * The C kernel uses bond source/target as 0-based array indices into
 * elements[]. Callers may supply any non-negative integer IDs, so we
 * remap before serialising to JSON for WASM.
 * ─────────────────────────────────────────────────────────────────── */

function normaliseBondGraphForWasm(model: z.infer<typeof BondGraphModel>): object {
  const idToIdx = new Map<number, number>();
  model.elements.forEach((el, idx) => idToIdx.set(el.id, idx));

  /* ── Numeric parameter assertion ──────────────────────────────────
   * All parameters MUST be numbers at this point. Tokens should have
   * been resolved by MdkSystem.resolve() before runKernel() is called.
   * This is the final safety net before the C kernel receives the JSON.
   * ─────────────────────────────────────────────────────────────────*/
  for (const el of model.elements) {
    if (typeof el.parameter !== 'number') {
      throw new TokenResolutionError([
        typeof el.parameter === 'string' ? (el.parameter) : `element[${el.id}].parameter`,
      ]);
    }
  }

  return {
    ...model,
    elements: model.elements.map((el, idx) => ({ ...el, id: idx })),
    bonds: model.bonds.map(b => ({
      ...b,
      source: idToIdx.get(b.source) ?? b.source,
      target: idToIdx.get(b.target) ?? b.target,
    })),
  };
}


/* ── Public API ──────────────────────────────────────────────────── */

export async function runKernel(
  model: BondGraphModel | OdumEslModel,
): Promise<KernelResult> {
  /* ── Token guard ── must be before kernel invocation ───────────── */
  const unresolvedTokens = collectUnresolvedTokens(model);
  if (unresolvedTokens.length > 0) {
    throw new TokenResolutionError(unresolvedTokens);
  }

  const kernel = await getKernel();

  if ('domain' in model && model.domain === 'bondgraph') {
    const validated = BondGraphModel.parse(model);
    const jsonIn = JSON.stringify(normaliseBondGraphForWasm(validated));
    const jsonOut = kernel.ccall('sim_kernel_run', 'string', ['string'], [jsonIn]);
    return JSON.parse(jsonOut) as KernelResult;
  }

  const validated = OdumEslModel.parse(model);
  const jsonIn = JSON.stringify(validated);
  const jsonOut = kernel.ccall('sim_kernel_run', 'string', ['string'], [jsonIn]);
  return JSON.parse(jsonOut) as KernelResult;
}

export async function validateBondGraph(
  model: BondGraphModel,
): Promise<KernelResult> {
  const validated = BondGraphModel.parse(model);
  const kernel = await getKernel();
  const jsonIn = JSON.stringify(normaliseBondGraphForWasm(validated));
  const jsonOut = kernel.ccall('validate_bondgraph', 'string', ['string'], [jsonIn]);

  /* validate_bondgraph returns a FLAT { success, status, bonds, diagnostics }
   * (not the nested causality wrapper that sim_kernel_run uses).
   * Normalise to KernelResult so callers see a consistent shape. */
  const flat = JSON.parse(jsonOut) as {
    success: boolean;
    status: string;
    bonds: KernelResult['causality'] extends { bonds: infer B } ? B : never;
    diagnostics: KernelResult['causality'] extends { diagnostics: infer D } ? D : never;
  };

  return {
    success: flat.success,
    domain: 'bondgraph',
    causality: {
      success: flat.success,
      status:  flat.status,
      bonds:   flat.bonds       ?? [],
      diagnostics: flat.diagnostics ?? [],
    },
  };
}

export function cleanupKernel(): void {
  if (_kernel) {
    try {
      (_kernel as unknown as { ccall: (n: string, r: string, a: string[], p: unknown[]) => void })
        .ccall('cleanup_bridge', 'void', [], []);
    } catch { /* ignore */ }
    _kernel = null;
  }
}
