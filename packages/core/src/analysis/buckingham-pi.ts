/**
 * Buckingham π-theorem — dimensional analysis for DACM power-law discovery.
 *
 * Given a set of DacmVariables with SI dimension vectors, computes the
 * complete set of dimensionless π-groups using the null-space of the
 * dimension matrix (Gaussian elimination → RREF).
 *
 * Reference: Buckingham, E. (1914). "On physically similar systems".
 *            Physical Review, 4(4), 345–376.
 * DACM use:  Dhalpe et al. (2025), step 3 — dimensional decomposition.
 */

import type { DacmVariable } from '../schema/dacm.js';

/* ── SI base dimensions ──────────────────────────────────────────────── */

const SI_DIMS = ['M', 'L', 'T', 'I', 'Θ', 'N', 'J'] as const;
type SiDimKey = typeof SI_DIMS[number];

/* ── Public types ────────────────────────────────────────────────────── */

export interface PiGroup {
  id:        string;                   // e.g. "pi_1"
  exponents: Record<string, number>;   // variable id → exponent in the group
  formula:   string;                   // human-readable, e.g. "v²·ρ·L²/F"
}

export interface PiGroupResult {
  inputVariables: string[];     // variable ids that had siDimensions
  piGroups:       PiGroup[];
  rank:           number;       // rank of dimension matrix = number of independent dimensions
  nGroups:        number;       // n - rank
  dimMatrix:      number[][];   // rows = SI dims used, cols = variables
  dimLabels:      string[];     // row labels for dimMatrix
}

/* ── Gaussian elimination → RREF ─────────────────────────────────────── */

const EPS = 1e-10;

function rref(A: number[][]): { M: number[][]; pivotCols: number[] } {
  const rows = A.length;
  const cols = A[0]?.length ?? 0;
  const M = A.map(r => [...r]);
  const pivotCols: number[] = [];
  let pivotRow = 0;

  for (let col = 0; col < cols && pivotRow < rows; col++) {
    /* find pivot with largest absolute value for numerical stability */
    let maxRow = -1;
    let maxVal = EPS;
    for (let r = pivotRow; r < rows; r++) {
      const v = Math.abs(M[r][col]);
      if (v > maxVal) { maxVal = v; maxRow = r; }
    }
    if (maxRow === -1) continue;

    /* swap */
    [M[pivotRow], M[maxRow]] = [M[maxRow], M[pivotRow]];

    /* scale pivot row to 1 */
    const scale = M[pivotRow][col];
    for (let j = 0; j < cols; j++) M[pivotRow][j] /= scale;

    /* eliminate column in all other rows */
    for (let r = 0; r < rows; r++) {
      if (r === pivotRow) continue;
      const factor = M[r][col];
      if (Math.abs(factor) < EPS) continue;
      for (let j = 0; j < cols; j++) M[r][j] -= factor * M[pivotRow][j];
    }

    pivotCols.push(col);
    pivotRow++;
  }

  return { M, pivotCols };
}

/* ── Null space basis (one vector per free variable) ────────────────── */

function nullSpaceBasis(A: number[][]): number[][] {
  const n = A[0]?.length ?? 0;
  if (n === 0) return [];

  const { M, pivotCols } = rref(A);
  const pivotSet = new Set(pivotCols);
  const freeCols = Array.from({ length: n }, (_, i) => i).filter(i => !pivotSet.has(i));

  return freeCols.map(freeCol => {
    const v = new Array(n).fill(0);
    v[freeCol] = 1;
    pivotCols.forEach((pc, i) => {
      v[pc] = -M[i][freeCol];
    });
    return v;
  });
}

/* ── Helper: round to avoid floating-point noise ───────────────────── */

function roundExp(x: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}

/* ── Format π-group as a human-readable formula ─────────────────────── */

