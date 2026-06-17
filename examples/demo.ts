/**
 * MDK demo
 *
 * Example 1: Electrical RC circuit
 *   Se:5V → J1 → R:1kΩ, J1 → C:1µF
 *   Expected: capacitor voltage rises 0→5V with τ = RC = 1ms
 *
 * Example 2: Hydraulic pipe with flow and pressure meters
 *   Se:100kPa → J1(flow meter) → {R_pipe, I_fluid} → J0(pressure meter) → C_tank
 *   J1 (1-junction): equal flow through all bonds  → flow meter
 *   J0 (0-junction): equal pressure across all bonds → pressure meter
 *   State variables: p = I·f (fluid momentum), q = C·e (stored volume)
 *   Physical readings: Q [m³/s] = p/I,  P [Pa] = q/C
 *   Expected: damped oscillation toward steady-state Q=0, P=100kPa (τ ≈ 63ms)
 */

import {
  Se, R, C, I, J0, J1,
  MdkSystem, Element, PowerBond,
  runKernel, cleanupKernel,
} from '@mdk/core';

/* ── Example 1: RC circuit ─────────────────────────────────────── */

Element.resetIds();
PowerBond.resetIds();

const Vs  = new Se('Vs', { parameter: 5,    domain: 'electrical' });
const Res = new R('R1',  { parameter: 1e3,  domain: 'electrical' });
const Cap = new C('C1',  { parameter: 1e-6, domain: 'electrical' });
const j1_rc = new J1('J1');

Vs.bond(j1_rc);
j1_rc.bond(Res);
j1_rc.bond(Cap);

const rcSys = new MdkSystem('RC_circuit');
rcSys.add(Vs, j1_rc, Res, Cap);

const rcModel = rcSys.synth(
  { dt: 1e-4, t_end: 0.005 },  // 5ms, τ = 1ms
  { C1: 0 },
);

console.log('══ RC circuit ══════════════════════════════════════════');
const rcResult = await runKernel(rcModel);
if (!rcResult.success) { console.error(rcResult.sim_error); process.exit(1); }

const rcSim = rcResult.simulation!;
console.log(`State variables: ${rcSim.state_variables.join(', ')}`);
console.log('\n  time(ms)   V_cap(V)');
for (let i = 0; i < rcSim.time.length; i += 10) {
  const t_ms = (rcSim.time[i] * 1e3).toFixed(2).padStart(8);
  const v_cap = (rcSim.data[0][i] / 1e-6).toFixed(4).padStart(10); // q/C
  console.log(`  ${t_ms}   ${v_cap}`);
}

/* ── Example 2: Water pipe ─────────────────────────────────────── */
/*
 * Topology (bond graph):
 *
 *   Pump(Se) ─┐
 *   R_pipe   ─┤─ J1(flow) ──── J0(pressure) ── C_tank
 *   I_fluid  ─┘
 *
 * At J1: all bonds carry equal flow → Q = p_I / I  [flow meter]
 * At J0: all bonds carry equal pressure → P = q_C / C  [pressure meter]
 *
 * Parameters (water, 1m pipe, D=50mm):
 *   Pump    100 kPa supply pressure
 *   R_pipe  2×10⁴ Pa·s/m³  viscous friction (Hagen-Poiseuille)
 *   I_fluid 1×10³ kg/m⁴   fluid inertance  ρL/A
 *   C_tank  1×10⁻⁷ m³/Pa  tank compliance
 *
 *   ωₙ = 1/√(I·C) ≈ 100 rad/s  (T ≈ 63 ms)
 *   ζ  = R/(2ωₙI) ≈ 0.10       (underdamped → visible pressure oscillation)
 */

Element.resetIds();
PowerBond.resetIds();

const Pump   = new Se('Pump',    { parameter: 1e5,  domain: 'hydraulic' });
const Rfric  = new R('R_pipe',   { parameter: 2e4,  domain: 'hydraulic' });
const Ifluid = new I('I_fluid',  { parameter: 1e3,  domain: 'hydraulic' });
const Ctank  = new C('C_tank',   { parameter: 1e-7, domain: 'hydraulic' });

const j1_flow = new J1('J1_flow');      // flow meter junction
const j0_pres = new J0('J0_pressure'); // pressure meter junction

// All flow-carrying elements bond to J1_flow (equal flow = series path)
Pump.bond(j1_flow);
j1_flow.bond(Rfric);
j1_flow.bond(Ifluid);

// J1_flow → J0_pressure: carries the net flow into the tank
j1_flow.bond(j0_pres);

// Tank sees the downstream pressure at J0
j0_pres.bond(Ctank);

const pipeSys = new MdkSystem('water_pipe');
pipeSys.add(Pump, j1_flow, Rfric, Ifluid, j0_pres, Ctank);

const pipeModel = pipeSys.synth(
  { dt: 5e-4, t_end: 0.5 },    // 500ms, ωₙT ≈ 10 cycles visible
  { I_fluid: 0, C_tank: 0 },   // start at rest, empty tank
);

console.log('\n══ Water pipe ══════════════════════════════════════════');
const pipeResult = await runKernel(pipeModel);
if (!pipeResult.success) { console.error(pipeResult.sim_error); process.exit(1); }

const sim = pipeResult.simulation!;
console.log(`State variables: ${sim.state_variables.join(', ')}`);

// Identify which state index maps to I_fluid (momentum) and C_tank (volume)
const iMom  = sim.state_variables.findIndex(n => n.includes('I_fluid'));
const iVol  = sim.state_variables.findIndex(n => n.includes('C_tank'));
const I_val = 1e3;   // matches parameter above
const C_val = 1e-7;  //   "

console.log('\n  time(ms)   Q_flow(L/s)   P_tank(kPa)   [flow meter]  [pressure meter]');
for (let i = 0; i < sim.time.length; i += 20) {
  const t_ms  = (sim.time[i] * 1e3).toFixed(1).padStart(8);
  const Q_Ls  = iMom >= 0
    ? ((sim.data[iMom][i] / I_val) * 1e3).toFixed(4).padStart(12)   // m³/s → L/s
    : '         —';
  const P_kPa = iVol >= 0
    ? ((sim.data[iVol][i] / C_val) / 1e3).toFixed(3).padStart(12)   // Pa → kPa
    : '         —';
  console.log(`  ${t_ms}   ${Q_Ls}   ${P_kPa}`);
}

if (pipeResult.state_space) {
  const ss = pipeResult.state_space;
  console.log(`\nState-space: ${ss.state_count} states, ${ss.input_count} inputs`);
  console.log('A =', ss.A.map(r => r.map(v => v.toExponential(2)).join('  ')).join('\n    '));
}

cleanupKernel();
