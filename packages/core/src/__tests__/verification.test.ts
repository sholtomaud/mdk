import { describe, it, expect } from 'vitest';
import { verifyRequirement } from '../verification/evaluator.js';
import { RequirementUsage } from '../schema/sysml.js';
import { type BgSimulation } from '../kernel/wasm-bridge.js';

/* ── Generic mock (non-exponential) ─────────────────────────────── */

const mockSim: BgSimulation = {
  state_variables: ['q_C_1', 'p_I_2'],
  data: [
    [0, 0.1, 0.2, 0.3, 0.2],
    [0, 5, 10, 8, 7],
  ],
  time: [0, 1, 2, 3, 4],
};

/* ── RC circuit mock: V(t) = 10·(1 − e^(−t/1))  τ=1s ───────────── */

function rcData(): BgSimulation {
  // Dense time grid so tau interpolation is accurate
  const time = [0, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0];
  const data  = time.map(t => 10 * (1 - Math.exp(-t)));
  return {
    state_variables: ['q_C_1'],
    data:            [data],
    time,
  };
}

function req(id: string, name: string, constraint?: string): RequirementUsage {
  return RequirementUsage.parse({
    '@id':    id,
    '@type':  'RequirementUsage',
    name,
    ...(constraint !== undefined ? { constraint } : {}),
  });
}

/* ── Existing DSL (max / min / final / op) ───────────────────────── */

describe('verifyRequirement — standard constraints', () => {
  it('verifies max constraint (PASS)', () => {
    const result = verifyRequirement(req('r1', 'Max Charge', 'max(q_C_1) < 0.5'), mockSim);
    expect(result.passed).toBe(true);
    expect(result.actualValue).toBe(0.3);
    expect(result.message).toContain('PASS');
  });

  it('verifies max constraint (FAIL)', () => {
    const result = verifyRequirement(req('r2', 'Max Charge', 'max(q_C_1) < 0.2'), mockSim);
    expect(result.passed).toBe(false);
    expect(result.actualValue).toBe(0.3);
    expect(result.message).toContain('FAIL');
  });

  it('verifies final constraint', () => {
    const result = verifyRequirement(req('r3', 'Final', 'final(p_I_2) == 7'), mockSim);
    expect(result.passed).toBe(true);
    expect(result.actualValue).toBe(7);
  });

  it('handles missing state variable', () => {
    const result = verifyRequirement(req('r4', 'Missing', 'max(velocity) < 10'), mockSim);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('handles invalid constraint format', () => {
    const result = verifyRequirement(req('r5', 'Bad Format', 'invalid string'), mockSim);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('Invalid constraint format');
  });

  it('returns neutral pass if no constraint defined', () => {
    const result = verifyRequirement(req('r6', 'No Constraint'), mockSim);
    expect(result.passed).toBe(true);
    expect(result.message).toContain('No quantitative constraint');
  });
});

/* ── tau() — RC circuit (τ = 1 s) ───────────────────────────────── */

describe('verifyRequirement — tau() on RC circuit data (τ=1s)', () => {
  const rc = rcData();

  it('extracts τ ≈ 1s from perfect RC data', () => {
    const result = verifyRequirement(req('t1', 'Time Constant', 'tau(q_C_1) <= 1.05'), rc);
    expect(result.passed).toBe(true);
    expect(result.actualValue).toBeCloseTo(1.0, 1);
  });

  it('fails when τ limit is too tight', () => {
    const result = verifyRequirement(req('t2', 'Tight τ', 'tau(q_C_1) <= 0.9'), rc);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('FAIL');
  });

  it('within operator passes for τ within 5% of 1s', () => {
    const result = verifyRequirement(req('t3', 'τ≈1s', 'tau(q_C_1) within 0.05 of 1.0'), rc);
    expect(result.passed).toBe(true);
    expect(result.actualValue).toBeCloseTo(1.0, 1);
    expect(result.message).toContain('PASS');
    expect(result.message).toContain('within');
  });

  it('within operator fails when reference is wrong', () => {
    const result = verifyRequirement(req('t4', 'Wrong τ', 'tau(q_C_1) within 0.05 of 2.0'), rc);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('FAIL');
  });

  it('within constraint message includes actual value and diff', () => {
    const result = verifyRequirement(req('t5', 'τ check', 'tau(q_C_1) within 0.1 of 1.0'), rc);
    expect(result.message).toContain('diff=');
  });
});

/* ── exp_rms() — goodness of exponential fit ────────────────────── */

describe('verifyRequirement — exp_rms() on RC circuit data', () => {
  const rc = rcData();

  it('returns low RMS for data that is exactly exponential', () => {
    // Finite window (5τ) means final value is 99.3% of asymptote, so
    // the normalized RMS from the asymptote mismatch is ~0.5% — use 1% tolerance.
    const result = verifyRequirement(req('e1', 'RMS', 'exp_rms(q_C_1) < 0.01'), rc);
    expect(result.passed).toBe(true);
    expect(result.actualValue!).toBeLessThan(0.01);
  });

  it('reports exp_rms in PASS message', () => {
    const result = verifyRequirement(req('e2', 'RMS msg', 'exp_rms(q_C_1) < 0.01'), rc);
    expect(result.message).toContain('PASS');
    expect(result.message).toContain('exp_rms');
  });

  it('fails for a stricter tolerance if noise present', () => {
    // Perturb the data slightly to simulate numerical integration noise
    const noisy: BgSimulation = {
      ...rc,
      data: [rc.data[0].map((v, i) => v + (i % 2 === 0 ? 0.05 : -0.05))],
    };
    const result = verifyRequirement(req('e3', 'Noisy', 'exp_rms(q_C_1) < 0.001'), noisy);
    // With 5% noise on a 0–10 range, normalized RMS will be > 0.001
    expect(result.passed).toBe(false);
  });
});

/* ── within operator (additional cases) ─────────────────────────── */

describe('verifyRequirement — within operator', () => {
  it('works with final() function', () => {
    const result = verifyRequirement(
      req('w1', 'Final V', 'final(q_C_1) within 0.5 of 9.9'), rcData(),
    );
    // final value of 10*(1-e^-5) ≈ 9.933, within 0.5 of 9.9 → diff ≈ 0.033
    expect(result.passed).toBe(true);
  });

  it('works with max() function', () => {
    const result = verifyRequirement(
      req('w2', 'Max', 'max(q_C_1) within 0.1 of 9.93'), rcData(),
    );
    expect(result.passed).toBe(true);
  });
});
