import { z } from 'zod';
import { getBlock, getProject, updateBlock, logGeneration, getBlockChildren, listBlocks } from '../store/db.js';
import { createModel } from './create-model.js';
import { validateModel } from './validate-model.js';

export const refineBlockSchema = {
  block_id:       z.string().describe('Block ID to refine (from create_block or create_project)'),
  description_override: z.string().optional().describe('Override the block spec with a different description for this pass'),
  evolutionary:         z.boolean().optional().describe('If true, use NEAT evolution to solve requirements instead of single LLM guess'),
  generations:          z.number().optional().default(20).describe('Generations for evolutionary search (default 20)'),
};

export async function refineBlockTool(args: {
  block_id: string;
  description_override?: string;
  evolutionary?: boolean;
  generations?: number;
}): Promise<string> {
  const block = getBlock(args.block_id);
  if (!block) return JSON.stringify({ error: `Block '${args.block_id}' not found` });

  const project = getProject(block.project_id);
  if (!project) return JSON.stringify({ error: 'Project not found' });

  const description = args.description_override ?? block.spec ?? block.name;

  /* ── Step 1: LLM Synthesis (Initial Guess) ────────────────────── */
  const modelResult = await createModel({ description, domain: 'bondgraph' });
  logGeneration(project.id, block.id, 'create_model', { description }, modelResult);
  
  let parsed: any;
  try {
    parsed = JSON.parse(modelResult);
  } catch {
    updateBlock(block.id, { status: 'failed' });
    return JSON.stringify({ error: 'create_model returned invalid JSON', block_id: block.id });
  }

  if (parsed.error) {
    updateBlock(block.id, { status: 'failed' });
    return JSON.stringify({ error: parsed.error, block_id: block.id, stages: parsed.stages });
  }

  let finalModel = parsed.model ?? parsed;

  /* ── Step 2: Evolutionary Refinement (Optional) ────────────────── */
  let evolutionStages: any[] = [];
  if (args.evolutionary) {
    const { PopulationManager, RequirementFitnessEvaluator, genomeToModel } = 
      await import('@mdk/core') as typeof import('@mdk/core');
    
    // We need requirements to evolve. Check if the project model has any.
    // For now, we'll try to find requirements in the block's current model_json (SysML)
    let requirements: any[] = [];
    try {
      if (block.model_json) {
        const sysml = JSON.parse(block.model_json);
        requirements = (sysml.elements ?? []).filter((el: any) => el['@type'] === 'RequirementUsage');
      }
    } catch { /* ignore */ }

    if (requirements.length > 0) {
      const fitness = new RequirementFitnessEvaluator(requirements);
      const population = new PopulationManager(10, 0.2); // Small pop for speed
      
      let bestFitness = 0;
      const maxGenerations = args.generations ?? 20;
      let actualGenerations = 0;

      for (let g = 0; g < maxGenerations; g++) {
        actualGenerations = g + 1;
        await population.evolve(fitness);
        bestFitness = population.bestGenome?.fitness ?? 0;
        if (bestFitness >= 1.0) break; // Perfect score
      }

      if (population.bestGenome) {
        finalModel = genomeToModel(population.bestGenome);
        evolutionStages.push({
          name: 'NEAT Evolution',
          pass: true,
          note: `Evolved ${actualGenerations} generations. Best fitness: ${bestFitness.toFixed(4)}`
        });
      }
    } else {
      evolutionStages.push({
        name: 'NEAT Evolution',
        pass: false,
        note: 'Skipped: No Requirements found in block model_json to guide evolution'
      });
    }
  }

  const modelJson = JSON.stringify(finalModel);

  /* ── Step 3: Validation ────────────────────────────────────────── */
  const validationResult = await validateModel({ model_json: modelJson });
  logGeneration(project.id, block.id, 'validate_model', { model_json: modelJson }, validationResult);

  let validation: { valid?: boolean; stages?: unknown[] };
  try {
    validation = JSON.parse(validationResult);
  } catch {
    validation = { valid: false };
  }

  const status = validation.valid ? 'validated' : 'refined';
  updateBlock(block.id, {
    model_json:      modelJson,
    status,
    validation_json: validationResult,
  });

  /* ── Report pending siblings ─────────────────────────────────────── */
  const allBlocks = listBlocks(project.id);
  const pending = allBlocks.filter(b => b.status === 'pending');

  return JSON.stringify({
    block_id:    block.id,
    name:        block.name,
    status,
    valid:       validation.valid ?? false,
    stages:      [...(parsed.stages ?? []), ...evolutionStages],
    validation:  validation.stages,
    pending_blocks: pending.map(b => ({ id: b.id, name: b.name, spec: b.spec })),
    message: pending.length > 0
      ? `Block refined. ${pending.length} block(s) still pending — call refine_block for each.`
      : `All blocks refined. Call assemble_model with project_id='${project.id}' to build the full model.`,
  }, null, 2);
}
