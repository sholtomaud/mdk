/**
 * SysML v2 structural subset — elements that matter for MDK's BG mapping.
 *
 * Derived from OMG SysML v2 PSM JSON (openapi.yaml REST binding).
 * Only the modeling elements are captured here; the versioning/commit
 * layer (Project, Branch, Commit, DataVersion) lives in sysml_v2.yaml.
 *
 * MDK extension: `bgMapping` fields on PortUsage and ItemDefinition
 * carry the effort/flow variable names needed to generate correct BG bonds.
 */

import { z } from 'zod';

/* ── Base ─────────────────────────────────────────────────────────────*/

/** Reference to another SysML element by @id */
export const SysmlRef = z.object({
  '@id': z.string().min(1),
}).strict();

/** Fields shared by every SysML element */
const SysmlBase = z.object({
  '@id':        z.string().min(1),
  '@type':      z.string(),
  name:         z.string().optional(),
  description:  z.string().optional(),
  /**
   * Deployment Identity — links the model element to a real-world resource.
   * May be a concrete string (ARN, serial number, SKU) or a Token placeholder
   * `${Token[<key>]}` resolved by the Inflight system before simulation.
   */
  externalId:   z.string().optional(),
  /**
   * Commercial/vendor metadata used for BOM generation and the Purchases Agent.
   * Informational only — not used by the physics kernel.
   */
  metadata:     z.record(z.unknown()).optional(),
});

/* ── ItemDefinition ───────────────────────────────────────────────────
 * What flows through FlowConnections.
 * Examples: ElectricalCurrent, HydraulicFlow, HeatFlux, MechanicalForce
 */
export const ItemDefinition = SysmlBase.extend({
  '@type': z.literal('ItemDefinition'),
  name: z.string(),
  bgMapping: z.object({
    effortVariable: z.string().optional(),  // e.g. 'voltage', 'pressure', 'force'
    flowVariable:   z.string().optional(),  // e.g. 'current', 'flow_rate', 'velocity'
    domain: z.enum(['electrical', 'hydraulic', 'mechanical', 'thermal', 'chemical', 'economic', 'generic']).optional(),
  }).optional(),
});

/* ── PortDefinition ───────────────────────────────────────────────────
 * Typed port definition — reusable across parts.
 */
export const PortDefinition = SysmlBase.extend({
  '@type': z.literal('PortDefinition'),
  name: z.string(),
  itemFlow: SysmlRef.optional(),  // ref to ItemDefinition
  direction: z.enum(['in', 'out', 'inout']).default('inout'),
});

/* ── PortUsage ────────────────────────────────────────────────────────
 * Port instance on a PartUsage or PartDefinition.
 * bgMapping.junctionType controls whether this port is a J0 (common
 * effort) or J1 (common flow) junction when mapped to BG.
 */
export const PortUsage = SysmlBase.extend({
  '@type': z.literal('PortUsage'),
  name: z.string(),
  definition: SysmlRef.optional(),    // ref to PortDefinition
  itemFlow:   SysmlRef.optional(),    // ref to ItemDefinition
  direction:  z.enum(['in', 'out', 'inout']).default('inout'),
  bgMapping: z.object({
    junctionType: z.enum(['J0', 'J1']).default('J0'),
  }).optional(),
});

/* ── PartDefinition ───────────────────────────────────────────────────
 * Type definition of a sub-system component.
 * ownedFeature lists PortUsage and nested PartUsage children.
 */
export interface PartDefinition {
  '@id': string;
  '@type': 'PartDefinition';
  name: string;
  description?: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
  ownedFeature?: SysmlRef[];
  ownedElement?: SysmlElement[];
}

export const PartDefinition: z.ZodType<PartDefinition, z.ZodTypeDef, any> = SysmlBase.extend({
  '@type': z.literal('PartDefinition'),
  name: z.string(),
  ownedFeature: z.array(SysmlRef).optional(),
  ownedElement: z.array(z.lazy(() => SysmlElement)).optional(),
});

/* ── PartUsage ────────────────────────────────────────────────────────
 * Instance of a sub-system inside a hierarchy.
 */
export interface PartUsage {
  '@id': string;
  '@type': 'PartUsage';
  name: string;
  description?: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
  definition?: SysmlRef;
  ownedFeature?: SysmlRef[];
  ownedElement?: SysmlElement[];
  isComposite: boolean;
  multiplicity?: { lower: number; upper: number };
  bgMapping?: {
    elementType?: 'Se' | 'Sf' | 'R' | 'C' | 'I' | 'TF' | 'GY' | 'J0' | 'J1';
    parameter?: number | string;
  };
}

