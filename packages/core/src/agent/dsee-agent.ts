import type { LlmProvider } from './llm-provider.js';

const ECOLOGICAL_PATTERN = /\b(soil|water|rainfall|rain|ecolog|ecosystem|evapotranspiration|nutrient|watershed|biome|carbon|nitrogen|biomass|forest|plant|animal|species|population|trophic|solar|sunlight)\b/i;

export interface DseeTools {
  transpileSysml:     (sysmlJson: string) => Promise<string>;
  validateModel:      (modelJson: string) => Promise<string>;
  runSimulation:      (modelJson: string, calculus: 'tdc' | 'idc') => Promise<string>;
  generateDiagram:    (modelJson: string) => Promise<string>;
  generateBom:        (modelJson: string) => Promise<string>;
  computeEmergy?:     (modelJson: string) => Promise<string>;
  verifyRequirements?:(modelJson: string, simJson: string) => Promise<string>;
}

export interface DseeAgentOptions {
  llm:          LlmProvider;
  tools:        DseeTools;
  maxAttempts?: number;
}

export interface DseeAgentResult {
  sysmlJson:     string | null;
  bgJson:        string | null;
  simResult:     string | null;
  idcResult:     string | null;
  diagramResult: string | null;
  bomResult:     string | null;
  verifyResult:  string | null;
  scapAttempts:  number;
  valid:         boolean;
  toolCalls:     Array<{ name: string; args: Record<string, unknown>; result: string }>;
  reply:         string;
}

export type DseeStreamEvent =
  | { type: 'status';   message: string; actor: 'LLM' | 'WASM' | 'MDK' }
  | { type: 'tool';     toolCall: { name: string; args: Record<string, unknown>; result: string } }
  | { type: 'reply';    text: string }
  | { type: 'error';    message: string }
  | { type: 'socratic'; questions: Array<{ element_name: string; parameter: string; unit: string; reason: string }> };

/* ── Helpers ─────────────────────────────────────────────────────── */

function extractBg(transpileResult: string): string | null {
  try {
    const r = JSON.parse(transpileResult) as { bondGraph?: unknown; error?: string };
    if (r.error || !r.bondGraph) return null;
    return JSON.stringify(r.bondGraph);
  } catch { return null; }
}

function extractValidationErrors(validateResult: string): string | null {
  try {
    const r = JSON.parse(validateResult) as Record<string, unknown>;
    const causality = r['causality'] as { success?: boolean; diagnostics?: Array<{ message: string }> } | undefined;
    if (causality?.success === false) {
      return (causality.diagnostics ?? []).map(d => d.message).join('\n');
    }
    if (r['valid'] === false || r['success'] === false) {
      const stages = (r['stages'] ?? []) as Array<{ pass: boolean; name: string; issues?: Array<{ message: string }> }>;
      const failed = stages.filter(s => !s.pass);
      if (failed.length > 0) {
        return failed.map(s => `${s.name}: ${(s.issues ?? []).map(i => i.message).join(', ')}`).join('\n');
      }
      return 'Model validation failed (unknown cause)';
    }
    return null;
  } catch { return null; }
}

/* ── DseeAgent ───────────────────────────────────────────────────── */

export class DseeAgent {
  private maxAttempts: number;

  constructor(private opts: DseeAgentOptions) {
    this.maxAttempts = opts.maxAttempts ?? 3;
  }

