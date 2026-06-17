import { z } from 'zod';

export const BG_ELEMENT_TYPES = [
  'Se', 'Sf', 'R', 'C', 'I', 'TF', 'GY', 'J0', 'J1',
  'FractionalC', 'FractionalR',
  'MTF', 'MGY', 'CTF',
] as const;

export type BgElementType = typeof BG_ELEMENT_TYPES[number];

const VisualNode = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  label: z.string().optional(),
}).strict();

const VisualEdge = z.object({
  cpx1: z.number().optional(),
  cpy1: z.number().optional(),
  cpx2: z.number().optional(),
  cpy2: z.number().optional(),
  label: z.string().optional(),
}).strict();

export const BgElement = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().min(1),
  type: z.enum(BG_ELEMENT_TYPES),
  /**
   * Physical parameter value (R, C, I, modulus, gyration coefficient, etc).
   * Accepts a concrete number OR a Token placeholder string `${Token[<key>]}`.
   * Must be resolved to a number by MdkSystem.resolve() before runKernel().
   */
  parameter: z.union([z.number(), z.string()]),
  alpha: z.number().gt(0).lt(1).optional(),
  visual: VisualNode.optional(),
  /**
   * Deployment Identity — links this element to a real-world resource.
   * e.g. an AWS ARN, a hardware serial number, or a vendor SKU.
   * May be a concrete string or a Token placeholder `${Token[<key>]}`.
   */
  externalId: z.string().optional(),
  /**
   * Commercial/vendor metadata for BOM generation and the Purchases Agent.
   * Informational only — not used by the physics kernel.
   */
  metadata: z.record(z.unknown()).optional(),
}).strict();

export const BgBond = z.object({
  id: z.number().int().nonnegative(),
  source: z.number().int().nonnegative(),
  target: z.number().int().nonnegative(),
  type: z.enum(['power_bond', 'InformationBond']).default('power_bond'),
  visual: VisualEdge.optional(),
}).strict();

export const SimConfig = z.object({
  t_start: z.number().default(0),
  t_end: z.number().default(1),
  dt: z.number().positive().default(0.01),
  method: z.enum(['euler', 'rk4']).default('rk4'),
}).strict();

/**
 * Domain analogy context for non-energy BG applications (information, cloud, economic).
 * Carries unit labels and cost coefficients so simulation output can be annotated
 * and integrated to produce cost estimates (effort_unit × flow_unit = cost/s).
 */
const DomainContext = z.object({
  analogy:        z.string().describe('Named analogy: e.g. "aws-information", "hydraulic", "thermal"'),
  effort_unit:    z.string().describe('Unit of effort variable, e.g. "$/GB", "Pa", "V"'),
  flow_unit:      z.string().describe('Unit of flow variable, e.g. "GB/s", "m³/s", "A"'),
  quantity_unit:  z.string().describe('Unit of stored quantity, e.g. "GB", "m³", "C"'),
  cost_per_unit:  z.record(z.number()).optional().describe('Cost coefficients keyed by element name, e.g. {"S3Bucket": 0.023}'),
}).strict();

export const BondGraphModel = z.object({
  schemaVersion:  z.literal('1.0').optional(),
  domain:         z.literal('bondgraph'),
  elements:       z.array(BgElement).min(1),
  bonds:          z.array(BgBond),
  initial_state:  z.record(z.number()).optional(),
  config:         SimConfig.optional(),
  domain_context: DomainContext.optional(),
  metadata:       z.record(z.unknown()).optional(),
}).strict();

export type BondGraphModel = z.infer<typeof BondGraphModel>;
export type BgElement = z.infer<typeof BgElement>;
export type BgBond = z.infer<typeof BgBond>;
export type SimConfig = z.infer<typeof SimConfig>;
