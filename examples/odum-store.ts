/**
 * MDK Odum ESL demo — Soil Water Store
 *
 * Classic Odum Energy Systems Language model.
 * A storage compartment (soil water) is driven by rainfall inflow,
 * loses water to evapotranspiration (ET) and stream baseflow.
 *
 * Topology:
 *
 *   Rain (source)
 *     │ constant k=10
 *     ▼
 *   SoilWater (storage)  ←── state variable Q [mm]
 *     │              │
 *     │ linear        │ linear
 *     │ k=0.05        │ k=0.10
 *     ▼              ▼
 *    ET (sink)     Stream (sink)
 *
 * State equation:
 *   dQ/dt = 10 − 0.05·Q − 0.10·Q = 10 − 0.15·Q
 *
 * Steady-state (fill):   Q* = 10 / 0.15 ≈ 66.7 mm
 * Time constant:         τ  = 1 / 0.15  ≈ 6.7 days
 *
 * Two phases:
 *   Phase 1 — Fill:      60 days of rainfall, Q: 0 → 66.7 mm
 *   Phase 2 — Discharge: 60-day drought (rain edge k→0), Q: 66.7 → ~0
 *   Half-life of discharge: ln(2) / 0.15 ≈ 4.6 days
 */

import { OdumEslModel, runKernel, cleanupKernel } from '@mdk/core';

/* ── Shared topology ─────────────────────────────────────────────── */

const nodes = [
  { id: 'Rain',      type: 'source'  as const, value: 10 },
  { id: 'SoilWater', type: 'storage' as const, value: 0  },
  { id: 'ET',        type: 'sink'    as const, value: 0  },
  { id: 'Stream',    type: 'sink'    as const, value: 0  },
];

const edgesFill = [
  { origin: 'Rain',      target: 'SoilWater', logic: 'constant' as const, params: { k: 10   } },
  { origin: 'SoilWater', target: 'ET',         logic: 'linear'   as const, params: { k: 0.05 } },
  { origin: 'SoilWater', target: 'Stream',     logic: 'linear'   as const, params: { k: 0.10 } },
];

/* ── Phase 1: Fill (60 days of rainfall) ────────────────────────── */

const fillModel = OdumEslModel.parse({
  domain: 'odum-esl',
  nodes,
  edges: edgesFill,
  config: { t_end: 60, dt: 0.5, method: 'rk4' },
});

console.log('══ Phase 1: Fill (rainfall on) ═════════════════════════════');
const fillResult = await runKernel(fillModel);
if (!fillResult.success) { console.error(fillResult.sim_error); process.exit(1); }

const fillSim = fillResult.simulation!;
const swIdx = fillSim.state_variables.indexOf('SoilWater');

console.log(`\n  day     SoilWater(mm)   inflow(mm/d)   ET(mm/d)   stream(mm/d)`);
for (let i = 0; i < fillSim.time.length; i += 20) {
  const t   = fillSim.time[i];
  const Q   = fillSim.data[swIdx][i];
  const inf = 10;                      // constant inflow
  const et  = 0.05 * Q;
  const str = 0.10 * Q;
  console.log(
    `  ${t.toFixed(1).padStart(5)}   ${Q.toFixed(2).padStart(13)}   ${inf.toFixed(2).padStart(12)}   ${et.toFixed(2).padStart(8)}   ${str.toFixed(2).padStart(11)}`
  );
}

/* ── Phase 2: Discharge (60-day drought) ───────────────────────── */

// Take final state of fill as initial condition for discharge
const Q_steady = fillSim.data[swIdx][fillSim.data[swIdx].length - 1];
console.log(`\n  → End-of-fill store level: ${Q_steady.toFixed(2)} mm  (theoretical: ${(10/0.15).toFixed(2)} mm)`);

const dischargeModel = OdumEslModel.parse({
  domain: 'odum-esl',
  nodes: nodes.map(n => n.id === 'SoilWater' ? { ...n, value: Q_steady } : n),
  edges: edgesFill.map(e => e.origin === 'Rain' ? { ...e, params: { k: 0 } } : e),
  config: { t_end: 60, dt: 0.5, method: 'rk4' },
});

console.log('\n══ Phase 2: Discharge (drought — no rainfall) ══════════════');
const disResult = await runKernel(dischargeModel);
if (!disResult.success) { console.error(disResult.sim_error); process.exit(1); }

const disSim = disResult.simulation!;

console.log(`\n  day     SoilWater(mm)   ET(mm/d)   stream(mm/d)   total-loss(mm/d)`);
for (let i = 0; i < disSim.time.length; i += 20) {
  const t   = disSim.time[i];
  const Q   = disSim.data[swIdx][i];
  const et  = 0.05 * Q;
  const str = 0.10 * Q;
  console.log(
    `  ${t.toFixed(1).padStart(5)}   ${Q.toFixed(2).padStart(13)}   ${et.toFixed(2).padStart(8)}   ${str.toFixed(2).padStart(11)}   ${(et + str).toFixed(2).padStart(15)}`
  );
}

const Q_half = Q_steady / 2;
const t_half = Math.log(2) / 0.15;
console.log(`\n  → Theoretical half-life: ${t_half.toFixed(1)} days  (50% = ${Q_half.toFixed(2)} mm)`);

cleanupKernel();