function formatPiGroup(exps: Record<string, number>, vars: DacmVariable[]): string {
  const varMap = new Map(vars.map(v => [v.id, v]));
  const numerator: string[] = [];
  const denominator: string[] = [];

  for (const [id, exp] of Object.entries(exps)) {
    const sym = varMap.get(id)?.symbol ?? id;
    const abs = Math.abs(exp);
    const part = abs === 1 ? sym : `${sym}^${abs}`;
    if (exp > 0) numerator.push(part);
    else denominator.push(part);
  }

  if (numerator.length === 0 && denominator.length === 0) return '1';
  const num = numerator.join('·') || '1';
  return denominator.length === 0 ? num : `${num}/(${denominator.join('·')})`;
}

/* ── Public API ──────────────────────────────────────────────────────── */

/**
 * Compute π-groups for a set of DACM variables using the Buckingham π theorem.
 *
 * Only variables that have `siDimensions` populated participate in the analysis.
 * Returns an empty result if fewer than 2 variables have dimension data.
 */
export function computePiGroups(variables: DacmVariable[]): PiGroupResult {
  const withDims = variables.filter(v => v.siDimensions !== undefined);

  if (withDims.length < 2) {
    return {
      inputVariables: withDims.map(v => v.id),
      piGroups: [],
      rank: 0,
      nGroups: 0,
      dimMatrix: [],
      dimLabels: [],
    };
  }

  /* Build the full 7×n dimension matrix */
  const fullMatrix: number[][] = SI_DIMS.map(dim =>
    withDims.map(v => {
      const d = v.siDimensions!;
      return (d[dim as SiDimKey] ?? 0);
    }),
  );

  /* Remove rows (dimensions) that are all zero — they don't constrain anything */
  const usedDimLabels: string[] = [];
  const A: number[][] = [];
  SI_DIMS.forEach((dim, i) => {
    if (fullMatrix[i].some(x => Math.abs(x) > EPS)) {
      A.push(fullMatrix[i]);
      usedDimLabels.push(dim);
    }
  });

  const matrix = A.length > 0 ? A : fullMatrix;
  const dimLabels = A.length > 0 ? usedDimLabels : [...SI_DIMS];

  const { pivotCols } = rref(matrix.map(r => [...r]));
  const rank = pivotCols.length;
  const nGroups = withDims.length - rank;

  const nullVecs = nullSpaceBasis(matrix);

  const piGroups: PiGroup[] = nullVecs.map((vec, idx) => {
    const exponents: Record<string, number> = {};
    vec.forEach((exp, j) => {
      const r = roundExp(exp);
      if (Math.abs(r) > EPS) exponents[withDims[j].id] = r;
    });
    return {
      id:        `pi_${idx + 1}`,
      exponents,
      formula:   formatPiGroup(exponents, withDims),
    };
  });

  return {
    inputVariables: withDims.map(v => v.id),
    piGroups,
    rank,
    nGroups,
    dimMatrix: matrix,
    dimLabels,
  };
}

/**
 * Convenience wrapper for a FunctionalModel JSON object: collects all
 * variables from every function in every subsystem (and systemVariables),
 * optionally filtered to a single subsystem by id.
 */
export function computePiGroupsFromModel(
  model: { subsystems: Array<{ id: string; functions: Array<{ variables?: DacmVariable[] }> }>; systemVariables?: DacmVariable[] },
  subsystemId?: string,
): PiGroupResult {
  let vars: DacmVariable[] = [];

  const subs = subsystemId
    ? model.subsystems.filter(s => s.id === subsystemId)
    : model.subsystems;

  for (const sub of subs) {
    for (const fn of sub.functions) {
      vars = vars.concat(fn.variables ?? []);
    }
  }

  if (model.systemVariables) {
    vars = vars.concat(model.systemVariables);
  }

  /* Deduplicate by id */
  const seen = new Set<string>();
  vars = vars.filter(v => {
    if (seen.has(v.id)) return false;
    seen.add(v.id);
    return true;
  });

  return computePiGroups(vars);
}
