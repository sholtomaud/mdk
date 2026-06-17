import { z } from 'zod';
import { getProject, listBlocks, listRelations, getBlock } from '../store/db.js';

export const getModelStateSchema = {
  project_id: z.string().describe('Project ID'),
  block_id:   z.string().optional().describe('If provided, return detail for a single block instead of the full project'),
};

export async function getModelState(args: { project_id: string; block_id?: string }): Promise<string> {
  const project = getProject(args.project_id);
  if (!project) return JSON.stringify({ error: `Project '${args.project_id}' not found` });

  if (args.block_id) {
    const block = getBlock(args.block_id);
    if (!block || block.project_id !== args.project_id) {
      return JSON.stringify({ error: `Block '${args.block_id}' not found in project` });
    }
    return JSON.stringify({
      block_id:    block.id,
      name:        block.name,
      status:      block.status,
      spec:        block.spec,
      model:       block.model_json ? JSON.parse(block.model_json) : null,
      validation:  block.validation_json ? JSON.parse(block.validation_json) : null,
    }, null, 2);
  }

  const blocks = listBlocks(args.project_id);
  const relations = listRelations(args.project_id);

  const summary = {
    total:     blocks.length,
    pending:   blocks.filter(b => b.status === 'pending').length,
    refined:   blocks.filter(b => b.status === 'refined').length,
    validated: blocks.filter(b => b.status === 'validated').length,
    failed:    blocks.filter(b => b.status === 'failed').length,
  };

  return JSON.stringify({
    project_id:  project.id,
    name:        project.name,
    description: project.description,
    status:      project.status,
    summary,
    blocks: blocks.map(b => ({
      id:        b.id,
      name:      b.name,
      parent_id: b.parent_id,
      status:    b.status,
      spec:      b.spec,
    })),
    relations: relations.map(r => ({
      from: r.from_id,
      to:   r.to_id,
      type: r.relation_type,
    })),
    ready_to_assemble: summary.pending === 0 && summary.failed === 0,
  }, null, 2);
}
