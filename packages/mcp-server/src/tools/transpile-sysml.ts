import { z } from 'zod';
import { SysmlPackage, sysmlToBondGraph } from '@mdk/core';
import { zodIssues } from './stages.js';

export const transpileSysmlSchema = {
  sysml_json: z.string().describe('SysmlPackage JSON — PartUsage, PortUsage, FlowConnectionUsage elements'),
};

export async function transpileSysml({ sysml_json }: { sysml_json: string }): Promise<string> {
  /* ── Parse ───────────────────────────────────────────────────── */
  let parsed: unknown;
  try { parsed = JSON.parse(sysml_json); }
  catch (e) { return JSON.stringify({ error: `JSON parse failed: ${e}` }); }

  const r = SysmlPackage.safeParse(parsed);
  if (!r.success) {
    return JSON.stringify({ error: 'Invalid SysmlPackage', issues: zodIssues(r.error) });
  }

  /* ── Transpile ───────────────────────────────────────────────── */
  let bondGraph: ReturnType<typeof sysmlToBondGraph>;
  try {
    bondGraph = sysmlToBondGraph(r.data);
  } catch (e) {
    return JSON.stringify({ error: `Transpilation failed: ${e}` });
  }

  return JSON.stringify({
    bondGraph,
    element_count: bondGraph.elements.length,
    bond_count:    bondGraph.bonds.length,
    note: 'Pass bondGraph to validate_model and run_simulation',
  }, null, 2);
}
