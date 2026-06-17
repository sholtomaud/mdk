import * as https from 'https';
import { z } from 'zod';
import { BondGraphModel, OdumEslModel, SysmlPackage } from '@mdk/core';
import { type Stage, zodIssues } from './stages.js';

export const createModelSchema = {
  description: z.string().describe('Plain-English description of the system to model'),
  domain: z.enum(['bondgraph', 'odum-esl', 'sysml']).default('sysml').describe('Modelling domain — sysml is the default; generates a SysML v2 Package JSON validated by Zod then transpilable to BondGraph'),
  correction_json: z.string().optional().describe('For correction mode: current failing SysML JSON string to fix'),
  scap_errors: z.string().optional().describe('For correction mode: SCAP diagnostics string to fix in the model'),
  socratic_answers: z.string().optional().describe('For Socratic loop: user-provided answers to missing physical parameters'),
};

const GEMINI_MODEL = 'gemini-3-flash-preview';

/* ── Native HTTPS call to Gemini generateContent ─────────────────── */

function postGemini(payload: object): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GEMINI_API_KEY ?? '';
    const body = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>); }
          catch (e) { reject(e); }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/* ── Domain-specific JSON Schema for responseJsonSchema ─────────── */
/* Note: Gemini does not support JSON Schema 'const' — use enum[]   */

const BG_SCHEMA = {
  type: 'object',
  properties: {
    schemaVersion: { type: 'string' },
    domain:        { type: 'string', enum: ['bondgraph'] },
    elements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id:        { type: 'integer' },
          name:      { type: 'string' },
          type:      { type: 'string', enum: ['Se','Sf','R','C','I','TF','GY','J0','J1'] },
          parameter: { type: 'number' },
        },
        required: ['id', 'name', 'type', 'parameter'],
      },
    },
    bonds: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id:     { type: 'integer' },
          source: { type: 'integer' },
          target: { type: 'integer' },
        },
        required: ['id', 'source', 'target'],
      },
    },
    config: {
      type: 'object',
      properties: {
        t_start: { type: 'number' },
        t_end:   { type: 'number' },
        dt:      { type: 'number' },
        method:  { type: 'string', enum: ['euler', 'rk4'] },
      },
    },
  },
  required: ['domain', 'elements', 'bonds'],
};

const ODUM_SCHEMA = {
  type: 'object',
  properties: {
    schemaVersion: { type: 'string' },
    domain:        { type: 'string', enum: ['odum-esl'] },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id:    { type: 'string' },
          type:  { type: 'string', enum: ['source', 'storage', 'sink', 'constant'] },
          value: { type: 'number' },
        },
        required: ['id', 'type', 'value'],
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id:     { type: 'string' },
          origin: { type: 'string' },
          target: { type: 'string' },
          logic:  { type: 'string', enum: ['constant', 'linear', 'interaction', 'limit', 'threshold'] },
          params: {
            type: 'object',
            properties: {
              k:            { type: 'number' },
              control_node: { type: 'string', description: 'Required for interaction and limit logic — ID of the controlling node' },
              threshold:    { type: 'number', description: 'Required for threshold logic — value above which flow activates' },
            },
            required: ['k'],
          },
        },
        required: ['origin', 'target', 'logic', 'params'],
      },
    },
    config: {
      type: 'object',
      properties: {
        t_start: { type: 'number' },
        t_end:   { type: 'number' },
        dt:      { type: 'number' },
        method:  { type: 'string', enum: ['euler', 'rk4'] },
      },
    },
  },
  required: ['domain', 'nodes'],
};

/* ── SysML JSON Schema for Gemini responseJsonSchema ─────────────── */
/* Flat schema — Gemini cannot handle discriminated unions.           */
/* @type is an enum discriminator; all other fields are optional.    */

