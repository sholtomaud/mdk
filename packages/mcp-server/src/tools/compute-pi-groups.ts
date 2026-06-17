import { z } from 'zod';
import { FunctionalModel } from '@mdk/core';
import { computePiGroups, computePiGroupsFromModel } from '@mdk/core';

export const computePiGroupsSchema = {
  model_json: z.string().describe(
    'FunctionalModel JSON (domain: "functional") with variables that have siDimensions populated',
  ),
  subsystem_id: z.string().optional().describe(
    'Analyse only this subsystem id (default: all subsystems + systemVariables)',
  ),
  variables_json: z.string().optional().describe(
    'Alternative: JSON array of DacmVariable objects to analyse directly (skips FunctionalModel parsing)',
  ),
};

export async function computePiGroupsTool({
  model_json,
  subsystem_id,
  variables_json,
}: {
  model_json: string;
  subsystem_id?: string;
  variables_json?: string;
}): Promise<string> {

  /* ── Option A: raw variable array ────────────────────────────────── */
  if (variables_json) {
    let vars: unknown;
    try { vars = JSON.parse(variables_json); }
    catch { return JSON.stringify({ error: 'variables_json is not valid JSON' }); }

    if (!Array.isArray(vars)) {
      return JSON.stringify({ error: 'variables_json must be a JSON array' });
    }

    const result = computePiGroups(vars as Parameters<typeof computePiGroups>[0]);
    return JSON.stringify({ success: true, ...result, llm_hint: buildLlmHint(result) });
  }

  /* ── Option B: full FunctionalModel ──────────────────────────────── */
  let parsed: unknown;
  try { parsed = JSON.parse(model_json); }
  catch { return JSON.stringify({ error: 'model_json is not valid JSON' }); }

  const modelResult = FunctionalModel.safeParse(parsed);
  if (!modelResult.success) {
    return JSON.stringify({
      error: 'model_json is not a valid FunctionalModel',
      issues: modelResult.error.issues.map(i => i.message),
    });
  }

  const result = computePiGroupsFromModel(modelResult.data, subsystem_id);

  return JSON.stringify({
    success: true,
    subsystem_id: subsystem_id ?? null,
    model_name: modelResult.data.name,
    ...result,
    llm_hint: buildLlmHint(result),
  });
}

/* ── LLM hint generation ─────────────────────────────────────────────
 * Produces a natural-language description of the π-groups that can be
 * included in a subsequent LLM prompt to generate PowerLaw entries.
 * ─────────────────────────────────────────────────────────────────── */

function buildLlmHint(result: ReturnType<typeof computePiGroups>): string {
  if (result.piGroups.length === 0) {
    return 'No π-groups found — ensure variables have siDimensions populated.';
  }

  const lines = [
    `Dimensional analysis found ${result.piGroups.length} π-group(s) from ${result.inputVariables.length} variables (rank = ${result.rank}).`,
    `Each π-group is dimensionless; physical relationships should be expressible as power laws in these groups:`,
    ...result.piGroups.map(g => `  ${g.id}: ${g.formula}`),
    ``,
    `To complete the PowerLaw schema: for each function's dependent variable, choose the most physically plausible π-group and set:`,
    `  piConstant: <C>  (e.g. 0.5, 0.593, 1/2π — derived from physics or LLM domain knowledge)`,
    `  exponents: { <variableId>: <exponent>, ... }  (use the π-group exponents above as a guide)`,
    `  physicalPhenomenon: <name>  (e.g. "viscous drag", "Betz limit", "RC time constant")`,
  ];

  return lines.join('\n');
}
