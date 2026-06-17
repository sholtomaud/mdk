import { NeatGenome, NodeGene, InnovationTracker } from './neat.js';
import { type BgElementType } from '../schema/bondgraph.js';

/**
 * PopulationManager handles structural and parameter mutations, 
 * as well as sexual reproduction (crossover) between genomes.
 */
export class PopulationManager {
  public bestGenome: NeatGenome | null = null;

  constructor(
    public readonly size: number,
    public readonly mutationRate: number = 0.2,
    public readonly tracker: InnovationTracker = new InnovationTracker(),
    public population: NeatGenome[] = []
  ) {
    if (this.population.length === 0) {
      this.seed(size);
    }
  }

  /**
   * Generates an initial minimal population connecting an Se to an R.
   */
  seed(size: number): void {
    this.population = [];
    for (let i = 0; i < size; i++) {
      const genome = new NeatGenome();
      
      const seInno = this.tracker.getInnovation('NODE:Se');
      const rInno  = this.tracker.getInnovation('NODE:R');
      
      genome.nodes.push({ innovation: seInno, type: 'Se', parameter: 10.0 });
      genome.nodes.push({ innovation: rInno, type: 'R', parameter: 1.0 });
      
      genome.bonds.push({
        innovation: this.tracker.getInnovation(`BOND:${seInno}:${rInno}`),
        fromInnovation: seInno,
        toInnovation: rInno,
        enabled: true
      });
      
      this.population.push(genome);
    }
  }

  /**
   * Performs one generation of evolution:
   * 1. Evaluates all individuals using the provided evaluator.
   * 2. Selects the best performing individuals.
   * 3. Creates the next generation via crossover and mutation.
   */
  async evolve(evaluator: { evaluate(g: NeatGenome): Promise<number> }): Promise<void> {
    // 1. Evaluation
    for (const genome of this.population) {
      genome.fitness = await evaluator.evaluate(genome);
    }

    // 2. Sort & Rank
    this.population.sort((a, b) => b.fitness - a.fitness);
    this.bestGenome = this.population[0];

    // 3. Reproduction
    const nextGeneration: NeatGenome[] = [];
    
    // Elitism: always keep the best one
    nextGeneration.push(this.population[0].clone());
    nextGeneration[0].fitness = this.population[0].fitness;

    while (nextGeneration.length < this.size) {
      const p1 = this.tournamentSelection();
      const p2 = this.tournamentSelection();
      
      const child = this.crossover(p1, p2, p1.fitness, p2.fitness);
      
      // Structural mutation
      if (Math.random() < this.mutationRate) {
        const types: BgElementType[] = ['R', 'C', 'I', 'TF', 'GY'];
        const type = types[Math.floor(Math.random() * types.length)];
        this.mutateAddNode(child, type);
      }
      if (Math.random() < this.mutationRate) {
        this.mutateAddBond(child);
      }
      
      // Parameter mutation
      this.mutateParameter(child);
      
      nextGeneration.push(child);
    }

    this.population = nextGeneration;
  }

  private tournamentSelection(k: number = 3): NeatGenome {
    let best: NeatGenome | null = null;
    for (let i = 0; i < k; i++) {
      const ind = this.population[Math.floor(Math.random() * this.population.length)];
      if (!best || ind.fitness > best.fitness) {
        best = ind;
      }
    }
    return best!;
  }

  /**
   * Mutates a genome by inserting a junction and a new element.
   * Splits an existing bond.
   */
  mutateAddNode(genome: NeatGenome, type: BgElementType): void {
    const enabledBonds = genome.bonds.filter(b => b.enabled);
    if (enabledBonds.length === 0) return;
    
    const bond = enabledBonds[Math.floor(Math.random() * enabledBonds.length)];
    bond.enabled = false;

    // Junction type (J0 or J1) - random or heuristic
    const jType = Math.random() > 0.5 ? 'J0' : 'J1';
    const junctionInno = this.tracker.getInnovation(`NODE:${jType}:${bond.fromInnovation}:${bond.toInnovation}`);
    genome.nodes.push({ innovation: junctionInno, type: jType, parameter: 0 });

    const elInno = this.tracker.getInnovation(`NODE:${type}:${junctionInno}`);
    genome.nodes.push({ innovation: elInno, type, parameter: 1.0 });

    // Connections
    genome.bonds.push({
      innovation: this.tracker.getInnovation(`BOND:${bond.fromInnovation}:${junctionInno}`),
      fromInnovation: bond.fromInnovation,
      toInnovation: junctionInno,
      enabled: true
    });
    genome.bonds.push({
      innovation: this.tracker.getInnovation(`BOND:${junctionInno}:${bond.toInnovation}`),
      fromInnovation: junctionInno,
      toInnovation: bond.toInnovation,
      enabled: true
    });
    genome.bonds.push({
      innovation: this.tracker.getInnovation(`BOND:${junctionInno}:${elInno}`),
      fromInnovation: junctionInno,
      toInnovation: elInno,
      enabled: true
    });
  }

  /**
   * Mutates by adding a bond between two existing junctions.
   */
  mutateAddBond(genome: NeatGenome): void {
    const junctions = genome.nodes.filter(n => n.type === 'J0' || n.type === 'J1' || n.type === 'Se' || n.type === 'Sf');
    if (junctions.length < 2) return;

    const from = junctions[Math.floor(Math.random() * junctions.length)];
    const to   = junctions[Math.floor(Math.random() * junctions.length)];
    if (from === to) return;

    const exists = genome.bonds.some(b => 
      (b.fromInnovation === from.innovation && b.toInnovation === to.innovation) ||
      (b.fromInnovation === to.innovation && b.toInnovation === from.innovation)
    );
    if (exists) return;

    genome.bonds.push({
      innovation: this.tracker.getInnovation(`BOND:${from.innovation}:${to.innovation}`),
      fromInnovation: from.innovation,
      toInnovation: to.innovation,
      enabled: true
    });
  }

  /**
   * Tweaks the parameter value of a non-junction element.
   */
  mutateParameter(genome: NeatGenome): void {
    const mutable = genome.nodes.filter(n => n.type !== 'J0' && n.type !== 'J1');
    if (mutable.length === 0) return;
    const node = mutable[Math.floor(Math.random() * mutable.length)];
    // Tweak by log-normal multiplier [0.8, 1.25]
    const multiplier = Math.exp((Math.random() - 0.5) * 0.4); 
    node.parameter *= multiplier;
  }

  /**
   * Combines two parents into a child. 
   * Matching genes are inherited randomly; disjoint/excess genes are inherited from the fitter parent.
   */
  crossover(p1: NeatGenome, p2: NeatGenome, f1: number, f2: number): NeatGenome {
    const child = new NeatGenome();
    const fitter = f1 >= f2 ? p1 : p2;
    const other  = f1 >= f2 ? p2 : p1;

    for (const n1 of fitter.nodes) {
      const n2 = other.nodes.find(n => n.innovation === n1.innovation);
      child.nodes.push(n2 && Math.random() > 0.5 ? { ...n2 } : { ...n1 });
    }

    for (const b1 of fitter.bonds) {
      const b2 = other.bonds.find(b => b.innovation === b1.innovation);
      if (b2) {
        const inherited = Math.random() > 0.5 ? { ...b1 } : { ...b2 };
        if (!b1.enabled || !b2.enabled) {
          if (Math.random() < 0.75) inherited.enabled = false;
        }
        child.bonds.push(inherited);
      } else {
        child.bonds.push({ ...b1 });
      }
    }

    return child;
  }
}
