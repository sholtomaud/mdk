/**
 * DACM tool tests — Priority 5 (DCG diagram) and Priority 6 (π-groups)
 *
 * Tests:
 * - generateDiagram with domain: 'functional' produces a 'dcg' Mermaid diagram
 * - computePiGroupsTool parses a FunctionalModel and returns π-groups
 * - validateModel handles FunctionalModel (Zod-only, no WASM)
 */

import { describe, it, expect } from 'vitest';
import { generateDiagram }        from '../tools/generate-diagram.js';
import { computePiGroupsTool }    from '../tools/compute-pi-groups.js';
import { validateModel }          from '../tools/validate-model.js';

/* ── Shared fixture: minimal FunctionalModel ──────────────────────── */

const VEHICLE_MODEL = JSON.stringify({
  name:    'Vehicle Aerodynamics',
  domain:  'functional',
  objective: 'Minimise aerodynamic drag',
  subsystems: [
    {
      id:   'aero',
      name: 'Aerodynamics',
      connectorType: 'CTF',
      connectedTo: ['struct'],
      functions: [
        {
          id:    'drag',
          name:  'Drag Force',
          organ: 'R',
          variables: [
            {
              id: 'v', name: 'Vehicle speed', symbol: 'v',
              category: 'flow', role: 'independent', unit: 'm/s',
              siDimensions: { M: 0, L: 1, T: -1, I: 0, Θ: 0, N: 0, J: 0 },
            },
            {
              id: 'rho', name: 'Air density', symbol: 'ρ',
              category: 'effort', role: 'exogenous', unit: 'kg/m³',
              siDimensions: { M: 1, L: -3, T: 0, I: 0, Θ: 0, N: 0, J: 0 },
            },
            {
              id: 'F_D', name: 'Drag Force', symbol: 'F_D',
              category: 'effort', role: 'performance', unit: 'N',
              siDimensions: { M: 1, L: 1, T: -2, I: 0, Θ: 0, N: 0, J: 0 },
            },
            {
              id: 'A', name: 'Frontal Area', symbol: 'A',
              category: 'connecting', role: 'independent', unit: 'm²',
              siDimensions: { M: 0, L: 2, T: 0, I: 0, Θ: 0, N: 0, J: 0 },
            },
          ],
        },
      ],
    },
    {
      id:   'struct',
      name: 'Structure',
      functions: [
        {
          id: 'bending', name: 'Bending', organ: 'C',
          variables: [
            {
              id: 'sigma', name: 'Bending stress', symbol: 'σ',
              category: 'effort', role: 'dependent', unit: 'Pa',
              siDimensions: { M: 1, L: -1, T: -2, I: 0, Θ: 0, N: 0, J: 0 },
            },
          ],
        },
      ],
    },
  ],
});

/* ── generate_diagram: dcg view ──────────────────────────────────── */

describe('generateDiagram — functional model → DCG', () => {
  it('returns a mermaid code block for domain: functional', async () => {
    const result = await generateDiagram({ model_json: VEHICLE_MODEL, view: 'dcg', format: 'mermaid' });
    expect(result).toContain('```mermaid');
    expect(result).toContain('graph TD');
  });

  it('includes classDef colour coding', async () => {
    const result = await generateDiagram({ model_json: VEHICLE_MODEL, view: 'dcg', format: 'mermaid' });
    expect(result).toContain('classDef independent');
    expect(result).toContain('classDef performance');
    expect(result).toContain('classDef exogenous');
    expect(result).toContain('classDef dependent');
  });

  it('emits a subgraph for each subsystem', async () => {
    const result = await generateDiagram({ model_json: VEHICLE_MODEL, view: 'dcg', format: 'mermaid' });
    expect(result).toContain('subgraph');
    expect(result).toContain('Aerodynamics');
    expect(result).toContain('Structure');
  });

  it('emits organ function nodes', async () => {
    const result = await generateDiagram({ model_json: VEHICLE_MODEL, view: 'dcg', format: 'mermaid' });
    expect(result).toContain(':::organ');
  });

  it('shows causal arrows from independent variable to function', async () => {
    const result = await generateDiagram({ model_json: VEHICLE_MODEL, view: 'dcg', format: 'mermaid' });
    expect(result).toContain(' --> ');
  });

  it('shows dashed arrows from exogenous variable to function', async () => {
    const result = await generateDiagram({ model_json: VEHICLE_MODEL, view: 'dcg', format: 'mermaid' });
    expect(result).toContain(' -.-> ');
  });

  it('emits inter-subsystem connector edge with CTF label', async () => {
    const result = await generateDiagram({ model_json: VEHICLE_MODEL, view: 'dcg', format: 'mermaid' });
    expect(result).toContain('CTF');
  });

  it('returns dcg diagram for view: all', async () => {
    const result = await generateDiagram({ model_json: VEHICLE_MODEL, view: 'all', format: 'mermaid' });
    expect(result).toContain('graph TD');
  });
});

