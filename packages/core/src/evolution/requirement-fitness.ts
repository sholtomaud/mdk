import { type NeatGenome } from './neat.js';
import { genomeToModel } from './fitness.js';
import { runKernel } from '../kernel/wasm-bridge.js';
import { verifyRequirement } from '../verification/evaluator.js';
import { type RequirementUsage } from '../schema/sysml.js';

/**
 * RequirementFitnessEvaluator scores genomes based on how many SysML requirements they satisfy.
 * This enables "Evolution-based Refinement" (T13.3), where the system evolves a topology
 * specifically to meet formal engineering constraints.
 */
export class RequirementFitnessEvaluator {
  /**
   * @param requirements List of SysML requirements to satisfy
   * @param simConfig Standard simulation configuration for evaluation
   */
  constructor(
    public readonly requirements: RequirementUsage[],
    public readonly simConfig = { t_start: 0, t_end: 10, dt: 0.1, method: 'rk4' as const }
  ) {}

  async evaluate(genome: NeatGenome): Promise<number> {
    if (this.requirements.length === 0) return 0.5; // Neutral fitness if no requirements

    const model = genomeToModel(genome);
    model.config = this.simConfig;

    try {
      const parsed = await runKernel(model);
      
      // If simulation fails (SCAP error, etc.), fitness is zero
      if (!parsed.success || !parsed.simulation) return 0;

      const sim = parsed.simulation;
      let passCount = 0;
      
      // Score based on passed requirements
      for (const req of this.requirements) {
        const result = verifyRequirement(req, sim);
        if (result.passed) passCount++;
      }

      const score = passCount / this.requirements.length;

      // Parsimony bonus: prefer smaller models for same performance
      const complexity = (genome.nodes.length + genome.bonds.filter(b => b.enabled).length);
      const parsimony = 0.01 / (1 + complexity);

      return score + parsimony;
    } catch (e) {
      // Numerical instability or other simulation errors yield zero fitness
      return 0;
    }
  }
}
