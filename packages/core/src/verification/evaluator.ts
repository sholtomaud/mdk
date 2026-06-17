import { type RequirementUsage } from '../schema/sysml.js';
import { type BgSimulation } from '../kernel/wasm-bridge.js';

export interface VerificationResult {
  requirementId: string;
  requirementName: string;
  passed: boolean;
  actualValue?: number;
  message: string;
}

const ONE_MINUS_INV_E = 1 - Math.exp(-1); // ≈ 0.6321

/**
 * Extract the time constant τ from exponential simulation data via linear interpolation.
 * For a rising/falling first-order response, τ is the time to reach 63.2% of the
 * total change from initial to final value.
 */
function extractTau(time: number[], data: number[]): number | null {
  if (data.length < 2) return null;
  const initial  = data[0];
  const finalVal = data[data.length - 1];
  const delta    = finalVal - initial;
  if (Math.abs(delta) < 1e-12) return null;

  const target = initial + ONE_MINUS_INV_E * delta;
  const rising = delta > 0;

  for (let i = 1; i < data.length; i++) {
    const crossed = rising ? data[i] >= target : data[i] <= target;
    if (crossed) {
      // Linear interpolation between i-1 and i
      const t0 = time[i - 1], t1 = time[i];
      const d0 = data[i - 1], d1 = data[i];
      return t0 + ((target - d0) / (d1 - d0)) * (t1 - t0);
    }
  }
  return null; // threshold never reached in sim window
}

/**
 * Compute normalized RMS error between simulation data and the fitted exponential
 * f(t) = initial + delta * (1 - exp(-t/τ)).  Returns a dimensionless ratio
 * (0 = perfect fit, 1 = RMS error equals the total amplitude).
 */
function expNormalizedRms(time: number[], data: number[], tau: number): number {
  const initial  = data[0];
  const finalVal = data[data.length - 1];
  const delta    = finalVal - initial;
  if (Math.abs(delta) < 1e-12) return 0;

  let sumSq = 0;
  for (let i = 0; i < data.length; i++) {
    const fit = initial + delta * (1 - Math.exp(-time[i] / tau));
    const err = data[i] - fit;
    sumSq += err * err;
  }
  return Math.sqrt(sumSq / data.length) / Math.abs(delta);
}

/**
 * Verifies a SysML requirement against Bond Graph simulation data.
 *
 * Supported constraint forms:
 *
 *   func(state) op threshold
 *     Functions:  max, min, final, tau, exp_rms
 *     Operators:  <, <=, >, >=, ==
 *     Examples:   "final(q_C_1) >= 9.0"
 *                 "tau(q_C_1) <= 1.1"
 *                 "exp_rms(q_C_1) < 0.02"
 *
 *   func(state) within tolerance of reference
 *     Passes if |func_result − reference| ≤ tolerance
 *     Example:   "tau(q_C_1) within 0.05 of 1.0"
 */
