import { z } from 'zod';

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

export const OdumNode = z.object({
  id: z.string().min(1),
  type: z.enum(['storage', 'source', 'sink', 'constant']),
  value: z.number(),
  visual: VisualNode.optional(),
}).strict();

export const OdumEdge = z.object({
  id: z.string().optional(),
  origin: z.string(),
  target: z.string(),
  logic: z.enum(['constant', 'linear', 'interaction', 'limit', 'threshold']),
  params: z.object({
    k: z.number(),
    control_node: z.string().optional(),
    threshold: z.number().optional(),
  }).strict(),
  visual: VisualEdge.optional(),
}).strict();

export const SimConfig = z.object({
  t_start: z.number().default(0),
  t_end: z.number().default(100),
  dt: z.number().positive().default(0.1),
  method: z.enum(['euler', 'rk4']).default('euler'),
}).strict();

export const OdumEslModel = z.object({
  schemaVersion: z.literal('1.0').optional(),
  domain: z.literal('odum-esl').optional(),
  nodes: z.array(OdumNode).min(1),
  edges: z.array(OdumEdge).optional(),
  config: SimConfig.optional(),
  metadata: z.record(z.unknown()).optional(),
}).strict();

export type OdumEslModel = z.infer<typeof OdumEslModel>;
export type OdumNode = z.infer<typeof OdumNode>;
export type OdumEdge = z.infer<typeof OdumEdge>;
export type SimConfig = z.infer<typeof SimConfig>;