const SYSML_SCHEMA = {
  type: 'object',
  properties: {
    '@id': { type: 'string' },
    '@type': { type: 'string', enum: ['Package'] },
    name: { type: 'string' },
    elements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          '@id': { type: 'string', description: 'UUID, unique per element, e.g. "a1b2c3d4-e5f6-7890-abcd-ef1234567890"' },
          '@type': { type: 'string', enum: ['ItemDefinition','PortDefinition','PortUsage','PartDefinition','PartUsage','FlowConnectionUsage','RequirementUsage','RequirementDefinition'] },
          name: { type: 'string' },
          description: { type: 'string' },
          externalId: { type: 'string', description: 'Optional deployment identity (ARN, serial number, SKU, or Token placeholder ${Token[key]})' },
          metadata: {
            type: 'object',
            description: 'Optional commercial/vendor data for BOM generation (stockNumber, vendor, leadTime, etc)',
          },
          bgMapping: {
            type: 'object',
            properties: {
              elementType: { type: 'string', enum: ['Se','Sf','R','C','I','TF','GY','J0','J1'] },
              junctionType: { type: 'string', enum: ['J0','J1'] },
              parameter:    { type: 'number' },
              effortVariable: { type: 'string' },
              flowVariable:   { type: 'string' },
              domain: { type: 'string', enum: ['electrical','hydraulic','mechanical','thermal','chemical','economic','generic'] },
              bondType: { type: 'string', enum: ['power_bond','InformationBond'] },
            },
          },
          source:       { type: 'array', items: { type: 'object', properties: { '@id': { type: 'string' } }, required: ['@id'] } },
          target:       { type: 'array', items: { type: 'object', properties: { '@id': { type: 'string' } }, required: ['@id'] } },
          ownedFeature: { type: 'array', items: { type: 'object', properties: { '@id': { type: 'string' } }, required: ['@id'] } },
          direction:    { type: 'string', enum: ['in','out','inout'] },
          isComposite:  { type: 'boolean' },
          itemFlow:     { type: 'object', properties: { '@id': { type: 'string' } }, required: ['@id'] },
          definition:   { type: 'object', properties: { '@id': { type: 'string' } }, required: ['@id'] },
          text:         { type: 'string', description: 'Requirement text' },
          subject:      { type: 'object', properties: { '@id': { type: 'string' } }, required: ['@id'], description: 'Element this requirement applies to' },
          constraint:   { type: 'string', description: 'Quantitative constraint for verification (e.g. "max(v) < 0.5")' },
        },
        required: ['@id', '@type', 'name'],
      },
    },
    /**
     * Socratic Loop output — DSEE Step 1.2.
     * When a required physical parameter cannot be determined from the
     * description, the LLM emits it here instead of guessing.
     * The Context Assembler halts execution and presents these to the user.
     */
    missing_parameters: {
      type: 'array',
      description: 'Structured list of physical parameters the LLM cannot determine from the description. The system will ask the user for these before proceeding.',
      items: {
        type: 'object',
        properties: {
          element_name: { type: 'string', description: 'The name of the element missing a parameter' },
          parameter:    { type: 'string', description: 'The physical quantity needed (e.g. "resistance R", "capacitance C", "motor torque constant Km")' },
          unit:         { type: 'string', description: 'SI unit of the parameter (e.g. "Ohm", "F", "Nm/A")' },
          reason:       { type: 'string', description: 'Why this parameter is required and cannot be estimated' },
        },
        required: ['element_name', 'parameter', 'unit', 'reason'],
      },
    },
  },
  required: ['@id', '@type', 'elements'],
};

/* ── System prompts ──────────────────────────────────────────────── */

