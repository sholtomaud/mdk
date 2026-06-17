import { type NeatGenome } from './neat.js';
import { type BondGraphModel, type BgElement, type BgBond } from '../schema/bondgraph.js';
import { runKernel } from '../kernel/wasm-bridge.js';

/**
 * Translates a NeatGenome into a BondGraphModel JSON object compatible with the MDK kernel.
 */
export function genomeToModel(genome: NeatGenome): BondGraphModel {
  const elements: BgElement[] = genome.nodes.map(n => ({
    id: n.innovation,
    name: `${n.type}_${n.innovation}`,
    type: n.type,
    parameter: n.parameter,
  }));

  const bonds: BgBond[] = genome.bonds
    .filter(b => b.enabled)
    .map(b => ({
      id: b.innovation,
      type: 'power_bond',
      source: b.fromInnovation,
      target: b.toInnovation,
    }));

  return {
    domain: 'bondgraph',
    schemaVersion: '1.0',
    elements,
    bonds,
  };
}

export interface EvolutionTask {
  targetState: string;   // e.g. "q_C_2" (the state variable of a specific gene)
  targetData: number[];  // time-series of desired values
  time: number[];        // time points
  simConfig: {
    t_start: number;
    t_end: number;
    dt: number;
    method: 'euler' | 'rk4';
  };
}

/**
 * FitnessEvaluator runs the WASM simulation for a genome and scores it based on
 * how closely it matches a target time-series.
 */
export class FitnessEvaluator {
  constructor(public readonly task: EvolutionTask) {}

  async evaluate(genome: NeatGenome): Promise<number> {
    const model = genomeToModel(genome);
    model.config = this.task.simConfig;

    try {
      const parsed = await runKernel(model);
      
      // If simulation failed (e.g. SCAP conflict or instability), fitness is zero
      if (!parsed.success || !parsed.simulation) return 0;

      const sim = parsed.simulation;
      
      // Find the best matching state variable (innovation IDs might change, 
      // so we look for any state variable of the right type if the specific one is missing)
      let actualData: number[] | undefined;
      const stateIdx = sim.state_variables.findIndex((sv: string) => sv.includes(this.task.targetState));
      
      if (stateIdx !== -1) {
        actualData = sim.data[stateIdx];
      } else if (sim.data.length > 0) {
        // Fallback: use first state variable if target name not found
        actualData = sim.data[0];
      }

      if (!actualData) return 0;

      // Calculate MSE
      let mse = 0;
      const steps = Math.min(actualData.length, this.task.targetData.length);
      for (let i = 0; i < steps; i++) {
        const diff = actualData[i] - this.task.targetData[i];
        mse += diff * diff;
      }
      mse /= (steps || 1);

      // Fitness is inverse of error. 
      // We add 1 to prevent division by zero and squash to [0, 1] range.
      return 1 / (1 + mse);
    } catch (e) {
      return 0;
    }
  }
}
