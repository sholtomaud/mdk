import { describe, it, expect } from 'vitest';
import { verifyRequirement } from '../verification/evaluator.js';
import { RequirementUsage } from '../schema/sysml.js';
import { type BgSimulation } from '../kernel/wasm-bridge.js';

describe('RequirementEvaluator', () => {
  const mockSim: BgSimulation = {
    state_variables: ['q_C_1', 'p_I_2'],
    data: [
      [0, 0.1, 0.2, 0.3, 0.2], // q_C_1
      [0, 5, 10, 8, 7]         // p_I_2
    ],
    time: [0, 1, 2, 3, 4]
  };

  it('verifies max constraint (PASS)', () => {
    const req = RequirementUsage.parse({
      '@id': 'req1',
      '@type': 'RequirementUsage',
      name: 'Max Charge',
      constraint: 'max(q_C_1) < 0.5'
    });
    const result = verifyRequirement(req as any, mockSim);
    expect(result.passed).toBe(true);
    expect(result.actualValue).toBe(0.3);
    expect(result.message).toContain('PASS');
  });

  it('verifies max constraint (FAIL)', () => {
    const req = RequirementUsage.parse({
      '@id': 'req2',
      '@type': 'RequirementUsage',
      name: 'Max Charge Fail',
      constraint: 'max(q_C_1) < 0.2'
    });
    const result = verifyRequirement(req as any, mockSim);
    expect(result.passed).toBe(false);
    expect(result.actualValue).toBe(0.3);
    expect(result.message).toContain('FAIL');
  });

  it('verifies final constraint', () => {
    const req = RequirementUsage.parse({
      '@id': 'req3',
      '@type': 'RequirementUsage',
      name: 'Final Momentum',
      constraint: 'final(p_I_2) == 7'
    });
    const result = verifyRequirement(req as any, mockSim);
    expect(result.passed).toBe(true);
    expect(result.actualValue).toBe(7);
  });

  it('handles missing state variables', () => {
    const req = RequirementUsage.parse({
      '@id': 'req4',
      '@type': 'RequirementUsage',
      name: 'Missing State',
      constraint: 'max(velocity) < 10'
    });
    const result = verifyRequirement(req as any, mockSim);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('handles invalid constraint format', () => {
    const req = RequirementUsage.parse({
      '@id': 'req5',
      '@type': 'RequirementUsage',
      name: 'Bad Format',
      constraint: 'invalid string'
    });
    const result = verifyRequirement(req as any, mockSim);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('Invalid constraint format');
  });

  it('returns neutral pass if no constraint defined', () => {
    const req = RequirementUsage.parse({
      '@id': 'req6',
      '@type': 'RequirementUsage',
      name: 'No Constraint'
    });
    const result = verifyRequirement(req as any, mockSim);
    expect(result.passed).toBe(true);
    expect(result.message).toContain('No quantitative constraint');
  });
});
