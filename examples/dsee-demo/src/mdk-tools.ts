/* MDK tool metadata — used for UI display only.
   Orchestration is handled directly in gemini.ts (not via LLM function calling). */

export const MDK_TOOL_DESCRIPTIONS: Record<string, string> = {
  /* ── Single-shot model creation ──────────────────────────────── */
  create_model:    'Gemini responseJsonSchema → SysmlPackage (default), BondGraphModel, or OdumEslModel JSON',

  /* ── Multi-pass hierarchical generation ─────────────────────── */
  create_project:  'Create MDK project with optional block decomposition (SQLite)',
  create_block:    'Add a sub-system block to an existing project',
  refine_block:    'Generate + validate Bond Graph JSON for a pending block',
  list_pending:    'List pending blocks and next refine_block action',
  get_model_state: 'Read project/block state, model JSON, validation results',
  assemble_model:  'Merge all refined blocks into a flat Bond Graph model',

  /* ── Validation & simulation ─────────────────────────────────── */
  validate_model:  'Zod schema check + WASM SCAP causality assignment',
  run_simulation:  'TDC (WASM RK4) or IDC (Giannantoni 2006 log-Euler) simulation',

  /* ── Analysis ────────────────────────────────────────────────── */
  compute_emergy:  'Emergy/transformity analysis for Odum ESL models (Odum 1988)',

  /* ── Transpilers ─────────────────────────────────────────────── */
  transpile_sysml: 'SysmlPackage (PartUsage/PortUsage/FlowConnectionUsage) → flat BondGraphModel',

  /* ── Presentation ────────────────────────────────────────────── */
  generate_diagram:'SysML diagrams (BDD/IBD/PAR/PKG/SEQ/ACT/UC/STM/REQ), Bond Graph topology, and Odum ESL energy circuit → Mermaid / DOT',
  generate_bom:    'Component list matched against vendor catalog',
};