export function verifyRequirement(req: RequirementUsage, sim: BgSimulation): VerificationResult {
  const id   = req['@id'];
  const name = req.name;

  const constraint = req.constraint;
  if (!constraint) {
    return {
      requirementId:   id,
      requirementName: name,
      passed: true,
      message: 'No quantitative constraint defined for automated verification.',
    };
  }

  const trimmed = constraint.trim();

  /* ── "within" form ──────────────────────────────────────────────── */
  const withinRe = /^(\w+)\(([^)]+)\)\s+within\s+([\d.]+)\s+of\s+([\d.-]+)$/i;
  const withinMatch = trimmed.match(withinRe);
  if (withinMatch) {
    const [, func, stateName, tolStr, refStr] = withinMatch;
    const tol = parseFloat(tolStr);
    const ref = parseFloat(refStr);

    const lookup = resolveState(sim, stateName);
    if (!lookup) return missing(id, name, stateName, sim.state_variables);

    const computed = computeFunc(func, sim.time, lookup.data);
    if (computed === null) return unsupportedFunc(id, name, func, sim.time, lookup.data);

    const diff  = Math.abs(computed - ref);
    const passed = diff <= tol;
    return {
      requirementId:   id,
      requirementName: name,
      passed,
      actualValue: computed,
      message: passed
        ? `PASS: ${func}(${stateName}) [${computed.toFixed(4)}] within ${tol} of ${ref} (diff=${diff.toFixed(4)})`
        : `FAIL: ${func}(${stateName}) [${computed.toFixed(4)}] is ${diff.toFixed(4)} from ${ref}, tolerance=${tol}`,
    };
  }

  /* ── standard "func(state) op threshold" form ───────────────────── */
  const stdRe = /^(\w+)\(([^)]+)\)\s*([<>=!]+)\s*([\d.-]+)$/;
  const stdMatch = trimmed.match(stdRe);
  if (!stdMatch) {
    return {
      requirementId:   id,
      requirementName: name,
      passed: false,
      message: `Invalid constraint format: "${constraint}". ` +
        `Expected "func(state) op value" or "func(state) within tol of ref".`,
    };
  }

  const [, func, stateName, op, thresholdStr] = stdMatch;
  const threshold = parseFloat(thresholdStr);

  const lookup = resolveState(sim, stateName);
  if (!lookup) return missing(id, name, stateName, sim.state_variables);

  const actualValue = computeFunc(func, sim.time, lookup.data);
  if (actualValue === null) return unsupportedFunc(id, name, func, sim.time, lookup.data);

  let passed = false;
  switch (op) {
    case '<':   passed = actualValue < threshold; break;
    case '<=':  passed = actualValue <= threshold; break;
    case '>':   passed = actualValue > threshold; break;
    case '>=':  passed = actualValue >= threshold; break;
    case '==':  passed = Math.abs(actualValue - threshold) < 1e-6; break;
    default:
      return {
        requirementId:   id,
        requirementName: name,
        passed: false,
        message: `Unsupported operator: '${op}'. Use <, <=, >, >=, or ==.`,
      };
  }

  return {
    requirementId:   id,
    requirementName: name,
    passed,
    actualValue,
    message: passed
      ? `PASS: ${func}(${stateName}) [${actualValue.toFixed(4)}] ${op} ${threshold}`
      : `FAIL: ${func}(${stateName}) [${actualValue.toFixed(4)}] is not ${op} ${threshold}`,
  };
}

/* ── Internal helpers ─────────────────────────────────────────────── */

function resolveState(
  sim: BgSimulation,
  stateName: string,
): { data: number[] } | null {
  const idx = sim.state_variables.findIndex(sv => sv.includes(stateName));
  if (idx === -1) return null;
  const data = sim.data[idx];
  if (!data || data.length === 0) return null;
  return { data };
}

function computeFunc(
  func: string,
  time: number[],
  data: number[],
): number | null {
  switch (func.toLowerCase()) {
    case 'max':   return Math.max(...data);
    case 'min':   return Math.min(...data);
    case 'final': return data[data.length - 1];
    case 'tau': {
      const tau = extractTau(time, data);
      return tau; // null if not computable
    }
    case 'exp_rms': {
      const tau = extractTau(time, data);
      if (tau === null) return null;
      return expNormalizedRms(time, data, tau);
    }
    default: return null;
  }
}

function missing(id: string, name: string, stateName: string, vars: string[]): VerificationResult {
  return {
    requirementId:   id,
    requirementName: name,
    passed: false,
    message: `State variable '${stateName}' not found. Available: [${vars.join(', ')}]`,
  };
}

function unsupportedFunc(
  id: string, name: string, func: string, time: number[], data: number[],
): VerificationResult {
  if (func.toLowerCase() === 'tau' || func.toLowerCase() === 'exp_rms') {
    return {
      requirementId:   id,
      requirementName: name,
      passed: false,
      message: `${func}(): 63.2% threshold never reached in ${time[time.length - 1].toFixed(2)}s window — ` +
        `extend simulation duration or check state variable (final=${data[data.length - 1].toFixed(4)}).`,
    };
  }
  return {
    requirementId:   id,
    requirementName: name,
    passed: false,
    message: `Unsupported function: '${func}'. Use max, min, final, tau, or exp_rms.`,
  };
}
