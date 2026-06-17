import { 
  InnovationTracker, 
  PopulationManager, 
  FitnessEvaluator, 
  type EvolutionTask 
} from '@mdk/core';

async function main() {
  console.log('Starting MDK NEAT Evolution Demo…');
  
  const tracker = new InnovationTracker();
  const manager = new PopulationManager(20, 0.2, tracker);
  
  // ── Step 1: Define Target ──────────────────────────────────────
  // We want to evolve a system that matches an RC circuit step response.
  // Target: R=10, C=0.01 (Time constant tau = 0.1s)
  // Step response: V_out(t) = V_in * (1 - e^(-t/tau))
  const time: number[] = [];
  const targetData: number[] = [];
  const V_in = 10;
  const tau = 0.1;

  for (let t = 0; t <= 0.5; t += 0.01) {
    time.push(t);
    targetData.push(V_in * (1 - Math.exp(-t / tau)));
  }

  const task: EvolutionTask = {
    targetState: 'q', // We'll look for any state variable (charge)
    targetData,
    time,
    simConfig: { t_start: 0, t_end: 0.5, dt: 0.01, method: 'rk4' }
  };

  const evaluator = new FitnessEvaluator(task);

  // ── Step 2: Seed Population ───────────────────────────────────
  const POP_SIZE = 20;
  manager.seed(POP_SIZE);
  console.log(`Seeded population of ${POP_SIZE} minimal genomes (Se -> R).`);

  // ── Step 3: Evolution Loop ────────────────────────────────────
  for (let gen = 0; gen < 30; gen++) {
    // Evaluate all individuals
    const results = await Promise.all(manager.population.map(async (genome) => {
      const fitness = await evaluator.evaluate(genome);
      return { genome, fitness };
    }));

    // Sort by fitness (descending)
    results.sort((a, b) => b.fitness - a.fitness);
    const best = results[0];

    console.log(`Gen ${gen.toString().padStart(2, ' ')} | Best Fitness: ${best.fitness.toFixed(6)} | Nodes: ${best.genome.nodes.length} | Bonds: ${best.genome.bonds.filter(b => b.enabled).length}`);

    if (best.fitness > 0.999) {
      console.log('\nSUCCESS: Target response matched!');
      break;
    }

    // Breed next generation
    const nextGen: any[] = [];
    
    // Elitism: carry over top 2
    nextGen.push(results[0].genome.clone());
    nextGen.push(results[1].genome.clone());

    while (nextGen.length < POP_SIZE) {
      // Tournament selection (pick 2 from top 5)
      const p1 = results[Math.floor(Math.random() * 5)];
      const p2 = results[Math.floor(Math.random() * 8)];
      
      const child = manager.crossover(p1.genome, p2.genome, p1.fitness, p2.fitness);
      
      // Mutations
      const r = Math.random();
      if (r < 0.5) {
        manager.mutateParameter(child);
      } else if (r < 0.7) {
        manager.mutateAddNode(child, 'C'); // Add energy storage
      } else if (r < 0.8) {
        manager.mutateAddNode(child, 'R'); // Add dissipation
      } else if (r < 0.9) {
        manager.mutateAddBond(child);     // Cross-connect
      }
      
      nextGen.push(child);
    }

    manager.population = nextGen;
  }

  console.log('\nEvolution complete.');
}

main().catch(err => {
  console.error('Evolution failed:', err);
  process.exit(1);
});