const SYSML_SYSTEM_PROMPT = `You are an expert MDK SysML modelling assistant. Generate a SysML v2 Package JSON for the described system.

MANDATORY RULES — violating any will cause SCAP validation failure:
1. Every @id must be a unique string (e.g. "rain_sf", "store_c1", "bond_4"). You do NOT need to generate UUIDs; any unique ID is acceptable.
2. Every PartUsage MUST have bgMapping.elementType set to one of: Se, Sf, R, C, I, TF, GY, J0, J1.
3. Every PortUsage MUST have bgMapping.junctionType set to J0 (common effort) or J1 (common flow).
4. Every Se (effort source) and Sf (flow source) MUST have bgMapping.parameter = the numeric driving value.
5. Every R (resistance), C (compliance), I (inertia) MUST have bgMapping.parameter = the element value.
6. Every TF (transformer) MUST have bgMapping.parameter = the modulus (ratio). Every GY (gyrator) MUST have bgMapping.parameter = the gyration coefficient.
7. FlowConnectionUsage connects port @ids via source:[{"@id":"..."}] and target:[{"@id":"..."}]. All referenced @ids must exist in the elements array.
8. Every PartUsage must connect to at least one PortUsage via ownedFeature refs, unless it IS a junction (J0/J1) in which case it bonds directly.
9. No orphan elements. Every element must participate in at least one FlowConnectionUsage.
10. Do NOT include any prose, description fields, or explanatory text — structured JSON output only.

Bond Graph domain mapping guide:
- Se: effort source (voltage supply, gravity, pressure head). parameter = effort value.
- Sf: flow source (current source, pump flow). parameter = flow value.
- R: resistor/damper/friction. parameter = resistance/damping coefficient.
- C: capacitor/spring/compliance/mass balance tank. parameter = capacitance/compliance (1/stiffness).
- I: inductor/mass/inertia. parameter = inductance/mass/inertia.
- TF: gear, electrical transformer, lever. parameter = turns ratio / gear ratio.
- GY: DC motor, gyroscope (converts effort↔flow). parameter = gyration coefficient.
- J0: 0-junction (common effort, Kirchhoff voltage law). All flows sum to zero.
- J1: 1-junction (common flow, Kirchhoff current law). All efforts sum to zero.

PortUsage junctionType:
- J0 port: used for pressure-type, voltage-type, or "node" ports where effort is shared.
- J1 port: used for flow-type, velocity-type, or "loop" ports where flow is shared.

Physical domain examples (use as bgMapping.domain on ItemDefinitions):
- electrical: effort=voltage(V), flow=current(A)
- mechanical: effort=force(N), flow=velocity(m/s)
- hydraulic: effort=pressure(Pa), flow=volume_flow(m³/s)
- thermal: effort=temperature(K), flow=entropy_rate(W/K)
- economic: effort=price($/unit), flow=money_flow($/s)
- ecological: effort=chemical_potential, flow=mass_flow(kg/s)

ADDITIONAL MANDATORY RULES (11-14) — violating any will cause transpilation or simulation failure:
11. The elements array MUST contain at least one FlowConnectionUsage. A model with no flow connections is physically meaningless and invalid.
12. Every FlowConnectionUsage MUST have source:[{"@id":"<portUsageId>"}] and target:[{"@id":"<portUsageId>"}] pointing to PortUsage @ids that exist in the elements array.
13. Every element in the elements array MUST have a non-empty "name" string. Never omit the name field.
14. Every C or I PartUsage (storage/inertia element) MUST be connected to at least one J0 or J1 PortUsage via a FlowConnectionUsage — isolated storage elements have no dynamics.
15. NEVER omit bgMapping metadata during corrections. If a model is rejected, you must preserve the physical parameters (R, C, I, parameters) in the revised version.
16. SOCRATIC RULE: If you cannot determine a required physical parameter from the description (e.g. motor winding resistance, pump flow rate), do NOT guess. Instead, emit a missing_parameters array entry for each unknown value. Use a placeholder value of 1.0 for any element that has a missing parameter so the model remains structurally valid, but declare it in missing_parameters.
17. REQUIREMENTS RULE: If the user provides quantitative performance goals (e.g. "must not exceed 50 degrees", "settling time < 0.1s"), you MUST emit RequirementUsage elements linked to the relevant parts via the "subject" field. For each RequirementUsage, include a "constraint" string in the format "func(state) op value" (e.g. "max(temp) < 50").`;

const SYSTEM_PROMPTS: Record<string, string> = {
  bondgraph: `You are an expert in Bond Graph modelling. Bond Graphs use nine element types:
- Se (effort source, e.g. voltage, pressure), Sf (flow source, e.g. current, velocity)
- R (resistance/damping), C (compliance/capacitance, stores q), I (inertia, stores p)
- TF (transformer, changes effort/flow ratio), GY (gyrator, converts effort↔flow across domains)
- J0 (0-junction: common effort, flows sum to zero), J1 (1-junction: common flow, efforts sum to zero)

Rules:
- Every element must connect to a junction via a bond
- J0 and J1 must each have at least 2 bonds
- Assign physical domains: electrical, mechanical_translation, mechanical_rotation, hydraulic, thermal
- Se/Sf are sources — assign realistic parameter values with units
- R, C, I get a single numeric parameter value with unit
- TF requires a modulus (ratio), GY requires a gyration resistance

Create a physically correct, minimal Bond Graph model. Set schemaVersion to "1.0".`,

  'odum-esl': `You are an expert in Howard T. Odum's Energy Systems Language (ESL).
Node types: source (external energy driver), storage (accumulator with initial value),
sink (dissipator), constant (fixed parameter).
Edge logic types:
- linear: flow = k * Q_origin  (most common — use this unless co-production is needed)
- constant: fixed flow = k
- interaction: flow = k * Q_origin * Q_control  (requires params.control_node = ID of the controlling node)
- limit: Michaelis-Menten saturation (requires params.control_node = saturation capacity node ID)
- threshold: step function, flow = k if Q_origin > params.threshold else 0

CRITICAL RULES:
- "interaction" and "limit" edges MUST include params.control_node pointing to an existing node ID
- Every storage node must have at least one inflow and one outflow edge
- Source nodes have no inflow edges; sink nodes have no outflow edges
- k values represent transfer coefficients consistent with the system units
- Prefer "linear" logic unless the system explicitly requires co-production or saturation
- Include realistic initial parameter values for all nodes

Create a physically meaningful Odum ESL model. Set schemaVersion to "1.0".`,

  sysml: SYSML_SYSTEM_PROMPT,
};

