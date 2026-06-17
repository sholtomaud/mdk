import * as https from 'https';
import type { LlmProvider, GenerateModelOpts, ExplainOpts } from './llm-provider.js';

const GEMINI_MODEL = 'gemini-3-flash-preview';

const EXPLAIN_SYSTEM = `You are a concise MDK modelling assistant. Given the user's description and MDK pipeline results, write 2-3 sentences explaining:
- What physical phenomenon and energy domain(s) the model captures
- What the simulation reveals and whether formal requirements were met
- Key highlights from the Bill of Materials or emergy analysis
Be technically accurate but brief. Do not reproduce the diagram or list components.`;

function postGemini(apiKey: string, payload: object): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
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
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
          catch (e) { reject(e); }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function extractText(raw: Record<string, unknown>): string {
  const cands = (raw as { candidates?: Array<{ content: { parts: Array<{ text?: string }> } }> }).candidates;
  return (cands?.[0]?.content?.parts ?? []).map(p => p.text ?? '').join('').trim();
}

/* ── Domain JSON schemas for responseJsonSchema ───────────────────── */

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
          type:      { type: 'string', enum: ['Se','Sf','R','C','I','TF','GY','J0','J1','MTF','MGY','CTF'] },
          parameter: { type: 'number' },
        },
        required: ['id','name','type','parameter'],
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
        required: ['id','source','target'],
      },
    },
    config: {
      type: 'object',
      properties: {
        t_start: { type: 'number' },
        t_end:   { type: 'number' },
        dt:      { type: 'number' },
        method:  { type: 'string', enum: ['euler','rk4'] },
      },
    },
  },
  required: ['domain','elements','bonds'],
};

const SYSML_SCHEMA = {
  type: 'object',
  properties: {
    '@type':   { type: 'string', enum: ['Package'] },
    '@id':     { type: 'string' },
    name:      { type: 'string' },
    elements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          '@type': { type: 'string', enum: [
            'PartDefinition','PartUsage','PortDefinition','PortUsage',
            'FlowConnectionUsage','ItemDefinition','RequirementUsage',
          ]},
          '@id':         { type: 'string' },
          name:          { type: 'string' },
          text:          { type: 'string' },
          ownedFeature:  { type: 'array', items: { type: 'object', properties: { '@id': { type: 'string' } }, required: ['@id'] } },
          sourceFeature: { type: 'object', properties: { '@id': { type: 'string' } }, required: ['@id'] },
          targetFeature: { type: 'object', properties: { '@id': { type: 'string' } }, required: ['@id'] },
          bgMapping: {
            type: 'object',
            properties: {
              elementType: { type: 'string', enum: ['Se','Sf','R','C','I','TF','GY','J0','J1','MTF','MGY','CTF'] },
              parameter:   { type: 'number' },
            },
          },
        },
        required: ['@type','@id','name'],
      },
    },
    missing_parameters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          element_name: { type: 'string' },
          parameter:    { type: 'string' },
          unit:         { type: 'string' },
          reason:       { type: 'string' },
        },
        required: ['element_name','parameter','unit','reason'],
      },
    },
  },
  required: ['@type','@id','name','elements'],
};

const ODUM_SCHEMA = {
  type: 'object',
  properties: {
    name:  { type: 'string' },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id:    { type: 'string' },
          name:  { type: 'string' },
          type:  { type: 'string', enum: ['Source','Storage','Consumer','Interaction','Transaction','Switch','Constant'] },
          value: { type: 'number' },
        },
        required: ['id','name','type'],
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
          logic:  { type: 'string', enum: ['flow','control','feedback'] },
          params: { type: 'object', properties: { k: { type: 'number' } } },
        },
        required: ['id','origin','target'],
      },
    },
    config: {
      type: 'object',
      properties: {
        t_start:  { type: 'number' },
        t_end:    { type: 'number' },
        dt:       { type: 'number' },
        method:   { type: 'string', enum: ['euler','rk4'] },
      },
    },
  },
  required: ['name','nodes','edges'],
};

