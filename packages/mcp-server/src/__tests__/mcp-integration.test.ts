/**
 * MCP integration test — T5.6
 *
 * Validates the validate_model → run_simulation round-trip for a
 * canonical RC circuit Bond Graph through the full Zod + WASM pipeline
 * without MCP transport overhead (direct function calls).
 *
 * RC circuit (τ = R × C = 100Ω × 0.001F = 0.1s):
 *   Se(12V) ── J1 ── R(100Ω)
 *                └── C(0.001F)
 *
 * Analytic: V_C(t) = 12 × (1 − e^(−t/τ))
 *   At t = τ = 0.1s: V_C ≈ 12 × 0.6321 = 7.585V
 */

import { describe, it, expect } from 'vitest';
import { validateModel }  from '../tools/validate-model.js';
import { runSimulation }  from '../tools/run-simulation.js';
import { generateDiagram } from '../tools/generate-diagram.js';

/* ── Canonical RC circuit ───────────────────────────────────────── */

const RC_MODEL = JSON.stringify({
  schemaVersion: '1.0',
  domain: 'bondgraph',
  elements: [
    { id: 0, name: 'Vsrc', type: 'Se', parameter: 12.0  },
    { id: 1, name: 'J1',   type: 'J1', parameter: 0.0   },
    { id: 2, name: 'R1',   type: 'R',  parameter: 100.0 },
    { id: 3, name: 'C1',   type: 'C',  parameter: 0.001 },
  ],
  bonds: [
    { id: 0, source: 0, target: 1 },
    { id: 1, source: 1, target: 2 },
    { id: 2, source: 1, target: 3 },
  ],
  config: { t_start: 0, t_end: 0.5, dt: 0.0001, method: 'rk4' },
});

const TAU       = 100 * 0.001;                    // 0.1s
const C_VALUE   = 0.001;                          // Farads — C1 parameter
const V_SOURCE  = 12.0;
// WASM kernel returns charge q (Coulombs) for C state variables; V_C = q / C
const ANALYTIC_V = V_SOURCE * (1 - Math.exp(-1)); // ≈ 7.5854 V at t = τ
const ANALYTIC_Q = C_VALUE * ANALYTIC_V;          // ≈ 0.007585 C

/* ── validate_model ─────────────────────────────────────────────── */

describe('MCP integration — validate_model (T5.6)', () => {
  it('passes Zod BondGraphModel schema for a valid RC circuit', async () => {
    const raw    = await validateModel({ model_json: RC_MODEL });
    const result = JSON.parse(raw) as { valid: boolean; stages: Array<{ name: string; pass: boolean }> };

    const zodStage = result.stages.find(s => s.name === 'Zod BondGraphModel');
    expect(zodStage?.pass).toBe(true);
  });

  it('passes WASM SCAP causality assignment', async () => {
    const raw    = await validateModel({ model_json: RC_MODEL });
    const result = JSON.parse(raw) as {
      valid: boolean;
      causality: { success: boolean; bonds: unknown[] };
      stages: Array<{ name: string; pass: boolean }>;
    };

    expect(result.valid).toBe(true);
    expect(result.causality?.success).toBe(true);
    const causalStage = result.stages.find(s => s.name === 'WASM BG causality assignment');
    expect(causalStage?.pass).toBe(true);
  });

  it('returns valid:false for malformed JSON — no throw', async () => {
    const raw    = await validateModel({ model_json: '{ not valid json' });
    const result = JSON.parse(raw) as { valid: boolean };
    expect(result.valid).toBe(false);
  });

  it('returns valid:false for schema violation (missing elements)', async () => {
    const bad    = JSON.stringify({ domain: 'bondgraph', bonds: [] });
    const raw    = await validateModel({ model_json: bad });
    const result = JSON.parse(raw) as { valid: boolean };
    expect(result.valid).toBe(false);
  });
});

/* ── run_simulation TDC ─────────────────────────────────────────── */