/* ── Correction prompt ───────────────────────────────────────────── */

function sysmlCorrectionPrompt(description: string, currentJson: string, errors: string): string {
  return `CORRECTION MODE. Fix the following SCAP validation errors in this SysML model.

Original system description: ${description}

SCAP errors to fix:
${errors}

Current (failing) model JSON:
${currentJson}

Return ONLY corrected SysML Package JSON. No prose. Apply the same MANDATORY RULES as the original generation. Every fix must address a specific listed error.`;
}

/* ── Socratic prompt ─────────────────────────────────────────────── */

function sysmlSocraticPrompt(description: string, currentJson: string, answers: string): string {
  return `SOCRATIC RESUME. You previously generated a model but needed more physical parameters.
The user has provided the missing values. Incorporate these into the bgMapping.parameter fields.

Original system description: ${description}

User provided parameters:
${answers}

Current model JSON to update:
${currentJson}

Return ONLY the updated SysML Package JSON. No prose. Apply all MANDATORY RULES. Ensure the missing_parameters array is now EMPTY in your response.`;
}

/* ── Tool implementation ─────────────────────────────────────────── */

export async function createModel(
  { description, domain, correction_json, scap_errors, socratic_answers }: {
    description: string;
    domain: 'bondgraph' | 'odum-esl' | 'sysml';
    correction_json?: string;
    scap_errors?: string;
    socratic_answers?: string;
  },
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    return JSON.stringify({
      error: 'GEMINI_API_KEY not set — cannot synthesise model',
      hint: 'Set GEMINI_API_KEY in the MCP server environment',
    });
  }

  /* ── Choose response schema ─────────────────────────────────────── */
  let responseJsonSchema: object;
  if (domain === 'bondgraph') {
    responseJsonSchema = BG_SCHEMA;
  } else if (domain === 'odum-esl') {
    responseJsonSchema = ODUM_SCHEMA;
  } else {
    responseJsonSchema = SYSML_SCHEMA;
  }

  /* ── Choose user message content ───────────────────────────────── */
  let userContent: string;
  if (domain === 'sysml' && correction_json && scap_errors) {
    userContent = sysmlCorrectionPrompt(description, correction_json, scap_errors);
  } else if (domain === 'sysml' && correction_json && socratic_answers) {
    userContent = sysmlSocraticPrompt(description, correction_json, socratic_answers);
  } else {
    userContent = description;
  }

  const payload = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPTS[domain] }] },
    contents: [{ parts: [{ text: userContent }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema,
    },
  };

  const stages: Stage[] = [];

  /* ── Stage 1: Gemini responseJsonSchema API call ─────────────────── */
  let raw: {
    candidates?: Array<{ content: { parts: Array<{ text?: string }> } }>;
    error?: { message: string };
  };
  try {
    raw = await postGemini(payload) as typeof raw;
  } catch (e) {
    stages.push({ name: `Gemini responseJsonSchema (${GEMINI_MODEL})`, pass: false, note: String(e) });
    return JSON.stringify({ error: 'Gemini API request failed', stages });
  }

  if (raw.error) {
    stages.push({ name: `Gemini responseJsonSchema (${GEMINI_MODEL})`, pass: false, note: raw.error.message });
    return JSON.stringify({ error: `Gemini API error: ${raw.error.message}`, stages });
  }

  const text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) {
    stages.push({ name: `Gemini responseJsonSchema (${GEMINI_MODEL})`, pass: false, note: 'empty response' });
    return JSON.stringify({ error: 'No model returned from Gemini', stages });
  }
  stages.push({
    name: `Gemini responseJsonSchema (${GEMINI_MODEL})`,
    pass: true,
    note: `${domain} schema enforced by API`,
  });

  /* ── Stage 2: JSON parse ─────────────────────────────────────────── */
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
    if (domain !== 'sysml') {
      parsed.schemaVersion = parsed.schemaVersion ?? '1.0';
    }
    stages.push({ name: 'JSON.parse', pass: true });
  } catch (e) {
    stages.push({ name: 'JSON.parse', pass: false, note: String(e) });
    return JSON.stringify({ error: 'Gemini returned invalid JSON', stages });
  }

  /* ── Stage 3: Zod schema validation ─────────────────────────────── */
  if (domain === 'sysml') {
    const zodResult = SysmlPackage.safeParse(parsed);
    stages.push({
      name:   'Zod SysmlPackage',
      pass:   zodResult.success,
      issues: zodResult.success ? [] : zodIssues(zodResult.error),
    });

    if (!zodResult.success) {
      return JSON.stringify({ model: parsed, stages }, null, 2);
    }

    /* ── Stage 4: Socratic Loop ─ surface missing parameters ────── */
    const missingParams = (zodResult.data as unknown as Record<string, unknown>).missing_parameters;
    if (Array.isArray(missingParams) && missingParams.length > 0) {
      stages.push({
        name: 'Socratic Loop',
        pass: false,
        note: `${missingParams.length} physical parameter(s) could not be determined from the description`,
        issues: (missingParams as Array<{ element_name: string; parameter: string; unit: string; reason: string }>)
          .map(mp => ({
            path: mp.element_name,
            message: `${mp.parameter} [${mp.unit}]: ${mp.reason}`,
          })),
      });
    }

    /* ── Stage 5: ID Normalization ───────────────────────────────── */
    const normalized = normalizeSysmlIds(zodResult.data);
    stages.push({ name: 'ID Normalization', pass: true, note: 'Mapped LLM strings to valid UUIDs' });

    return JSON.stringify({ model: normalized, missing_parameters: missingParams ?? [], stages }, null, 2);
  }

  const zodSchema = domain === 'bondgraph' ? BondGraphModel : OdumEslModel;
  const zodResult = zodSchema.safeParse(parsed);
  stages.push({
    name:   `Zod ${domain === 'bondgraph' ? 'BondGraphModel' : 'OdumEslModel'}`,
    pass:   zodResult.success,
    issues: zodResult.success ? [] : zodIssues(zodResult.error),
  });

  return JSON.stringify({
    model:  zodResult.success ? zodResult.data : parsed,
    stages,
  }, null, 2);
}

