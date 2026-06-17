/**
 * DSEE snapshot tests (T5.6 extension)
 *
 * Tests the full DSEE pipeline using MockLlmProvider — no real LLM calls.
 * Assertions are structural (property-based), not exact-content snapshots,
 * because LLM output is non-deterministic by nature.
 *
 * The mock injects a pre-canned SysML Package JSON that describes a simple
 * S3 + CloudFront static website. The deterministic pipeline steps
 * (transpile_sysml → validate_model → run_simulation) are called for real.
 *
 * Contract: if all three attempts fail SCAP, the test fails and the
 * LLM→BG translation path needs investigation.
 */

import { describe, it, expect } from 'vitest';
import { DseeAgent, MockLlmProvider } from '@mdk/core';
import type { DseeTools } from '@mdk/core';
import { transpileSysml }       from '../tools/transpile-sysml.js';
import { validateModel }        from '../tools/validate-model.js';
import { runSimulation }        from '../tools/run-simulation.js';
import { generateDiagram }      from '../tools/generate-diagram.js';
import { generateBom }          from '../tools/generate-bom.js';
import { verifyRequirementsTool } from '../tools/verify-requirements.js';

/* ── Pre-canned SysML for S3 + CloudFront website ─────────────────── */

const STATIC_WEBSITE_SYSML = JSON.stringify({
  '@type': 'Package',
  '@id':   'pkg-static-website',
  name:    'StaticWebsiteSystem',
  elements: [
    {
      '@type': 'RequirementUsage',
      '@id':   'req-01',
      name:    'REQ-01',
      text:    'System shall serve HTML content over HTTPS with latency < 100ms',
    },
    {
      '@type': 'RequirementUsage',
      '@id':   'req-02',
      name:    'REQ-02',
      text:    'Content shall be delivered globally via CloudFront CDN',
    },
    /* Se source: models HTTP request traffic entering the system */
    {
      '@type': 'PartUsage',
      '@id':   'part-user',
      name:    'UserRequest',
      ownedFeature: [{ '@id': 'port-user-out' }],
      bgMapping: { elementType: 'Se', parameter: 1.0 },
    },
    { '@type': 'PortUsage', '@id': 'port-user-out', name: 'requestPort' },
    /* R element: CloudFront latency/cache resistance */
    {
      '@type': 'PartUsage',
      '@id':   'part-cf',
      name:    'CloudFrontDistribution',
      ownedFeature: [{ '@id': 'port-cf-in' }, { '@id': 'port-cf-out' }],
      bgMapping: { elementType: 'R', parameter: 0.5 },
    },
    { '@type': 'PortUsage', '@id': 'port-cf-in',  name: 'ingressPort' },
    { '@type': 'PortUsage', '@id': 'port-cf-out', name: 'egressPort' },
    /* C element: S3 storage accumulator (bytes served over time) */
    {
      '@type': 'PartUsage',
      '@id':   'part-s3',
      name:    'S3Bucket',
      ownedFeature: [{ '@id': 'port-s3-in' }],
      bgMapping: { elementType: 'C', parameter: 10.0 },
    },
    { '@type': 'PortUsage', '@id': 'port-s3-in', name: 'storagePort' },
    /* FlowConnectionUsages use source/target arrays per SysML schema */
    {
      '@type': 'FlowConnectionUsage',
      '@id':   'conn-user-cf',
      name:    'requestFlow',
      source:  [{ '@id': 'port-user-out' }],
      target:  [{ '@id': 'port-cf-in' }],
    },
    {
      '@type': 'FlowConnectionUsage',
      '@id':   'conn-cf-s3',
      name:    'originFetch',
      source:  [{ '@id': 'port-cf-out' }],
      target:  [{ '@id': 'port-s3-in' }],
    },
  ],
});

/* ── DseeTools wiring (real tool functions, no MCP transport) ──────── */

function makeTestTools(): DseeTools {
  return {
    transpileSysml: (json) => transpileSysml({ sysml_json: json }),
    validateModel:  (json) => validateModel({ model_json: json }),
    runSimulation:  (json, calculus) => runSimulation({ model_json: json, calculus }),
    generateDiagram:(json) => generateDiagram({ model_json: json, view: 'all', format: 'mermaid' }),
    generateBom:    (json) => generateBom({ model_json: json }),
    verifyRequirements: (modelJson, simJson) =>
      verifyRequirementsTool({ model_json: modelJson, sim_json: simJson }),
  };
}

/* ── Mock LLM response ────────────────────────────────────────────── */

