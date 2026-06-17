import { DseeAgent, GeminiProvider } from '@mdk/core';
import type { DseeStreamEvent, DseeTools } from '@mdk/core';
import { callMdkTool } from './mcp-client.js';

/* ── Types (kept for backward compat with server.ts) ─────────────── */

export interface ToolCall { name: string; args: Record<string, unknown>; result: string }
export interface ChatResponse { reply: string; toolCalls: ToolCall[] }
export type { DseeStreamEvent as StreamEvent };

/* ── Wire MCP tool functions into DseeTools ──────────────────────── */

function makeTools(): DseeTools {
  return {
    transpileSysml:  (json) => callMdkTool('transpile_sysml', { sysml_json: json }),
    validateModel:   (json) => callMdkTool('validate_model', { model_json: json }),
    runSimulation:   (json, calculus) => callMdkTool('run_simulation', { model_json: json, calculus }),
    generateDiagram: (json) => callMdkTool('generate_diagram', { model_json: json, view: 'all', format: 'mermaid' }),
    generateBom:     (json) => callMdkTool('generate_bom', { model_json: json }),
    computeEmergy:   (json) => callMdkTool('compute_emergy', { model_json: json }),
    verifyRequirements: (modelJson, simJson) => callMdkTool('verify_requirements', { model_json: modelJson, sim_json: simJson }),
  };
}

function makeAgent(): DseeAgent {
  const apiKey = process.env.GEMINI_API_KEY ?? '';
  return new DseeAgent({ llm: new GeminiProvider(apiKey), tools: makeTools() });
}

/* ── Batch chat (backward compat) ────────────────────────────────── */

export async function chat(
  _history: Array<{ role: string; parts: Array<{ text?: string }> }>,
  userMessage: string,
): Promise<ChatResponse> {
  const apiKey = process.env.GEMINI_API_KEY ?? '';
  if (!apiKey) {
    return { reply: 'GEMINI_API_KEY is not set. Please set it in the server environment.', toolCalls: [] };
  }
  const result = await makeAgent().run(userMessage);
  return { reply: result.reply, toolCalls: result.toolCalls };
}

/* ── Streaming chat (SSE) ────────────────────────────────────────── */

export async function* chatStream(
  _history: Array<{ role: string; parts: Array<{ text?: string }> }>,
  userMessage: string,
  socraticAnswers?: string,
  correctionJson?: string,
): AsyncGenerator<DseeStreamEvent> {
  const apiKey = process.env.GEMINI_API_KEY ?? '';
  if (!apiKey) {
    yield { type: 'error', message: 'GEMINI_API_KEY is not set' };
    return;
  }
  yield* makeAgent().stream(userMessage, socraticAnswers, correctionJson);
}
