import { z } from 'zod';
import { OdumEslModel, computeEmergy, emergyBalance } from '@mdk/core';
import type { TransformityInit } from '@mdk/core';
import { zodIssues } from './stages.js';

export const computeEmergySchema = {
  model_json:   z.string().describe('OdumEslModel JSON'),
  sources_json: z.string().optional().describe(
    'JSON array of { nodeId, transformity } — defaults to τ=1 sej/J for every source/constant node',
  ),
  state_json: z.string().optional().describe(
    'JSON object of { nodeId: stockValue } overriding node.value for current-state analysis',
  ),
};

export async function computeEmergyTool({
  model_json,
  sources_json,
  state_json,
}: {
  model_json: string;
  sources_json?: string;
  state_json?: string;
}): Promise<string> {
  /* ── Parse model ──────────────────────────────────────────────── */
  let parsed: unknown;
  try { parsed = JSON.parse(model_json); }
  catch (e) { return JSON.stringify({ error: `JSON parse failed: ${e}` }); }

  const domain = (parsed as any).domain;
  if (domain === 'bondgraph') {
    return JSON.stringify({ 
      error: 'Emergy analysis is currently only supported for Odum ESL models.',
      note: 'The current model is a Bond Graph. You can convert it to Odum ESL or use the Bond Graph solver for power/energy analysis.'
    });
  }

  const r = OdumEslModel.safeParse(parsed);
  if (!r.success) {
    return JSON.stringify({ error: 'Invalid OdumEslModel', issues: zodIssues(r.error) });
  }
  const model = r.data;

  /* ── Parse optional overrides ────────────────────────────────── */
  let sources: TransformityInit[];
  if (sources_json) {
    try { sources = JSON.parse(sources_json) as TransformityInit[]; }
    catch (e) { return JSON.stringify({ error: `sources_json parse failed: ${e}` }); }
  } else {
    sources = model.nodes
      .filter(n => n.type === 'source' || n.type === 'constant')
      .map(n => ({ nodeId: n.id, transformity: 1.0 }));
  }

  let currentState: Record<string, number> = {};
  if (state_json) {
    try { currentState = JSON.parse(state_json) as Record<string, number>; }
    catch (e) { return JSON.stringify({ error: `state_json parse failed: ${e}` }); }
  }

  /* ── Compute ─────────────────────────────────────────────────── */
  const result  = computeEmergy(model, currentState, sources);
  const balance = emergyBalance(model, currentState, sources);

  return JSON.stringify({ ...result, balance }, null, 2);
}