describe('MCP integration — run_simulation TDC (T5.6)', () => {
  it('produces a simulation timeseries (success: true)', async () => {
    const raw    = await runSimulation({ model_json: RC_MODEL, calculus: 'tdc' });
    const result = JSON.parse(raw) as {
      success: boolean;
      simulation: { time: number[]; state_variables: string[]; data: number[][] };
    };

    expect(result.success).toBe(true);
    expect(result.simulation.state_variables).toHaveLength(1);
    expect(result.simulation.time.length).toBeGreaterThan(0);
  });

  it('V_C(τ) ≈ 7.585V — within 1% of analytic', async () => {
    const raw    = await runSimulation({ model_json: RC_MODEL, calculus: 'tdc' });
    const result = JSON.parse(raw) as {
      simulation: { time: number[]; data: number[][] };
    };

    const times  = result.simulation.time;
    const vcData = result.simulation.data[0];  // single state var: C charge → V_C

    // Index closest to t = τ
    const tauIdx = times.reduce(
      (best, t, i) => Math.abs(t - TAU) < Math.abs(times[best] - TAU) ? i : best,
      0,
    );

    // WASM returns charge q; convert to voltage: V_C = q / C
    const vcAtTau = vcData[tauIdx] / C_VALUE;
    expect(Math.abs(vcAtTau - ANALYTIC_V)).toBeLessThan(0.1);  // <0.1V tolerance
  });

  it('all TDC pipeline stages pass', async () => {
    const raw    = await runSimulation({ model_json: RC_MODEL, calculus: 'tdc' });
    const result = JSON.parse(raw) as { stages: Array<{ name: string; pass: boolean }> };

    for (const stage of result.stages) {
      expect(stage.pass, `Stage "${stage.name}" failed`).toBe(true);
    }
  });

  it('returns error for schema violation — no throw', async () => {
    const bad    = JSON.stringify({ domain: 'bondgraph', elements: [], bonds: [] });
    const raw    = await runSimulation({ model_json: bad, calculus: 'tdc' });
    const result = JSON.parse(raw) as { error?: string };
    expect(result.error).toBeDefined();
  });
});

/* ── run_simulation IDC ─────────────────────────────────────────── */

describe('MCP integration — run_simulation IDC (T5.6)', () => {
  it('produces an IDC timeseries (calculus: idc)', async () => {
    const raw    = await runSimulation({ model_json: RC_MODEL, calculus: 'idc' });
    const result = JSON.parse(raw) as {
      success: boolean;
      calculus: string;
      simulation: { time: number[]; state_variables: string[]; data: number[][] };
    };

    expect(result.success).toBe(true);
    expect(result.calculus).toBe('idc');
    expect(result.simulation.time.length).toBeGreaterThan(0);
  });

  it('IDC V_C(τ) within 5% of analytic value', async () => {
    const raw    = await runSimulation({ model_json: RC_MODEL, calculus: 'idc' });
    const result = JSON.parse(raw) as {
      simulation: { time: number[]; data: number[][] };
    };

    const times  = result.simulation.time;
    const vcData = result.simulation.data[0];

    const tauIdx = times.reduce(
      (best, t, i) => Math.abs(t - TAU) < Math.abs(times[best] - TAU) ? i : best,
      0,
    );

    // WASM returns charge q; convert to voltage: V_C = q / C
    const vcAtTau = vcData[tauIdx] / C_VALUE;
    // IDC log-Euler has larger numerical tolerance than RK4
    expect(Math.abs(vcAtTau - ANALYTIC_V)).toBeLessThan(ANALYTIC_V * 0.05);
  });
});

/* ── generate_diagram (Bond Graph view) ─────────────────────────── */

describe('MCP integration — generate_diagram BG (T5.6)', () => {
  it('returns mermaid diagram string for BG view', async () => {
    const raw = await generateDiagram({
      model_json: RC_MODEL,
      view:   'bg',
      format: 'mermaid',
    });

    expect(raw).toContain('```mermaid');
    expect(raw).toContain('graph LR');
    // All 4 elements should appear as nodes
    expect(raw).toContain('n0');
    expect(raw).toContain('n3');
  });

  it('returns DOT string for BG view in dot format', async () => {
    const raw = await generateDiagram({
      model_json: RC_MODEL,
      view:   'bg',
      format: 'dot',
    });

    expect(raw).toContain('digraph');
    expect(raw).toContain('rankdir=LR');
  });
});
