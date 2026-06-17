import { type RequirementUsage } from '../schema/sysml.js';
import { type BgSimulation } from '../kernel/wasm-bridge.js';

export interface VerificationResult {
  requirementId: string;
  requirementName: string;
  passed: boolean;
  actualValue?: number;
  message: string;
}

/**
 * Verifies a SysML requirement against Bond Graph simulation data.
 * 
 * Supports a simple DSL for constraints:
 *   func(state) op threshold
 * 
 * Functions: max, min, final
 * Operators: <, <=, >, >=, ==
 * Example: "max(q) < 0.5"
 */
export function verifyRequirement(req: RequirementUsage, sim: BgSimulation): VerificationResult {
  const constraint = req.constraint;
  if (!constraint) {
    return {
      requirementId: req['@id'],
      requirementName: req.name,
      passed: true,
      message: "No quantitative constraint defined for automated verification."
    };
  }

  // Regex for func(state) op threshold
  // Matches: max(q) < 0.5, final(p_I_1) >= 10.2, etc.
  const regex = /^(\w+)\(([^)]+)\)\s*([<>=!]+)\s*([\d.-]+)$/;
  const match = constraint.trim().match(regex);
  
  if (!match) {
    return {
      requirementId: req['@id'],
      requirementName: req.name,
      passed: false,
      message: `Invalid constraint format: "${constraint}". Expected "func(state) op value".`
    };
  }

  const [, func, stateName, op, thresholdStr] = match;
  const threshold = parseFloat(thresholdStr);

  // Find the matching state variable (using partial match to allow for kernel-prefixed names)
  const stateIdx = sim.state_variables.findIndex(sv => sv.includes(stateName));
  if (stateIdx === -1) {
    return {
      requirementId: req['@id'],
      requirementName: req.name,
      passed: false,
      message: `Target state variable '${stateName}' not found in simulation variables: [${sim.state_variables.join(', ')}]`
    };
  }

  const data = sim.data[stateIdx];
  if (!data || data.length === 0) {
    return {
      requirementId: req['@id'],
      requirementName: req.name,
      passed: false,
      message: `No simulation data available for state variable '${stateName}'.`
    };
  }

  let actualValue: number;

  switch (func.toLowerCase()) {
    case 'max':
      actualValue = Math.max(...data);
      break;
    case 'min':
      actualValue = Math.min(...data);
      break;
    case 'final':
      actualValue = data[data.length - 1];
      break;
    default:
      return {
        requirementId: req['@id'],
        requirementName: req.name,
        passed: false,
        message: `Unsupported verification function: '${func}'. Use max(), min(), or final().`
      };
  }

  let passed = false;
  switch (op) {
    case '<':   passed = actualValue < threshold; break;
    case '<=':  passed = actualValue <= threshold; break;
    case '>':   passed = actualValue > threshold; break;
    case '>=':  passed = actualValue >= threshold; break;
    case '==':  passed = Math.abs(actualValue - threshold) < 1e-6; break;
    default:
      return {
        requirementId: req['@id'],
        requirementName: req.name,
        passed: false,
        message: `Unsupported operator: '${op}'. Use <, <=, >, >=, or ==.`
      };
  }

  return {
    requirementId: req['@id'],
    requirementName: req.name,
    passed,
    actualValue,
    message: passed 
      ? `PASS: ${func}(${stateName}) [${actualValue.toFixed(4)}] ${op} ${threshold}`
      : `FAIL: ${func}(${stateName}) [${actualValue.toFixed(4)}] is not ${op} ${threshold}`
  };
}