  async run(description: string, socraticAnswers?: string): Promise<DseeAgentResult> {
    const toolCalls: DseeAgentResult['toolCalls'] = [];
    const { tools } = this.opts;

    let sysmlJson:  string | null = null;
    let bgJson:     string | null = null;
    let lastValidateResult: string | null = null;
    let attempt = 0;

    /* ── SCAP correction loop ────────────────────────────────────── */
    while (attempt < this.maxAttempts) {
      const generateOpts = attempt === 0 && !socraticAnswers
        ? { description, domain: 'sysml' as const }
        : { description, domain: 'sysml' as const, correction_json: sysmlJson ?? undefined, scap_errors: extractValidationErrors(lastValidateResult ?? '') ?? '', socratic_answers: socraticAnswers };

      let modelJson: string;
      try {
        modelJson = await this.opts.llm.generateModel(generateOpts);
      } catch (e) {
        toolCalls.push({ name: 'create_model', args: generateOpts, result: String(e) });
        break;
      }
      toolCalls.push({ name: 'create_model', args: generateOpts, result: modelJson });

      let sysmlParsed: Record<string, unknown> | null = null;
      try {
        const wrapper = JSON.parse(modelJson) as { model?: unknown; error?: string };
        if (wrapper.error) break;
        sysmlParsed = (wrapper.model !== undefined ? wrapper.model : JSON.parse(modelJson)) as Record<string, unknown>;
        sysmlJson = JSON.stringify(sysmlParsed);
      } catch { break; }

      const transpileResult = await tools.transpileSysml(sysmlJson!).catch(e => JSON.stringify({ error: String(e) }));
      toolCalls.push({ name: 'transpile_sysml', args: {}, result: transpileResult });

      const extracted = extractBg(transpileResult);
      if (!extracted) {
        attempt++;
        lastValidateResult = JSON.stringify({ causality: { success: false, diagnostics: [{ message: `Transpile failed: ${transpileResult.slice(0, 300)}` }] } });
        continue;
      }
      bgJson = extracted;

      const validateResult = await tools.validateModel(bgJson).catch(e => JSON.stringify({ error: String(e) }));
      toolCalls.push({ name: 'validate_model', args: {}, result: validateResult });
      lastValidateResult = validateResult;

      if (!extractValidationErrors(validateResult)) break;
      attempt++;
    }

    if (!bgJson) {
      return {
        sysmlJson, bgJson: null, simResult: null, idcResult: null,
        diagramResult: null, bomResult: null, verifyResult: null,
        scapAttempts: attempt + 1, valid: false, toolCalls,
        reply: sysmlJson
          ? 'SysML generated but transpile/SCAP failed after max attempts.'
          : 'Model creation failed.',
      };
    }

    /* ── Simulate ────────────────────────────────────────────────── */
    const [simResult, idcResult] = await Promise.all([
      tools.runSimulation(bgJson, 'tdc').catch(e => JSON.stringify({ error: String(e) })),
      tools.runSimulation(bgJson, 'idc').catch(e => JSON.stringify({ error: String(e) })),
    ]);
    toolCalls.push({ name: 'run_simulation (tdc)', args: { calculus: 'tdc' }, result: simResult });
    toolCalls.push({ name: 'run_simulation (idc)', args: { calculus: 'idc' }, result: idcResult });

    /* ── Diagrams ────────────────────────────────────────────────── */
    const diagramResult = await tools.generateDiagram(sysmlJson ?? bgJson).catch(e => `Error: ${e}`);
    toolCalls.push({ name: 'generate_diagram', args: {}, result: diagramResult });

    /* ── BOM ─────────────────────────────────────────────────────── */
    const bomResult = await tools.generateBom(bgJson).catch(e => JSON.stringify({ error: String(e) }));
    toolCalls.push({ name: 'generate_bom', args: {}, result: bomResult });

    /* ── Emergy (ecological only) ────────────────────────────────── */
    if (ECOLOGICAL_PATTERN.test(description) && tools.computeEmergy) {
      const emergyResult = await tools.computeEmergy(bgJson).catch(e => JSON.stringify({ error: String(e) }));
      toolCalls.push({ name: 'compute_emergy', args: {}, result: emergyResult });
    }

    /* ── Requirements verification ───────────────────────────────── */
    let verifyResult: string | null = null;
    if (tools.verifyRequirements && sysmlJson) {
      try {
        const simData = JSON.parse(simResult) as { simulation?: unknown };
        if (simData.simulation) {
          verifyResult = await tools.verifyRequirements(sysmlJson, JSON.stringify(simData.simulation));
          toolCalls.push({ name: 'verify_requirements', args: {}, result: verifyResult });
        }
      } catch { /* skip */ }
    }

    /* ── Explanation ─────────────────────────────────────────────── */
    const reply = await this.opts.llm.explain({
      userMessage: description,
      validationResult: lastValidateResult ?? '',
      simResult,
      verifyResult: verifyResult ?? undefined,
    }).catch(() => 'SysML → Bond Graph model generated.');

    return {
      sysmlJson, bgJson, simResult, idcResult, diagramResult, bomResult, verifyResult,
      scapAttempts: attempt + 1,
      valid: true,
      toolCalls,
      reply,
    };
  }