// The mock wraps the pre-canned SysML in the same envelope createModel returns
const MOCK_MODEL_RESPONSE = JSON.stringify({ model: JSON.parse(STATIC_WEBSITE_SYSML) });

/* ── Tests ────────────────────────────────────────────────────────── */

describe('DSEE pipeline — S3 + CloudFront website (MockLlmProvider)', () => {
  it('completes the pipeline within 3 SCAP attempts', async () => {
    const agent = new DseeAgent({
      llm:   new MockLlmProvider(MOCK_MODEL_RESPONSE),
      tools: makeTestTools(),
      maxAttempts: 3,
    });

    const result = await agent.run('simple website hosted on S3 with CloudFront CDN');

    expect(result.scapAttempts).toBeLessThanOrEqual(3);
    expect(result.valid).toBe(true);
  }, 60_000);

  it('generates a SysML package with storage and CDN parts', async () => {
    const agent = new DseeAgent({
      llm:   new MockLlmProvider(MOCK_MODEL_RESPONSE),
      tools: makeTestTools(),
    });

    const result = await agent.run('static website on S3 and CloudFront');

    expect(result.sysmlJson).not.toBeNull();
    const pkg = JSON.parse(result.sysmlJson!);
    const elements: Array<{ '@type': string; name?: string }> = pkg.elements ?? [];
    const partUsages = elements.filter(e => e['@type'] === 'PartUsage');
    const requirements = elements.filter(e => e['@type'] === 'RequirementUsage');

    expect(partUsages.length).toBeGreaterThanOrEqual(2);
    expect(requirements.length).toBeGreaterThanOrEqual(1);

    const names = partUsages.map(p => (p.name ?? '').toLowerCase());
    expect(names.some(n => /s3|bucket|storage|origin/.test(n))).toBe(true);
    expect(names.some(n => /cloudfront|cdn|distribution|edge/.test(n))).toBe(true);
  }, 60_000);

  it('produces a valid Bond Graph with source and storage elements', async () => {
    const agent = new DseeAgent({
      llm:   new MockLlmProvider(MOCK_MODEL_RESPONSE),
      tools: makeTestTools(),
    });

    const result = await agent.run('static website on S3 and CloudFront');

    expect(result.bgJson).not.toBeNull();
    const bg = JSON.parse(result.bgJson!);
    expect(bg.domain).toBe('bondgraph');
    expect(bg.elements.length).toBeGreaterThanOrEqual(2);
    expect(bg.bonds.length).toBeGreaterThanOrEqual(1);

    const types: string[] = bg.elements.map((e: { type: string }) => e.type);
    const hasSource  = types.some(t => t === 'Se' || t === 'Sf');
    const hasStorage = types.some(t => t === 'C' || t === 'I');
    expect(hasSource).toBe(true);
    expect(hasStorage).toBe(true);
  }, 60_000);

  it('produces a non-empty timeseries from TDC simulation', async () => {
    const agent = new DseeAgent({
      llm:   new MockLlmProvider(MOCK_MODEL_RESPONSE),
      tools: makeTestTools(),
    });

    const result = await agent.run('static website on S3 and CloudFront');

    expect(result.simResult).not.toBeNull();
    const sim = JSON.parse(result.simResult!);
    expect(sim.simulation?.time?.length ?? 0).toBeGreaterThan(0);
    expect(sim.simulation?.state_variables?.length ?? 0).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it('produces a BOM with at least one component', async () => {
    const agent = new DseeAgent({
      llm:   new MockLlmProvider(MOCK_MODEL_RESPONSE),
      tools: makeTestTools(),
    });

    const result = await agent.run('static website on S3 and CloudFront');

    expect(result.bomResult).not.toBeNull();
    const bom = JSON.parse(result.bomResult!);
    const count = bom.items?.length ?? bom.components?.length ?? bom.bom?.length ?? 0;
    expect(count).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it('stream emits status → tool → reply events in correct order', async () => {
    const agent = new DseeAgent({
      llm:   new MockLlmProvider(MOCK_MODEL_RESPONSE),
      tools: makeTestTools(),
    });

    const events: string[] = [];
    for await (const ev of agent.stream('static website on S3 and CloudFront')) {
      events.push(ev.type);
      if (ev.type === 'error') throw new Error(`Stream emitted error: ${ev.message}`);
    }

    expect(events[0]).toBe('status');
    expect(events).toContain('tool');
    expect(events[events.length - 1]).toBe('reply');
  }, 60_000);
});
