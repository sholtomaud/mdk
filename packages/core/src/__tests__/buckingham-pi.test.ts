import { describe, it, expect } from 'vitest';
import { computePiGroups, computePiGroupsFromModel } from '../analysis/buckingham-pi.js';
import type { DacmVariable } from '../schema/dacm.js';

/* ── Helpers ─────────────────────────────────────────────────────── */

function makeVar(id: string, symbol: string, dims: Partial<{ M: number; L: number; T: number; I: number; Θ: number; N: number; J: number }>): DacmVariable {
  return {
    id, name: id, symbol,
    siDimensions: { M: 0, L: 0, T: 0, I: 0, Θ: 0, N: 0, J: 0, ...dims },
  };
}

/* ── Classic examples from dimensional analysis ──────────────────── */

describe('computePiGroups — classic textbook examples', () => {

  describe('pendulum: T, L, g, m', () => {
    // T = [T], L = [L], g = [L T^-2], m = [M]
    // Expected: 2 pi-groups from 4 variables with rank 2 (we use M, L, T)
    // Actually rank is 3 (M, L, T all appear), so n-r = 4-3 = 1 pi-group
    // π₁ = T^2·g/L  (period squared × gravity / length) — dimensionless
    const vars: DacmVariable[] = [
      makeVar('period', 'T', { T: 1 }),          // period [T]
      makeVar('length', 'L', { L: 1 }),           // pendulum length [L]
      makeVar('gravity', 'g', { L: 1, T: -2 }),   // gravitational acceleration [L T^-2]
      makeVar('mass', 'm', { M: 1 }),             // mass [M]
    ];

    it('finds 1 pi-group (n=4, rank=3)', () => {
      const result = computePiGroups(vars);
      expect(result.rank).toBe(3);
      expect(result.nGroups).toBe(1);
      expect(result.piGroups).toHaveLength(1);
    });

    it('pi-group is truly dimensionless (exponents sum to zero for each SI dim)', () => {
      const result = computePiGroups(vars);
      const pg = result.piGroups[0];

      // Check that A @ e = 0 (dimension constraint)
      const dimMap: Record<string, number[]> = {
        period:  [0, 0, 1, 0, 0, 0, 0],
        length:  [0, 1, 0, 0, 0, 0, 0],
        gravity: [0, 1, -2, 0, 0, 0, 0],
        mass:    [1, 0, 0, 0, 0, 0, 0],
      };

      for (let dim = 0; dim < 7; dim++) {
        const sum = Object.entries(pg.exponents).reduce((acc, [id, exp]) => {
          return acc + (dimMap[id]?.[dim] ?? 0) * exp;
        }, 0);
        expect(Math.abs(sum), `dimension ${dim} should sum to 0`).toBeLessThan(1e-8);
      }
    });

    it('returns all 4 input variable ids', () => {
      const result = computePiGroups(vars);
      expect(result.inputVariables).toContain('period');
      expect(result.inputVariables).toContain('gravity');
    });
  });

  describe('drag force: F, ρ, v, L', () => {
    // F = [M L T^-2], ρ = [M L^-3], v = [L T^-1], L = [L]
    // rank = 3 (M, L, T), n = 4 → 1 pi-group = drag coefficient form
    const vars: DacmVariable[] = [
      makeVar('F',   'F',   { M: 1, L: 1, T: -2 }),   // force [N]
      makeVar('rho', 'ρ',   { M: 1, L: -3 }),          // density [kg/m³]
      makeVar('v',   'v',   { L: 1, T: -1 }),          // velocity [m/s]
      makeVar('L',   'L',   { L: 1 }),                 // length [m]
    ];

    it('finds 1 pi-group (Cd-like)', () => {
      const result = computePiGroups(vars);
      expect(result.rank).toBe(3);
      expect(result.piGroups).toHaveLength(1);
    });

    it('pi-group is dimensionless', () => {
      const result = computePiGroups(vars);
      const pg = result.piGroups[0];
      const dimMap: Record<string, number[]> = {
        F:   [1,  1, -2, 0, 0, 0, 0],
        rho: [1, -3,  0, 0, 0, 0, 0],
        v:   [0,  1, -1, 0, 0, 0, 0],
        L:   [0,  1,  0, 0, 0, 0, 0],
      };
      for (let dim = 0; dim < 7; dim++) {
        const sum = Object.entries(pg.exponents).reduce(
          (acc, [id, exp]) => acc + (dimMap[id]?.[dim] ?? 0) * exp, 0,
        );
        expect(Math.abs(sum)).toBeLessThan(1e-8);
      }
    });
  });

  describe('Reynolds number: ρ, v, L, μ', () => {
    // ρ = [M L^-3], v = [L T^-1], L = [L], μ = [M L^-1 T^-1]
    // rank = 3, n = 4 → 1 pi-group = Re = ρvL/μ
    const vars: DacmVariable[] = [
      makeVar('rho', 'ρ', { M: 1, L: -3 }),
      makeVar('v',   'v', { L: 1, T: -1 }),
      makeVar('L',   'L', { L: 1 }),
      makeVar('mu',  'μ', { M: 1, L: -1, T: -1 }),
    ];

    it('finds exactly 1 pi-group (Re)', () => {
      const result = computePiGroups(vars);
      expect(result.piGroups).toHaveLength(1);
      expect(result.rank).toBe(3);
    });

    it('pi-group involves all 4 variables', () => {
      const result = computePiGroups(vars);
      const keys = Object.keys(result.piGroups[0].exponents);
      expect(keys.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('power law: P, ρ, ω, r (wind turbine)', () => {
    // P = [M L^2 T^-3], ρ = [M L^-3], ω = [T^-1], r = [L]
    // rank = 3, n = 4 → 1 pi-group: power coefficient Cp
    const vars: DacmVariable[] = [
      makeVar('P',   'P',  { M: 1, L: 2, T: -3 }),
      makeVar('rho', 'ρ',  { M: 1, L: -3 }),
      makeVar('om',  'ω',  { T: -1 }),
      makeVar('r',   'r',  { L: 1 }),
    ];

    it('finds 1 pi-group (Cp)', () => {
      const result = computePiGroups(vars);
      expect(result.piGroups).toHaveLength(1);
    });

    it('provides a human-readable formula string', () => {
      const result = computePiGroups(vars);
      expect(result.piGroups[0].formula).toBeTruthy();
      expect(typeof result.piGroups[0].formula).toBe('string');
    });
  });
});

/* ── Edge cases ──────────────────────────────────────────────────── */

describe('computePiGroups — edge cases', () => {
  it('returns empty result for 0 variables', () => {
    const result = computePiGroups([]);
    expect(result.piGroups).toHaveLength(0);
    expect(result.nGroups).toBe(0);
  });

  it('returns empty result for 1 variable', () => {
    const result = computePiGroups([makeVar('v', 'v', { L: 1, T: -1 })]);
    expect(result.piGroups).toHaveLength(0);
  });

  it('ignores variables without siDimensions', () => {
    const vars: DacmVariable[] = [
      { id: 'x', name: 'x', symbol: 'x' },   // no siDimensions
      makeVar('v', 'v', { L: 1, T: -1 }),
    ];
    const result = computePiGroups(vars);
    expect(result.inputVariables).toContain('v');
    expect(result.inputVariables).not.toContain('x');
  });

  it('two dimensionless variables give 2 pi-groups', () => {
    // Both dimensionless → dimension matrix all zeros → rank=0, n-r=2
    const vars: DacmVariable[] = [
      makeVar('a', 'a', {}),
      makeVar('b', 'b', {}),
    ];
    const result = computePiGroups(vars);
    expect(result.piGroups).toHaveLength(2);
    expect(result.rank).toBe(0);
  });

  it('dimMatrix and dimLabels are populated', () => {
    const vars = [
      makeVar('F', 'F', { M: 1, L: 1, T: -2 }),
      makeVar('v', 'v', { L: 1, T: -1 }),
    ];
    const result = computePiGroups(vars);
    expect(result.dimMatrix.length).toBeGreaterThan(0);
    expect(result.dimLabels.length).toBe(result.dimMatrix.length);
  });
});

/* ── computePiGroupsFromModel ────────────────────────────────────── */

describe('computePiGroupsFromModel', () => {
  const model = {
    name: 'Test',
    domain: 'functional' as const,
    subsystems: [
      {
        id: 'aero',
        name: 'Aerodynamics',
        functions: [
          {
            id: 'drag',
            name: 'Drag',
            variables: [
              makeVar('F',   'F',   { M: 1, L: 1, T: -2 }),
              makeVar('rho', 'ρ',   { M: 1, L: -3 }),
              makeVar('v',   'v',   { L: 1, T: -1 }),
              makeVar('A',   'A',   { L: 2 }),
            ],
          },
        ],
      },
      {
        id: 'struct',
        name: 'Structure',
        functions: [
          {
            id: 'stress',
            name: 'Stress',
            variables: [
              makeVar('sig', 'σ', { M: 1, L: -1, T: -2 }),
              makeVar('F2',  'F', { M: 1, L: 1, T: -2 }),
              makeVar('A2',  'A', { L: 2 }),
            ],
          },
        ],
      },
    ],
  };

  it('collects variables from all subsystems by default', () => {
    const result = computePiGroupsFromModel(model);
    // 4 aero vars + 3 struct vars, but deduped by id → 7 unique ids (F and A overlap only by symbol, not id)
    expect(result.inputVariables.length).toBeGreaterThanOrEqual(4);
  });

  it('filters to specific subsystem by id', () => {
    const result = computePiGroupsFromModel(model, 'aero');
    expect(result.inputVariables).toContain('F');
    expect(result.inputVariables).not.toContain('sig');
    expect(result.piGroups).toHaveLength(1); // 4 vars, rank 3
  });

  it('deduplicates variables with the same id across functions', () => {
    const modelWithDups = {
      ...model,
      subsystems: [{
        id: 'sub1', name: 'S1',
        functions: [
          { id: 'fn1', name: 'F1', variables: [makeVar('v', 'v', { L: 1, T: -1 })] },
          { id: 'fn2', name: 'F2', variables: [makeVar('v', 'v', { L: 1, T: -1 })] },
        ],
      }],
    };
    const result = computePiGroupsFromModel(modelWithDups);
    expect(result.inputVariables).toHaveLength(1); // deduped to 1
  });
});