  async *stream(
    description:    string,
    socraticAnswers?: string,
    correctionJson?:  string,
  ): AsyncGenerator<DseeStreamEvent> {
    const { tools } = this.opts;

    let sysmlJson:  string | null = correctionJson ?? null;
    let bgJson:     string | null = null;
    let lastValidateResult: string | null = null;
    let attempt = 0;

    /* ── SCAP correction loop ────────────────────────────────────── */
    while (attempt < this.maxAttempts) {
      yield {
        type: 'status',
        message: attempt > 0
          ? `SCAP failed — correcting model (attempt ${attempt + 1}/${this.maxAttempts})…`
          : 'Generating SysML model…',
        actor: 'LLM',
      };

      const generateOpts = attempt === 0 && !socraticAnswers
        ? { description, domain: 'sysml' as const }
        : { description, domain: 'sysml' as const, correction_json: sysmlJson ?? undefined, scap_errors: extractValidationErrors(lastValidateResult ?? '') ?? '', socratic_answers: socraticAnswers };

      let modelJson: string;
      try {
        modelJson = await this.opts.llm.generateModel(generateOpts);
      } catch (e) {
        yield { type: 'tool', toolCall: { name: 'create_model', args: generateOpts, result: String(e) } };
        yield { type: 'error', message: `create_model failed: ${e}` };
        return;
      }
      yield { type: 'tool', toolCall: { name: 'create_model', args: generateOpts, result: modelJson } };

      let sysmlParsed: Record<string, unknown> | null = null;
      try {
        const wrapper = JSON.parse(modelJson) as { model?: unknown; error?: string; missing_parameters?: Array<{ element_name: string; parameter: string; unit: string; reason: string }> };
        if (wrapper.error) break;

        if (wrapper.missing_parameters?.length && !socraticAnswers) {
          yield { type: 'socratic', questions: wrapper.missing_parameters };
          return;
        }

        sysmlParsed = (wrapper.model !== undefined ? wrapper.model : JSON.parse(modelJson)) as Record<string, unknown>;
        sysmlJson = JSON.stringify(sysmlParsed);
      } catch { break; }

      yield { type: 'status', message: 'Transpiling SysML → Bond Graph…', actor: 'MDK' };
      const transpileResult = await tools.transpileSysml(sysmlJson!).catch(e => JSON.stringify({ error: String(e) }));
      yield { type: 'tool', toolCall: { name: 'transpile_sysml', args: {}, result: transpileResult } };

      const extracted = extractBg(transpileResult);
      if (!extracted) {
        attempt++;
        lastValidateResult = JSON.stringify({ causality: { success: false, diagnostics: [{ message: `Transpile failed: ${transpileResult.slice(0, 300)}` }] } });
        continue;
      }
      bgJson = extracted;

      yield { type: 'status', message: 'Running SCAP causality check…', actor: 'WASM' };
      const validateResult = await tools.validateModel(bgJson).catch(e => JSON.stringify({ error: String(e) }));
      yield { type: 'tool', toolCall: { name: 'validate_model', args: {}, result: validateResult } };
      lastValidateResult = validateResult;

      if (!extractValidationErrors(validateResult)) break;
      attempt++;
    }

    if (!bgJson) {
      yield { type: 'error', message: sysmlJson ? 'SysML generated but transpile/SCAP failed after max attempts.' : 'Model creation failed.' };
      return;
    }

    /* ── Simulate ────────────────────────────────────────────────── */
    yield { type: 'status', message: 'Simulating (TDC + IDC in parallel)…', actor: 'WASM' };
    const [simResult, idcResult] = await Promise.all([
      tools.runSimulation(bgJson, 'tdc').catch(e => JSON.stringify({ error: String(e) })),
      tools.runSimulation(bgJson, 'idc').catch(e => JSON.stringify({ error: String(e) })),
    ]);
    yield { type: 'tool', toolCall: { name: 'run_simulation (tdc)', args: { calculus: 'tdc' }, result: simResult } };
    yield { type: 'tool', toolCall: { name: 'run_simulation (idc)', args: { calculus: 'idc' }, result: idcResult } };

    /* ── Diagrams ────────────────────────────────────────────────── */
    yield { type: 'status', message: 'Generating diagrams…', actor: 'MDK' };
    const diagramResult = await tools.generateDiagram(sysmlJson ?? bgJson).catch(e => `Error: ${e}`);
    yield { type: 'tool', toolCall: { name: 'generate_diagram', args: {}, result: diagramResult } };

    /* ── BOM ─────────────────────────────────────────────────────── */
    yield { type: 'status', message: 'Generating Bill of Materials…', actor: 'MDK' };
    const bomResult = await tools.generateBom(bgJson).catch(e => JSON.stringify({ error: String(e) }));
    yield { type: 'tool', toolCall: { name: 'generate_bom', args: {}, result: bomResult } };

    /* ── Emergy ──────────────────────────────────────────────────── */
    if (ECOLOGICAL_PATTERN.test(description) && tools.computeEmergy) {
      yield { type: 'status', message: 'Computing emergy analysis…', actor: 'MDK' };
      const emergyResult = await tools.computeEmergy(bgJson).catch(e => JSON.stringify({ error: String(e) }));
      yield { type: 'tool', toolCall: { name: 'compute_emergy', args: {}, result: emergyResult } };
    }

    /* ── Requirements ────────────────────────────────────────────── */
    if (tools.verifyRequirements && sysmlJson) {
      yield { type: 'status', message: 'Verifying requirements…', actor: 'MDK' };
      try {
        const simData = JSON.parse(simResult) as { simulation?: unknown };
        if (simData.simulation) {
          const verifyResult = await tools.verifyRequirements(sysmlJson, JSON.stringify(simData.simulation));
          yield { type: 'tool', toolCall: { name: 'verify_requirements', args: {}, result: verifyResult } };
        }
      } catch { /* skip */ }
    }

    /* ── Explanation ─────────────────────────────────────────────── */
    yield { type: 'status', message: 'Generating explanation…', actor: 'LLM' };
    const replyText = await this.opts.llm.explain({
      userMessage: description,
      validationResult: lastValidateResult ?? '',
      simResult,
    }).catch(() => 'SysML → Bond Graph model generated.');
    yield { type: 'reply', text: replyText };
  }
}