const FUNCTIONAL_SCHEMA = {
  type: 'object',
  properties: {
    name:      { type: 'string' },
    domain:    { type: 'string', enum: ['functional'] },
    objective: { type: 'string' },
    subsystems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id:   { type: 'string' },
          name: { type: 'string' },
          connectorType: { type: 'string', enum: ['MTF','MGY','CTF'] },
          connectedTo:   { type: 'array', items: { type: 'string' } },
          functions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id:          { type: 'string' },
                name:        { type: 'string' },
                description: { type: 'string' },
                organ:       { type: 'string', enum: ['Se','Sf','R','C','I','TF','GY','J0','J1','MTF','MGY','CTF'] },
                variables: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id:       { type: 'string' },
                      name:     { type: 'string' },
                      symbol:   { type: 'string' },
                      category: { type: 'string', enum: ['effort','flow','momentum','displacement','connecting'] },
                      role:     { type: 'string', enum: ['independent','dependent','exogenous','performance'] },
                      unit:     { type: 'string' },
                      siDimensions: {
                        type: 'object',
                        properties: {
                          M: { type: 'number' }, L: { type: 'number' }, T: { type: 'number' },
                          I: { type: 'number' }, Θ: { type: 'number' }, N: { type: 'number' }, J: { type: 'number' },
                        },
                      },
                    },
                    required: ['id','name','symbol'],
                  },
                },
                powerLaws: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id:                  { type: 'string' },
                      functionId:          { type: 'string' },
                      dependentVar:        { type: 'string' },
                      piConstant:          { type: 'number' },
                      exponents:           { type: 'object' },
                      dimensionlessGroup:  { type: 'string' },
                      physicalPhenomenon:  { type: 'string' },
                    },
                    required: ['id','functionId','dependentVar','exponents'],
                  },
                },
              },
              required: ['id','name'],
            },
          },
        },
        required: ['id','name','functions'],
      },
    },
    systemVariables: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id:       { type: 'string' },
          name:     { type: 'string' },
          symbol:   { type: 'string' },
          category: { type: 'string', enum: ['effort','flow','momentum','displacement','connecting'] },
          role:     { type: 'string', enum: ['independent','dependent','exogenous','performance'] },
          unit:     { type: 'string' },
        },
        required: ['id','name','symbol'],
      },
    },
  },
  required: ['name','domain','subsystems'],
};

function schemaForDomain(domain: GenerateModelOpts['domain']): object {
  if (domain === 'bondgraph')  return BG_SCHEMA;
  if (domain === 'odum-esl')   return ODUM_SCHEMA;
  if (domain === 'functional') return FUNCTIONAL_SCHEMA;
  return SYSML_SCHEMA;
}

