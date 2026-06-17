import { z } from 'zod';
import { runKernel, BondGraphModel, OdumEslModel, solveIDC } from '@mdk/core';
import type { KernelResult, IdcStateSpace, IdcConfig } from '@mdk/core';
import { type Stage, zodIssues } from './stages.js';

export const runSimulationSchema = {
  model_json: z.string().describe('Model Assembly JSON — BondGraphModel or OdumEslModel'),
  calculus:   z.enum(['tdc', 'idc']).default('tdc').describe('tdc = WASM RK4 (default); idc = log-Euler (Giannantoni 2006)'),
};

export async function runSimulation(
  { model_json, calculus = 'tdc' }: { model_json: string; calculus?: 'tdc' | 'idc' },
): Promise<string> {
  const stages: Stage[] = [];

  /* ── Stage 1: JSON parse ─────────────────────────────────────────── */
  let parsed: unknown;
  try {
    parsed = JSON.parse(model_json);
    stages.push({ name: 'JSON.parse', pass: true });
  } catch (e) {
    stages.push({ name: 'JSON.parse', pass: false, note: String(e) });
    return JSON.stringify({ error: 'Invalid JSON', stages });
  }

  const isBg = typeof parsed === 'object' && parsed !== null &&
    (parsed as Record<string, unknown>).domain === 'bondgraph';

  /* ── Stage 2: Zod schema ─────────────────────────────────────────── */
  let model: z.infer<typeof BondGraphModel> | z.infer<typeof OdumEslModel>;
  if (isBg) {
    const r = BondGraphModel.safeParse(parsed);
    stages.push({
      name: 'Zod BondGraphModel',
      pass: r.success,
      issues: r.success ? [] : zodIssues(r.error),
    });
    if (!r.success) return JSON.stringify({ error: 'Schema validation failed', stages });
    model = r.data;
  } else {
    const r = OdumEslModel.safeParse(parsed);
    stages.push({
      name: 'Zod OdumEslModel',
      pass: r.success,
      issues: r.success ? [] : zodIssues(r.error),
    });
    if (!r.success) return JSON.stringify({ error: 'Schema validation failed', stages });
    model = r.data;

    /* ── Stage 3 (Odum only): Semantic pre-check ────────────────────
     * Catch interaction/limit without control_node and broken ID refs
     * before they reach GSSK_Init and produce cryptic errors.
     * ────────────────────────────────────────────────────────────── */
    const nodeIds = new Set((model as z.infer<typeof OdumEslModel>).nodes.map(n => n.id));
    const semIssues: Stage['issues'] = [];
    for (const edge of (model as z.infer<typeof OdumEslModel>).edges ?? []) {
      const label = edge.id ?? edge.origin;
      if (!nodeIds.has(edge.origin))
        semIssues.push({ path: `edge.${label}`, message: `origin '${edge.origin}' not found in nodes` });
      if (!nodeIds.has(edge.target))
        semIssues.push({ path: `edge.${label}`, message: `target '${edge.target}' not found in nodes` });
      if ((edge.logic === 'interaction' || edge.logic === 'limit') && !edge.params.control_node)
        semIssues.push({ path: `edge.${label}.params`, message: `'${edge.logic}' logic requires params.control_node` });
      if (edge.params.control_node && !nodeIds.has(edge.params.control_node))
        semIssues.push({ path: `edge.${label}.params.control_node`, message: `control_node '${edge.params.control_node}' not found in nodes` });
    }
    stages.push({
      name:   'Semantic pre-check (Odum ESL)',
      pass:   semIssues.length === 0,
      issues: semIssues.length ? semIssues : [],
    });
    if (semIssues.length > 0) {
      return JSON.stringify({ error: 'Semantic validation failed', stages });
    }
  }

  /* ── IDC path (Bond Graph only) ─────────────────────────────────── */
  if (calculus === 'idc' && isBg) {
    /* Inject default config so WASM returns state-space matrices */
    const bgM = model as z.infer<typeof BondGraphModel>;
    if (!bgM.config) {
      const rEl = bgM.elements.find(e => e.type === 'R');
      const cEl = bgM.elements.find(e => e.type === 'C');
      const iEl = bgM.elements.find(e => e.type === 'I');
      const tau = rEl && cEl ? Number(rEl.parameter) * Number(cEl.parameter)
                : rEl && iEl ? Number(iEl.parameter) / Number(rEl.parameter)
                : 10;
      const t_end = Math.max(5 * Math.abs(tau), 1);
      bgM.config = { t_start: 0, t_end, dt: t_end / 1000, method: 'rk4' };
    }

    /* Step 1: WASM causality to get state-space matrices */
    let wasmResult: KernelResult;
    try {
      wasmResult = await runKernel(model);
    } catch (e) {
      stages.push({ name: 'WASM causality (IDC pre-req)', pass: false, note: String(e) });
      return JSON.stringify({ error: 'WASM kernel threw', stages });
    }

    const ss = wasmResult.state_space;
    if (!ss || ss.state_count === 0) {
      stages.push({ name: 'WASM causality (IDC pre-req)', pass: false, note: 'no state_space returned — causality may have failed' });
      return JSON.stringify({ error: 'Cannot extract state-space for IDC', stages });
    }
    stages.push({ name: 'WASM causality (IDC pre-req)', pass: wasmResult.causality?.success ?? false });

    /* Step 2: Build IdcStateSpace — u from Se/Sf parameters (sorted by ID) */
    const bgModel = model as z.infer<typeof BondGraphModel>;
    const sources = bgModel.elements
      .filter(e => e.type === 'Se' || e.type === 'Sf')
      .sort((a, b) => a.id - b.id);
    const u   = Array.from({ length: ss.input_count }, (_, i) => Number(sources[i]?.parameter ?? 0));
    const x0  = ss.state_names.map(name => bgModel.initial_state?.[name] ?? 0);
    const cfg = bgModel.config;

    const idcSs: IdcStateSpace = {
      n: ss.state_count,
      m: ss.input_count,
      A: ss.A,
      B: ss.B,
      u,
      x0,
      stateNames: ss.state_names,
    };
    const idcCfg: IdcConfig = {
      t_start: cfg?.t_start ?? 0,
      t_end:   cfg?.t_end   ?? 1,
      dt:      cfg?.dt      ?? 0.01,
    };

    /* Step 3: IDC log-Euler integration */
    let idcOut: ReturnType<typeof solveIDC>;
    try {
      idcOut = solveIDC(idcSs, idcCfg);
    } catch (e) {
      stages.push({ name: 'IDC log-Euler solve', pass: false, note: String(e) });
      return JSON.stringify({ error: 'IDC solver threw', stages });
    }
    stages.push({
      name: 'IDC log-Euler solve',
      pass: true,
      note: `${idcOut.time.length} steps, ${idcOut.state_variables.length} state var(s)`,
    });

    return JSON.stringify({
      success: true,
      domain:    'bondgraph',
      calculus:  'idc',
      causality: wasmResult.causality,
      state_space: ss,
      simulation: {
        state_variables: idcOut.state_variables,
        time: idcOut.time,
        data: idcOut.data,
      },
      stages,
    }, null, 2);
  }

  /* ── Stage 3/4: WASM kernel (causality + numerical solve) ───────── */

  /* Inject a default simConfig if the model has none — the WASM kernel
   * skips RK4 integration when config is absent ("no simulation block").
   * Use 5× the dominant RC time constant so the transient is fully visible. */
  if (isBg) {
    const bgM = model as z.infer<typeof BondGraphModel>;
    if (!bgM.config) {
      const rEl  = bgM.elements.find(e => e.type === 'R');
      const cEl  = bgM.elements.find(e => e.type === 'C');
      const iEl  = bgM.elements.find(e => e.type === 'I');
      const tau  = rEl && cEl ? Number(rEl.parameter) * Number(cEl.parameter)
                 : rEl && iEl ? Number(iEl.parameter) / Number(rEl.parameter)
                 : 10;
      const t_end = Math.max(5 * Math.abs(tau), 1);
      const dt    = t_end / 1000;
      (model as z.infer<typeof BondGraphModel>).config = {
        t_start: 0,
        t_end,
        dt,
        method: 'rk4',
      };
    }
  }

  let result: KernelResult;
  try {
    result = await runKernel(model);
  } catch (e) {
    stages.push({ name: isBg ? 'WASM BG causality + RK4 solve' : 'WASM Odum ESL solve', pass: false, note: String(e) });
    return JSON.stringify({ error: 'WASM kernel threw', stages });
  }

  /* Extract error message from WASM output (GSSK returns diagnostics at top level) */
  const rawResult = result as KernelResult & { diagnostics?: Array<{ message?: string }> };
  const wasmErrMsg = !result.success
    ? (result.sim_error
        ?? rawResult.diagnostics?.[0]?.message
        ?? (result.causality?.diagnostics?.[0]?.message)
        ?? 'kernel returned success=false')
    : undefined;

  const causalOk = result.causality?.success ?? result.success;
  const simOk    = result.success && !!result.simulation;
  const simNote  = simOk
    ? `${result.simulation!.time.length} steps, ${result.simulation!.state_variables.length} state var(s)`
    : wasmErrMsg ?? (causalOk ? 'no simulation block' : 'causality failed');

  stages.push({
    name: isBg ? 'WASM BG causality + RK4 solve' : 'WASM Odum ESL solve',
    pass: simOk,
    note: simNote,
  });

  return JSON.stringify({ ...result, stages }, null, 2);
}
