import { z } from 'zod';
import { getProject, listBlocks, updateBlock, logGeneration } from '../store/db.js';

export const assembleModelSchema = {
  project_id: z.string().describe('Project ID'),
};

/* Minimal BG structural types — only what we need to merge */
interface BgElement { id: number; name: string; type: string; parameter?: number }
interface BgBond    { id: number; source: number; target: number; type: string }
interface BgModel   {
  elements: BgElement[];
  bonds: BgBond[];
  initial_state?: Record<string, number>;
  [key: string]: unknown;
}

export async function assembleModel(args: { project_id: string }): Promise<string> {
  const project = getProject(args.project_id);
  if (!project) return JSON.stringify({ error: `Project '${args.project_id}' not found` });

  const blocks = listBlocks(args.project_id);
  const unready = blocks.filter(b => b.status === 'pending' || b.status === 'failed');
  if (unready.length > 0) {
    return JSON.stringify({
      error: 'Cannot assemble — some blocks are not yet refined',
      unready: unready.map(b => ({ id: b.id, name: b.name, status: b.status })),
    }, null, 2);
  }

  const assembled: BgModel = { elements: [], bonds: [], initial_state: {} };
  let nextId = 1;

  /* Per-block: remap all element/bond IDs into a global namespace */
  for (const block of blocks) {
    if (!block.model_json) continue;

    let blockModel: BgModel;
    try {
      const raw = JSON.parse(block.model_json);
      blockModel = (raw.model ?? raw) as BgModel;
    } catch {
      return JSON.stringify({ error: `Block '${block.name}' has invalid model JSON` });
    }

    if (!Array.isArray(blockModel.elements) || !Array.isArray(blockModel.bonds)) continue;

    /* Build a local-to-global ID map for this block */
    const idMap = new Map<number, number>();
    for (const el of blockModel.elements) {
      idMap.set(el.id, nextId);
      assembled.elements.push({
        id:        nextId++,
        name:      `${block.name}__${el.name}`,
        type:      el.type,
        parameter: el.parameter,
      });
    }
    for (const bond of blockModel.bonds) {
      const src = idMap.get(bond.source);
      const tgt = idMap.get(bond.target);
      if (src === undefined || tgt === undefined) continue;
      assembled.bonds.push({ id: nextId++, source: src, target: tgt, type: bond.type });
    }

    /* Merge initial_state with namespaced keys */
    if (blockModel.initial_state) {
      for (const [k, v] of Object.entries(blockModel.initial_state)) {
        assembled.initial_state![`${block.name}__${k}`] = v as number;
      }
    }
  }

  if (assembled.elements.length === 0) {
    return JSON.stringify({ error: 'No elements found — ensure blocks have been refined before assembling' });
  }

  const assembledJson = JSON.stringify(assembled);

  /* Store on project as assembled model (reuse first block slot as project-level record) */
  logGeneration(project.id, null, 'assemble_model', { project_id: args.project_id }, assembledJson);

  return JSON.stringify({
    project_id:     project.id,
    name:           project.name,
    blocks_merged:  blocks.filter(b => b.model_json).length,
    element_count:  assembled.elements.length,
    bond_count:     assembled.bonds.length,
    model:          assembled,
    next_action:    `Call validate_model with the model JSON, or run_simulation to simulate the full system`,
  }, null, 2);
}