function systemPromptForDomain(domain: GenerateModelOpts['domain'], opts: GenerateModelOpts): string {
  if (domain === 'sysml') {
    const correctionSection = opts.correction_json
      ? `\n\nThe previous SysML JSON FAILED SCAP validation with these errors:\n${opts.scap_errors ?? 'unknown'}\n\nHere is the failing JSON to correct:\n${opts.correction_json}`
      : '';
    const socraticSection = opts.socratic_answers
      ? `\n\nThe user has provided these answers to missing parameters:\n${opts.socratic_answers}`
      : '';
    return `You are an expert SysML v2 modelling assistant for MDK. Given a system description, generate a SysML v2 Package JSON with PartUsages, PortUsages, FlowConnectionUsages, and RequirementUsages.

CRITICAL — bgMapping on every PartUsage:
Every PartUsage MUST include a "bgMapping" object with "elementType" chosen from:
  Se  = effort source (voltage source, pressure source, rainfall input, gravity head)
  Sf  = flow source (current source, pump flow, constant mass flow)
  R   = resistor / dissipator (resistor, pipe friction, evaporation loss, damper)
  C   = capacitor / storage (capacitor, tank, spring, soil water store)
  I   = inertia (inductor, mass, fluid inertia)
  J0  = 0-junction (equal effort node)
  J1  = 1-junction (equal flow node)
Also set "parameter" in bgMapping to the numeric value for the element (resistance, capacitance, etc).

Domain mapping examples:
  Electrical: voltage source=Se, resistor=R, capacitor=C, inductor=I
  Hydraulic:  pump=Sf, pipe=R, tank=C
  Mechanical: force source=Se, friction=R, spring=C, mass=I
  Hydrological: rainfall=Se, evapotranspiration=R, soil water store=C

Use sourceFeature/targetFeature on FlowConnectionUsage to reference port @id values.
If physical parameter values are unknown, include a "missing_parameters" array.${correctionSection}${socraticSection}`;
  }
  if (domain === 'bondgraph') {
    return `You are an expert Bond Graph modelling assistant for MDK. Generate a valid Bond Graph JSON model. Elements must have correct types (Se/Sf/R/C/I/TF/GY/J0/J1/MTF/MGY/CTF). Ensure causal consistency: every junction must have exactly one effort-setting bond. Use MTF for modulated transformers, MGY for modulated gyrators, and CTF for control transformers (connecting variables with arbitrary causality).`;
  }
  if (domain === 'functional') {
    return `You are an expert DACM (Dimensional Analysis and Conceptual Modelling) functional modelling assistant for MDK. Given a system description, generate a FunctionalModel JSON following the Dhalpe et al. 2025 DACM framework.

Structure:
- Decompose the system into subsystems, each with bond-graph organs (Se/Sf/R/C/I/TF/GY/MTF/MGY/CTF)
- Assign variables with categories: effort, flow, momentum, displacement, or connecting
- Assign variable roles: independent (driver), dependent (response), exogenous (external), performance (output metric)
- Where applicable, derive power-law relationships (dimensionless pi-groups using LASSO/OLS dimensional analysis)
- Use MTF for modulated transformers (signal-controlled coupling), MGY for modulated gyrators (cross-domain transduction), CTF for control transformers (connecting variables)
- Include SI dimension exponents {M,L,T,I,Θ,N,J} for each variable where known

Generate a complete FunctionalModel JSON with domain: "functional".`;
  }
  return `You are an expert Odum ESL modelling assistant for MDK. Generate a valid Odum Energy Systems Language model JSON with nodes (Source/Storage/Consumer/Interaction/Transaction) and edges (flow/control/feedback).`;
}

export class GeminiProvider implements LlmProvider {
  constructor(private readonly apiKey: string) {}

  async generateModel(opts: GenerateModelOpts): Promise<string> {
    const schema = schemaForDomain(opts.domain);
    const systemPrompt = systemPromptForDomain(opts.domain, opts);
    const payload = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: opts.description }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    };
    const raw = await postGemini(this.apiKey, payload);
    const text = extractText(raw);
    if (!text) return JSON.stringify({ error: 'Gemini returned empty response', raw });

    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const missingParams = Array.isArray(parsed.missing_parameters) ? parsed.missing_parameters : [];
      return JSON.stringify({ model: parsed, missing_parameters: missingParams });
    } catch {
      return JSON.stringify({ error: 'Gemini returned invalid JSON', text });
    }
  }

  async explain(opts: ExplainOpts): Promise<string> {
    const contextParts = [
      `User: "${opts.userMessage}"`,
      `Validation: ${opts.validationResult.slice(0, 300)}`,
      `Simulation: ${opts.simResult.slice(0, 300)}`,
    ];
    if (opts.verifyResult) contextParts.push(`Requirements: ${opts.verifyResult.slice(0, 200)}`);

    const raw = await postGemini(this.apiKey, {
      system_instruction: { parts: [{ text: EXPLAIN_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: contextParts.join('\n') }] }],
    });
    return extractText(raw) || 'SysML → Bond Graph model generated.';
  }
}
