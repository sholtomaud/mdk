import { z } from 'zod';
import { validateBondGraph, BondGraphModel, OdumEslModel, FunctionalModel, odumToBondGraph } from '@mdk/core';
import { type Stage, zodIssues } from './stages.js';

export const validateModelSchema = {
  model_json: z.string().describe('Model Assembly JSON to validate'),
};

export async function validateModel({ model_json }: { model_json: string }): Promise<string> {
  const stages: Stage[] = [];

  /* ── Stage 1: JSON parse ─────────────────────────────────────────── */
  let parsed: unknown;
  try {
    parsed = JSON.parse(model_json);
    stages.push({ name: 'JSON.parse', pass: true });
  } catch (e) {
    stages.push({ name: 'JSON.parse', pass: false, note: String(e) });
    return JSON.stringify({ valid: false, stages });
  }

  const domain = typeof parsed === 'object' && parsed !== null
    ? (parsed as Record<string, unknown>).domain as string | undefined
    : undefined;

  /* ══ FunctionalModel (DACM) path ════════════════════════════════════ */
  if (domain === 'functional') {
    const schemaResult = FunctionalModel.safeParse(parsed);
    stages.push({
      name:   'Zod FunctionalModel',
      pass:   schemaResult.success,
      issues: schemaResult.success ? [] : zodIssues(schemaResult.error),
    });
    const subCount = schemaResult.success ? schemaResult.data.subsystems.length : 0;
    const fnCount  = schemaResult.success
      ? schemaResult.data.subsystems.reduce((acc, s) => acc + s.functions.length, 0)
      : 0;
    if (schemaResult.success) {
      stages.push({
        name: 'FunctionalModel structural check',
        pass: true,
        note: `${subCount} subsystem(s), ${fnCount} function(s)`,
      });
    }
    return JSON.stringify({ valid: schemaResult.success, domain: 'functional', stages }, null, 2);
  }

  const isBg = domain === 'bondgraph';

  if (isBg) {
    /* ── Stage 2: Zod BondGraphModel ─────────────────────────────── */
    const schemaResult = BondGraphModel.safeParse(parsed);
    stages.push({
      name:   'Zod BondGraphModel',
      pass:   schemaResult.success,
      issues: schemaResult.success ? [] : zodIssues(schemaResult.error),
    });
    if (!schemaResult.success) {
      return JSON.stringify({ valid: false, stages });
    }

    /* ── Stage 3: WASM BG causality assignment ───────────────────── */
    let causalityResult: Awaited<ReturnType<typeof validateBondGraph>>;
    try {
      causalityResult = await validateBondGraph(schemaResult.data);
    } catch (e) {
      stages.push({ name: 'WASM BG causality assignment', pass: false, note: String(e) });
      return JSON.stringify({ valid: false, stages });
    }

    const causalOk = causalityResult.causality?.success ?? false;
    const diagnostics = causalityResult.causality?.diagnostics ?? [];
    const issues: Stage['issues'] = diagnostics
      .filter(d => d.status !== 'OK')
      .map(d => ({ path: `bond:${d.bond_id}/element:${d.element_id}`, message: d.message }));

    stages.push({
      name:   'WASM BG causality assignment',
      pass:   causalOk,
      note:   causalOk ? `${causalityResult.causality?.bonds?.length ?? 0} bonds assigned` : undefined,
      issues: issues.length ? issues : [],
    });

    if (!causalOk) {
      return JSON.stringify({ valid: false, domain: 'bondgraph', causality: causalityResult.causality, stages }, null, 2);
    }

    /* ── Stage 4: Post-SCAP semantic checks ──────────────────────────
     * SCAP only detects causal *conflicts* — it does NOT verify that the
     * model is physically meaningful. These checks catch false-positives
     * where causality "passes" on a topologically broken model.
     * ─────────────────────────────────────────────────────────────── */
    const elements  = schemaResult.data.elements;
    const bonds     = schemaResult.data.bonds;
    const semIssues: Stage['issues'] = [];

    // 1. Must have at least one state variable (C or I) to be simulatable
    const hasStateVar = elements.some(e => e.type === 'C' || e.type === 'I');
    if (!hasStateVar) {
      semIssues.push({
        path:    'elements',
        message: 'No state variables (C or I elements) — model has no dynamics to simulate',
      });
    }

    // 2. Every element must participate in at least one bond (no orphans)
    const bondedIds = new Set<number>();
    for (const b of bonds) { bondedIds.add(b.source); bondedIds.add(b.target); }
    for (const el of elements) {
      if (!bondedIds.has(el.id)) {
        semIssues.push({
          path:    `element id:${el.id}`,
          message: `Orphan element '${el.name}' (${el.type}) — not connected to any bond`,
        });
      }
    }

    // 3. J0/J1 junctions must have at least 2 bonds (otherwise they do nothing)
    const bondCountById = new Map<number, number>();
    for (const b of bonds) {
      bondCountById.set(b.source, (bondCountById.get(b.source) ?? 0) + 1);
      bondCountById.set(b.target, (bondCountById.get(b.target) ?? 0) + 1);
    }
    for (const el of elements) {
      if ((el.type === 'J0' || el.type === 'J1') && (bondCountById.get(el.id) ?? 0) < 2) {
        semIssues.push({
          path:    `element id:${el.id}`,
          message: `Junction '${el.name}' (${el.type}) has fewer than 2 bonds — junction is meaningless`,
        });
      }
    }

    const semOk = semIssues.length === 0;
    stages.push({
      name:   'BG semantic check',
      pass:   semOk,
      note:   semOk ? 'State variables present, no orphans, junctions connected' : undefined,
      issues: semIssues.length ? semIssues : [],
    });

    return JSON.stringify({
      valid:     semOk,
      domain:    'bondgraph',
      causality: causalityResult.causality,
      stages,
    }, null, 2);
  }

  /* ══ Odum ESL path ══════════════════════════════════════════════════
   * All domain models transpile to Bond Graph as the base validation
   * layer. Odum ESL → BG transpile → WASM BG causality assignment.
   * ═══════════════════════════════════════════════════════════════════ */

  /* ── Stage 2: Zod OdumEslModel ───────────────────────────────────── */
  const schemaResult = OdumEslModel.safeParse(parsed);
  stages.push({
    name:   'Zod OdumEslModel',
    pass:   schemaResult.success,
    issues: schemaResult.success ? [] : zodIssues(schemaResult.error),
  });
  if (!schemaResult.success) {
    return JSON.stringify({ valid: false, domain: 'odum-esl', stages });
  }

  /* ── Stage 3: Semantic pre-check (interaction/limit need control_node) */
  const nodeIds = new Set(schemaResult.data.nodes.map(n => n.id));
  const semanticIssues: Stage['issues'] = [];
  for (const edge of schemaResult.data.edges ?? []) {
    if (!nodeIds.has(edge.origin))
      semanticIssues.push({ path: `edge.${edge.id ?? edge.origin}`, message: `origin '${edge.origin}' not found in nodes` });
    if (!nodeIds.has(edge.target))
      semanticIssues.push({ path: `edge.${edge.id ?? edge.origin}`, message: `target '${edge.target}' not found in nodes` });
    if ((edge.logic === 'interaction' || edge.logic === 'limit') && !edge.params.control_node)
      semanticIssues.push({ path: `edge.${edge.id ?? edge.origin}.params`, message: `'${edge.logic}' logic requires params.control_node` });
    if (edge.params.control_node && !nodeIds.has(edge.params.control_node))
      semanticIssues.push({ path: `edge.${edge.id ?? edge.origin}.params.control_node`, message: `control_node '${edge.params.control_node}' not found in nodes` });
  }
  stages.push({
    name:   'Semantic pre-check (Odum ESL)',
    pass:   semanticIssues.length === 0,
    issues: semanticIssues.length ? semanticIssues : [],
  });
  if (semanticIssues.length > 0) {
    return JSON.stringify({ valid: false, domain: 'odum-esl', stages });
  }

  /* ── Stage 4: Odum ESL → Bond Graph transpile ────────────────────── */
  let bgModel: ReturnType<typeof odumToBondGraph>;
  try {
    bgModel = odumToBondGraph(schemaResult.data);
    stages.push({
      name: 'Odum ESL → Bond Graph transpile',
      pass: true,
      note: `${bgModel.elements.length} BG elements, ${bgModel.bonds.length} bonds`,
    });
  } catch (e) {
    stages.push({ name: 'Odum ESL → Bond Graph transpile', pass: false, note: String(e) });
    return JSON.stringify({ valid: false, domain: 'odum-esl', stages });
  }

  /* ── Stage 5: WASM BG causality assignment ───────────────────────── */
  const bgParsed = BondGraphModel.safeParse(bgModel);
  if (!bgParsed.success) {
    stages.push({
      name:   'WASM BG causality assignment',
      pass:   false,
      note:   'Transpiled BG failed Zod schema',
      issues: zodIssues(bgParsed.error),
    });
    return JSON.stringify({ valid: false, domain: 'odum-esl', stages });
  }

  let causalityResult: Awaited<ReturnType<typeof validateBondGraph>>;
  try {
    causalityResult = await validateBondGraph(bgParsed.data);
  } catch (e) {
    stages.push({ name: 'WASM BG causality assignment', pass: false, note: String(e) });
    return JSON.stringify({ valid: false, domain: 'odum-esl', stages });
  }

  const causalOk = causalityResult.causality?.success ?? false;
  const diagnostics = causalityResult.causality?.diagnostics ?? [];
  const causalIssues: Stage['issues'] = diagnostics
    .filter(d => d.status !== 'OK')
    .map(d => ({ path: `bond:${d.bond_id}/element:${d.element_id}`, message: d.message }));

  stages.push({
    name:   'WASM BG causality assignment',
    pass:   causalOk,
    note:   causalOk
      ? `${causalityResult.causality?.bonds?.length ?? 0} bonds assigned (via transpiled BG)`
      : undefined,
    issues: causalIssues.length ? causalIssues : [],
  });

  return JSON.stringify({
    valid:          causalOk,
    domain:         'odum-esl',
    causality:      causalityResult.causality,
    transpiled_bg:  bgModel,
    stages,
  }, null, 2);
}
