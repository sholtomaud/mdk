import { z } from 'zod';
import { createBlock, getProject, getBlock, listBlocks } from '../store/db.js';

export const createBlockSchema = {
  project_id:  z.string().describe('Project ID returned by create_project'),
  name:        z.string().describe('Block name (e.g. "Sales", "CapitalReserves")'),
  spec:        z.string().describe('Plain-English specification of this block — what it models, what flows in/out'),
  parent_id:   z.string().optional().describe('Parent block ID (omit for top-level block)'),
};

export async function createBlockTool(args: {
  project_id: string;
  name: string;
  spec: string;
  parent_id?: string;
}): Promise<string> {
  const project = getProject(args.project_id);
  if (!project) {
    return JSON.stringify({ error: `Project '${args.project_id}' not found` });
  }

  if (args.parent_id) {
    const parent = getBlock(args.parent_id);
    if (!parent || parent.project_id !== args.project_id) {
      return JSON.stringify({ error: `Parent block '${args.parent_id}' not found in this project` });
    }
  }

  const block = createBlock(args.project_id, args.name, args.spec, args.parent_id ?? null);
  const allBlocks = listBlocks(args.project_id);
  const pending = allBlocks.filter(b => b.status === 'pending').length;

  return JSON.stringify({
    block_id:   block.id,
    name:       block.name,
    status:     block.status,
    project_id: block.project_id,
    parent_id:  block.parent_id,
    pending_in_project: pending,
    message: `Block created. Use refine_block with block_id='${block.id}' to generate its Bond Graph model JSON.`,
  }, null, 2);
}