export const PartUsage: z.ZodType<PartUsage, z.ZodTypeDef, any> = SysmlBase.extend({
  '@type': z.literal('PartUsage'),
  name: z.string(),
  definition: SysmlRef.optional(),
  ownedFeature: z.array(SysmlRef).optional(),
  ownedElement: z.array(z.lazy(() => SysmlElement)).optional(),
  isComposite: z.boolean().default(true),
  multiplicity: z.object({
    lower: z.number().int().nonnegative().default(1),
    upper: z.number().int().positive().default(1),
  }).optional(),
  bgMapping: z.object({
    elementType: z.enum(['Se', 'Sf', 'R', 'C', 'I', 'TF', 'GY', 'J0', 'J1']).optional(),
    /**
     * Physical parameter value (R, C, I, modulus, etc).
     * Accepts a concrete number OR a Token placeholder string `${Token[<key>]}`
     * that will be resolved to a number before simulation via MdkSystem.resolve().
     */
    parameter:   z.union([z.number(), z.string()]).optional(),
  }).optional(),
});

/* ── FlowConnectionUsage ──────────────────────────────────────────────
 * Directed flow between ports of two PartUsages.
 * Maps to a BG bond (power bond) between the source port junction
 * and the target port junction.
 *
 * LLMs targeting SysML v2 PSM JSON emit `sourceFeature`/`targetFeature`
 * (singular object) instead of `source`/`target` (array). The preprocess
 * step normalises both naming conventions and wraps singletons into arrays.
 */
const FlowConnectionUsageShape = SysmlBase.extend({
  '@type': z.literal('FlowConnectionUsage'),
  source:   z.array(SysmlRef).min(1),
  target:   z.array(SysmlRef).min(1),
  itemFlow: SysmlRef.optional(),
  bgMapping: z.object({
    bondType: z.enum(['power_bond', 'InformationBond']).default('power_bond'),
  }).optional(),
});

export const FlowConnectionUsage = FlowConnectionUsageShape;

/* ── Requirements (T13.1) ───────────────────────────────────────────── */

export const RequirementDefinition = SysmlBase.extend({
  '@type': z.literal('RequirementDefinition'),
  name: z.string(),
  text: z.string(), // The requirement text
});

export const RequirementUsage = SysmlBase.extend({
  '@type': z.literal('RequirementUsage'),
  name: z.string(),
  definition: SysmlRef.optional(),
  text: z.string().optional(),
  /** The target element this requirement applies to (e.g. a PartUsage) */
  subject: SysmlRef.optional(),
  /** Quantitative constraint for automated verification (e.g. "x < 0.5") */
  constraint: z.string().optional(),
});

export type RequirementDefinition = z.infer<typeof RequirementDefinition>;
export type RequirementUsage      = z.infer<typeof RequirementUsage>;

/* ── SysmlPackage ─────────────────────────────────────────────────────
 * Root container for a SysML v2 model.
 * All elements are stored flat in `elements`; references use @id.
 * This matches the PSM JSON format returned by SysML v2 API endpoints.
 */
export type SysmlElement =
  | z.infer<typeof ItemDefinition>
  | z.infer<typeof PortDefinition>
  | z.infer<typeof PortUsage>
  | PartDefinition
  | PartUsage
  | z.infer<typeof FlowConnectionUsage>
  | RequirementUsage
  | RequirementDefinition;

export const SysmlElement: z.ZodType<SysmlElement, z.ZodTypeDef, any> = z.lazy(() => z.discriminatedUnion('@type', [
  ItemDefinition,
  PortDefinition,
  PortUsage,
  PartDefinition as any,
  PartUsage as any,
  FlowConnectionUsageShape,   // use the raw shape — normalization happens at package level
  RequirementUsage,
  RequirementDefinition,
]));

function normaliseFlowConn(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const r = raw as Record<string, unknown>;
  if (r['@type'] !== 'FlowConnectionUsage') return raw;
  const out: Record<string, unknown> = { ...r };
  for (const [alias, canonical] of [['sourceFeature', 'source'], ['targetFeature', 'target']] as const) {
    if (out[alias] !== undefined && out[canonical] === undefined) out[canonical] = out[alias];
  }
  for (const field of ['source', 'target'] as const) {
    if (out[field] !== undefined && !Array.isArray(out[field])) out[field] = [out[field]];
  }
  return out;
}

export const SysmlPackage = z.object({
  '@id':       z.string().min(1),
  '@type':     z.literal('Package'),
  name:        z.string().optional(),
  description: z.string().optional(),
  elements:    z.preprocess(
    (arr) => Array.isArray(arr) ? arr.map(normaliseFlowConn) : arr,
    z.array(SysmlElement),
  ),
}).refine(
  pkg => pkg.elements.some(e => e['@type'] === 'FlowConnectionUsage'),
  { message: 'SysmlPackage must contain at least one FlowConnectionUsage — a model with no flow connections has no bonds and cannot be transpiled' },
);

/* ── Exported types ───────────────────────────────────────────────────*/
export type SysmlRef             = z.infer<typeof SysmlRef>;
export type ItemDefinition       = z.infer<typeof ItemDefinition>;
export type PortDefinition       = z.infer<typeof PortDefinition>;
export type PortUsage            = z.infer<typeof PortUsage>;
export type FlowConnectionUsage  = z.infer<typeof FlowConnectionUsage>;
export type SysmlPackage         = z.infer<typeof SysmlPackage>;