/* ── compute_pi_groups tool ──────────────────────────────────────── */

describe('computePiGroupsTool', () => {
  it('returns success and pi-groups for a valid FunctionalModel', async () => {
    const raw = await computePiGroupsTool({ model_json: VEHICLE_MODEL });
    const result = JSON.parse(raw) as { success: boolean; piGroups: unknown[]; rank: number };
    expect(result.success).toBe(true);
    expect(Array.isArray(result.piGroups)).toBe(true);
  });

  it('returns at least one pi-group for the aero subsystem', async () => {
    const raw = await computePiGroupsTool({ model_json: VEHICLE_MODEL, subsystem_id: 'aero' });
    const result = JSON.parse(raw) as { piGroups: unknown[] };
    expect(result.piGroups.length).toBeGreaterThanOrEqual(1);
  });

  it('includes a llm_hint string', async () => {
    const raw = await computePiGroupsTool({ model_json: VEHICLE_MODEL });
    const result = JSON.parse(raw) as { llm_hint: string };
    expect(typeof result.llm_hint).toBe('string');
    expect(result.llm_hint.length).toBeGreaterThan(10);
  });

  it('returns error for invalid JSON', async () => {
    const raw = await computePiGroupsTool({ model_json: 'not json' });
    const result = JSON.parse(raw) as { error: string };
    expect(result.error).toBeTruthy();
  });

  it('returns error when domain is not functional', async () => {
    const bgJson = JSON.stringify({ domain: 'bondgraph', elements: [], bonds: [] });
    const raw = await computePiGroupsTool({ model_json: bgJson });
    const result = JSON.parse(raw) as { error: string };
    expect(result.error).toBeTruthy();
  });

  it('accepts direct variables_json bypassing FunctionalModel parse', async () => {
    const vars = JSON.stringify([
      { id: 'v', name: 'velocity', symbol: 'v',
        siDimensions: { M: 0, L: 1, T: -1, I: 0, Θ: 0, N: 0, J: 0 } },
      { id: 'L', name: 'length', symbol: 'L',
        siDimensions: { M: 0, L: 1, T: 0, I: 0, Θ: 0, N: 0, J: 0 } },
      { id: 'nu', name: 'kinematic viscosity', symbol: 'ν',
        siDimensions: { M: 0, L: 2, T: -1, I: 0, Θ: 0, N: 0, J: 0 } },
    ]);
    const raw = await computePiGroupsTool({ model_json: '{}', variables_json: vars });
    const result = JSON.parse(raw) as { success: boolean; piGroups: unknown[]; rank: number };
    expect(result.success).toBe(true);
    expect(result.rank).toBe(2); // rank = 2 (only L and T dimensions)
    expect(result.piGroups).toHaveLength(1); // 3 vars - rank 2 = 1 pi-group (Re number)
  });
});

/* ── validate_model: functional domain ──────────────────────────── */

describe('validateModel — FunctionalModel', () => {
  it('validates a correct FunctionalModel as valid', async () => {
    const raw = await validateModel({ model_json: VEHICLE_MODEL });
    const result = JSON.parse(raw) as { valid: boolean; domain: string; stages: unknown[] };
    expect(result.valid).toBe(true);
    expect(result.domain).toBe('functional');
    expect(Array.isArray(result.stages)).toBe(true);
  });

  it('returns valid: false for missing subsystems', async () => {
    const bad = JSON.stringify({ name: 'Bad', domain: 'functional', subsystems: [] });
    const raw = await validateModel({ model_json: bad });
    const result = JSON.parse(raw) as { valid: boolean };
    expect(result.valid).toBe(false);
  });

  it('includes Zod FunctionalModel stage', async () => {
    const raw = await validateModel({ model_json: VEHICLE_MODEL });
    const result = JSON.parse(raw) as { stages: Array<{ name: string; pass: boolean }> };
    const zodStage = result.stages.find(s => s.name === 'Zod FunctionalModel');
    expect(zodStage?.pass).toBe(true);
  });
});
