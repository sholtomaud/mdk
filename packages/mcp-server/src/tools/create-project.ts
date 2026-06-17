import { z } from 'zod';
import { createProject, createBlock } from '../store/db.js';

export const createProjectSchema = {
  name:        z.string().describe('Short name for the project (e.g. "small-business")'),
  description: z.string().describe('Plain-English description of the system to model'),
  blocks:      z.array(z.object({
    name: z.string(),
    spec: z.string().describe('Plain-English specification of this block'),
    parent_name: z.string().optional().describe('Name of the parent block (omit for top-level)'),
  })).optional().describe('Initial block decomposition (optional — can be added later with create_block)'),
};

export async function createProjectTool(args: {
  name: string;
  description: string;
  blocks?: Array<{ name: string; spec: string; parent_name?: string }>;
}): Promise<string> {
  const project = createProject(args.name, args.description);

  const nameToId = new Map<string, string>();
  const createdBlocks = [];

  for (const b of args.blocks ?? []) {
    const parentId = b.parent_name ? (nameToId.get(b.parent_name) ?? null) : null;
    const block = createBlock(project.id, b.name, b.spec, parentId);
    nameToId.set(b.name, block.id);
    createdBlocks.push({ id: block.id, name: block.name, status: block.status, parent_id: block.parent_id });
  }

  return JSON.stringify({
    project_id: project.id,
    name:       project.name,
    status:     project.status,
    blocks:     createdBlocks,
    pending:    createdBlocks.filter(b => b.status === 'pending').length,
    message:    createdBlocks.length > 0
      ? `Project created with ${createdBlocks.length} block(s). Use refine_block to generate model JSON for each pending block.`
      : `Project created. Use create_block to add blocks, then refine_block to generate model JSON.`,
  }, null, 2);
}
