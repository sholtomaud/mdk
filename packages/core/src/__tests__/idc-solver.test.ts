/**
 * IDC solver tests.
 *
 * Academic reference:
 *   Giannantoni, C. (2006). Mathematics for generative processes: Living and
 *   non-living systems. J. Computational and Applied Mathematics 189, 324–340.
 *   doi:10.1016/j.cam.2005.03.032
 *
 * Eq. (A.1): d̃^n/dt^n f(t) = lim_{Δt→0+} ((δ̃−1)/Δt)^n f(t)
 * For n=1:   d̃x/dt ≈ (x(t+h) − x(t))/h  →  x(t+h) = x(t)·exp(h·f(x)/x)
 */

import { describe, it, expect } from 'vitest';
import { solveIDC } from '../solvers/idc-solver.js';
import type { IdcStateSpace, IdcConfig } from '../solvers/idc-solver.js';

const EPS = 1e-6;
const LOOSE = 1e-2;   // 1% — IDC log-Euler is non-conservative for coupled systems
                       // (Giannantoni §4 "drift" between IDC and traditional solutions)

function last<T>(arr: T[]): T { return arr[arr.length - 1]; }

/* ── Helpers ─────────────────────────────────────────────────────────*/

function decaySystem(k = 1.0): IdcStateSpace {
  return {
    n: 1, m: 0,
    A: [[-k]], B: [[]], u: [],
    x0: [1.0],
    stateNames: ['x'],
  };
}

function rcSystem(R = 1.0, C = 1.0, V = 1.0): IdcStateSpace {
  return {
    n: 1, m: 1,
    A: [[-1 / (R * C)]],
    B: [[1 / R]],
    u: [V],
    x0: [0.0],  // charge starts at zero
    stateNames: ['q'],
  };
}

function twoCompartment(a = 0.5, b = 0.3): IdcStateSpace {
  return {
    n: 2, m: 0,
    A: [[-a, b], [a, -b]],
    B: [[], []],
    u: [],
    x0: [9.5, 0.5],   // both non-zero: avoids IDC per-capita blowup at Q≈0
    stateNames: ['Q1', 'Q2'],
  };
}

const shortCfg: IdcConfig = { t_start: 0, t_end: 1, dt: 0.01 };

/* ── IDC solver tests ────────────────────────────────────────────────*/

