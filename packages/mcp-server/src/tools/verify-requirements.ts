import { z } from 'zod';
import { verifyRequirement, SysmlPackage, type BgSimulation } from '@mdk/core';

export const verifyRequirementsSchema = {
  model_json: z.string().describe('SysML Package JSON (containing RequirementUsage elements)'),
  sim_json:   z.string().describe('Simulation results JSON (the "simulation" object from run_simulation)'),
};

/**
 * MCP Tool: verify_requirements
 * Deterministically checks a set of SysML requirements against simulation output.
 */
export async function verifyRequirementsTool(args: {
  model_json: string;
  sim_json:   string;
}): Promise<string> {
  let pkg: any;
  let sim: any;

  try {
    pkg = JSON.parse(args.model_json);
    sim = JSON.parse(args.sim_json);
  } catch (e) {
    return JSON.stringify({ error: `Failed to parse input JSON: ${String(e)}` });
  }

  // Validate SysML package
  const zodPkg = SysmlPackage.safeParse(pkg);
  if (!zodPkg.success) {
    return JSON.stringify({ 
      error: "Invalid SysML Package JSON", 
      issues: zodPkg.error.issues 
    });
  }

  // Extract requirements
  const requirements = zodPkg.data.elements.filter(el => el['@type'] === 'RequirementUsage');
  
  if (requirements.length === 0) {
    return JSON.stringify({
      message: "No RequirementUsage elements found in the model.",
      passed: true,
      results: []
    });
  }

  // Verify each requirement
  const results = requirements.map(req => verifyRequirement(req as any, sim as BgSimulation));

  const passed = results.every(r => r.passed);
  const summary = {
    passed,
    metrics: {
      total: results.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
    },
    results,
  };

  return JSON.stringify(summary, null, 2);
}
