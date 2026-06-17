import { z } from 'zod';
import { getProject, listPendingBlocks, listBlocks } from '../store/db.js';

export const listPendingSchema = {
  project_id: z.string().describe('Project ID'),
};

export async function listPending(args: { project_id: string }): Promise<string> {
  const project = getProject(args.project_id);
  if (!project) return JSON.stringify({ error: `Project '${args.project_id}' not found` });

  const pending = listPendingBlocks(args.project_id);
  const all = listBlocks(args.project_id);

  return JSON.stringify({
    project_id:    project.id,
    pending_count: pending.length,
    total_blocks:  all.length,
    pending_blocks: pending.map(b => ({
      block_id: b.id,
      name:     b.name,
      spec:     b.spec,
      parent_id: b.parent_id,
    })),
    next_action: pending.length > 0
      ? `Call refine_block with block_id='${pending[0].id}' to refine '${pending[0].name}'`
      : `All blocks refined — call assemble_model with project_id='${project.id}'`,
  }, null, 2);
}