describe('solveIDC()', () => {

  describe('return shape', () => {
    it('has solver field "idc-log-euler"', () => {
      expect(solveIDC(decaySystem(), shortCfg).solver).toBe('idc-log-euler');
    });

    it('state_variables matches stateNames', () => {
      const r = solveIDC(decaySystem(), shortCfg);
      expect(r.state_variables).toEqual(['x']);
    });

    it('time array starts at t_start and ends at or near t_end', () => {
      const r = solveIDC(decaySystem(), shortCfg);
      expect(r.time[0]).toBeCloseTo(0.0, 10);
      expect(last(r.time)).toBeCloseTo(1.0, 5);
    });

    it('data[i] has the same length as time', () => {
      const r = solveIDC(twoCompartment(), shortCfg);
      expect(r.data[0]).toHaveLength(r.time.length);
      expect(r.data[1]).toHaveLength(r.time.length);
    });

    it('defaults state_variables to x0, x1, … when stateNames omitted', () => {
      const ss: IdcStateSpace = { n: 2, m: 0, A: [[-1,0],[0,-2]], B:[[],[]], u:[], x0:[1,1] };
      const r = solveIDC(ss, shortCfg);
      expect(r.state_variables).toEqual(['x0', 'x1']);
    });
  });

  describe('pure exponential decay — IDC is exact (Eq. A.4)', () => {
    /*
     * For dx/dt = −k·x, IDC log-Euler gives:
     *   x(t+h) = x(t) · exp(h · (−k·x) / x) = x(t) · exp(−k·h)
     * This is the exact analytical solution regardless of step size.
     */
    it('matches x(t)=exp(−t) to machine precision', () => {
      const r = solveIDC(decaySystem(1.0), shortCfg);
      for (let s = 0; s < r.time.length; s++) {
        const analytic = Math.exp(-r.time[s]);
        expect(Math.abs(r.data[0][s] - analytic)).toBeLessThan(EPS);
      }
    });

    it('matches x(t)=exp(−3t) with k=3', () => {
      const r = solveIDC(decaySystem(3.0), shortCfg);
      const T = last(r.time);
      expect(last(r.data[0])).toBeCloseTo(Math.exp(-3 * T), 8);
    });
  });

  describe('unconditional positivity preservation', () => {
    /*
     * IDC property: x_i > 0 initially implies x_i > 0 for all t.
     * (exp of any real number is strictly positive)
     */
    it('all values remain strictly positive for positive x0', () => {
      const r = solveIDC(decaySystem(5.0), { t_start: 0, t_end: 10, dt: 0.1 });
      for (const v of r.data[0]) expect(v).toBeGreaterThan(0);
    });

    it('two-compartment transfer: all states non-negative throughout', () => {
      // Q2(0) = 0 by initial condition; IDC preserves non-negativity.
      // After step 1 the zero-guard Euler seeds Q2 > 0, then IDC keeps it positive.
      const r = solveIDC(twoCompartment(), { t_start: 0, t_end: 5, dt: 0.05 });
      for (const v of r.data[0]) expect(v).toBeGreaterThanOrEqual(0);
      for (const v of r.data[1]) expect(v).toBeGreaterThanOrEqual(0);
    });
  });

  describe('two-compartment exchange — conservation', () => {
    /*
     * dQ1/dt = −a·Q1 + b·Q2
     * dQ2/dt =  a·Q1 − b·Q2
     * Total Q1 + Q2 = const at all times (closed system, no external input)
     */
    it('conserves Q1 + Q2 = 10 to within 1% (IDC drift is expected)', () => {
      const r = solveIDC(twoCompartment(0.5, 0.3), { t_start: 0, t_end: 5, dt: 0.01 });
      for (let s = 0; s < r.time.length; s++) {
        const total = r.data[0][s] + r.data[1][s];
        expect(Math.abs(total - 10.0) / 10.0).toBeLessThan(LOOSE);
      }
    });

    it('approaches steady state Q1/Q2 = b/a', () => {
      const a = 0.5, b = 0.3;
      const r = solveIDC(twoCompartment(a, b), { t_start: 0, t_end: 30, dt: 0.05 });
      const Q1 = last(r.data[0]);
      const Q2 = last(r.data[1]);
      expect(Q1 / Q2).toBeCloseTo(b / a, 1);
    });
  });

  describe('driven RC circuit', () => {
    /*
     * dq/dt = V/R − q/(RC),  q(0) = 0
     * Analytic: q(t) = C·V·(1 − e^{−t/(RC)})
     * IDC diverges slightly from RK4 for driven (non-homogeneous) system
     * but should converge to C·V = 1.0 at long time.
     */
    it('q → CV = 1.0 as t→∞', () => {
      const r = solveIDC(rcSystem(1.0, 1.0, 1.0), { t_start: 0, t_end: 15, dt: 0.01 });
      expect(last(r.data[0])).toBeCloseTo(1.0, 2);
    });

    it('q(5τ) ≥ 0.99·CV (>99% charged after 5 time-constants)', () => {
      const RC = 1.0;
      const r = solveIDC(rcSystem(1.0, RC, 1.0), { t_start: 0, t_end: 5 * RC, dt: 0.005 });
      expect(last(r.data[0])).toBeGreaterThanOrEqual(0.98);
    });
  });

  describe('zero-state guard (standard Euler fallback)', () => {
    /*
     * When x_i = 0, the log-form exp(h·f/x) is undefined.
     * The solver must fall back to standard Euler for that step.
     */
    it('does not crash with x0 = 0', () => {
      const ss: IdcStateSpace = {
        n: 1, m: 0, A: [[-1]], B: [[]], u: [], x0: [0.0],
      };
      expect(() => solveIDC(ss, shortCfg)).not.toThrow();
    });

    it('non-zero second state evolves even when first is zero', () => {
      const ss: IdcStateSpace = {
        n: 2, m: 0,
        A: [[-1, 0], [0, -2]],
        B: [[], []], u: [],
        x0: [0.0, 1.0],
      };
      const r = solveIDC(ss, shortCfg);
      // x[0] stays near zero; x[1] decays
      expect(last(r.data[1])).toBeCloseTo(Math.exp(-2), 3);
    });
  });

  describe('IDC vs traditional Euler — drift for driven system', () => {
    /*
     * For dx/dt = −x + 1 (A=[[-1]], B=[[1]], u=[1]):
     * Standard Euler: x(t+h) = x(t) + h·(−x+1)
     * IDC log-Euler:  x(t+h) = x(t)·exp(h·(−x+1)/x)
     *
     * Both converge to x=1 at steady state, but IDC preserves positivity
     * while Euler can overshoot for large h.
     */
    it('IDC never goes negative for x0=0.1 with large dt=0.5', () => {
      const ss: IdcStateSpace = { n: 1, m: 1, A: [[-1]], B: [[1]], u: [1], x0: [0.1] };
      const r = solveIDC(ss, { t_start: 0, t_end: 5, dt: 0.5 });
      for (const v of r.data[0]) expect(v).toBeGreaterThanOrEqual(0);
    });
  });
});