/**
 * Replaces arbitrary @id strings with valid UUIDs.
 */
function normalizeSysmlIds(pkg: any): any {
  const idMap = new Map<string, string>();
  const { randomUUID } = require('node:crypto');

  // First pass: Generate new UUIDs for every element
  idMap.set(pkg['@id'], randomUUID());
  if (pkg.elements) {
    for (const el of pkg.elements) {
      idMap.set(el['@id'], randomUUID());
    }
  }

  const mapId = (id: string) => idMap.get(id) || id;

  // Second pass: Update the package and its elements
  const newPkg = {
    ...pkg,
    '@id': mapId(pkg['@id']),
    elements: pkg.elements?.map((el: any) => {
      const newEl = { ...el, '@id': mapId(el['@id']) };

      // Update references
      if (newEl.ownedFeature) {
        newEl.ownedFeature = newEl.ownedFeature.map((f: any) => {
           if (typeof f === 'string') return mapId(f);
           if (f['@id']) return { ...f, '@id': mapId(f['@id']) };
           return f;
        });
      }
      if (newEl.source) {
        newEl.source = newEl.source.map((s: any) => ({ ...s, '@id': mapId(s['@id']) }));
      }
      if (newEl.target) {
        newEl.target = newEl.target.map((t: any) => ({ ...t, '@id': mapId(t['@id']) }));
      }
      if (newEl.definition && newEl.definition['@id']) {
        newEl.definition = { ...newEl.definition, '@id': mapId(newEl.definition['@id']) };
      }
      if (newEl.itemFlow && newEl.itemFlow['@id']) {
        newEl.itemFlow = { ...newEl.itemFlow, '@id': mapId(newEl.itemFlow['@id']) };
      }
      if (newEl.subject && newEl.subject['@id']) {
        newEl.subject = { ...newEl.subject, '@id': mapId(newEl.subject['@id']) };
      }

      return newEl;
    }),
  };

  return newPkg;
}
