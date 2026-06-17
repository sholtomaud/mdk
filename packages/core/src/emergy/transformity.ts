/**
 * Emergy and transformity analysis for Odum ESL models.
 *
 * Reference:
 *   Odum, H.T. (1988). Self-organization, transformity and information.
 *   Science 242, 1132–1139.
 *
 * Definitions
 * ───────────
 * Emergy (Em): the total solar energy previously used, directly or
 *   indirectly, to make a product or service.  Unit: sej (solar emjoule).
 *
 * Transformity (τ): Em/Ex = emergy per unit exergy.  Unit: sej/J.
 *   Solar radiation baseline: τ_solar = 1 sej/J.
 *
 * Algebra (non-conservative — Odum's rule):
 *   For a linear donor-controlled flow from node j to node i:
 *     flow_ji = k_ji · Q_j
 *     Em_flow_ji = τ_j · flow_ji
 *
 *   Transformity of receiving node (at pseudo-steady-state):
 *     τ_i = Σ_j Em_flow_ji  /  Q_i_outflow_rate
 *           where Q_i_outflow_rate = Q_i · Σ_k k_ik  (sum outgoing rates)
 *
 *   Co-production (multiple inputs to one node): each input contribution
 *   adds to the numerator (Σ Em_flow), giving a high transformity product
 *   when a rare high-quality input is combined with large low-quality inputs.
 *
 * Algorithm
 * ─────────
 * 1. Initialise τ for source nodes from caller-supplied TransformityInit[].
 * 2. Iteratively propagate τ downstream until convergence (Jacobi iterations).
 * 3. Compute Em = τ · Q for every node, and Em_flow for every edge.
 */

import type { OdumEslModel, OdumEdge } from '../schema/odum-esl.js';

/* ── Public types ────────────────────────────────────────────────── */

export interface TransformityInit {
  nodeId:       string;
  transformity: number;   // [sej/J]
}

export interface EmergyResult {
  nodeEmergy:       Record<string, number>;   // τ_i · Q_i   [sej]
  nodeTransformity: Record<string, number>;   // τ_i         [sej/J]
  flowEmergy:       Record<string, number>;   // τ_j · flow  [sej/time]
  empower:          number;                   // total throughput [sej/time]
}

export interface EmergyBalance {
  totalEmpower:      number;   // total emergy throughput [sej/time]
  sourceEmpower:     number;   // emergy entering from sources [sej/time]
  sinkEmpower:       number;   // emergy leaving through sinks [sej/time]
  renewableFraction: number;   // sourceEmpower / totalEmpower
}

/* ── Internal helpers ────────────────────────────────────────────── */

function nodeValue(
  nodeId: string,
  currentState: Record<string, number>,
  modelNodes: OdumEslModel['nodes'],
): number {
  if (Object.prototype.hasOwnProperty.call(currentState, nodeId)) {
    return currentState[nodeId];
  }
  return modelNodes.find(n => n.id === nodeId)?.value ?? 0;
}

function edgeFlow(edge: OdumEdge, Q_origin: number): number {
  /* Linear donor-controlled flow: f = k · Q_origin */
  return edge.params.k * Q_origin;
}

/* ── Main computation ────────────────────────────────────────────── */

/**
 * Compute emergy and transformity for all nodes in an Odum ESL model.
 *
 * @param model       Odum ESL model (nodes + edges)
 * @param currentState  current stock values by node id (overrides model.value)
 * @param sources     initial transformities for source/constant nodes
 */
export function computeEmergy(
  model: OdumEslModel,
  currentState: Record<string, number>,
  sources: TransformityInit[],
): EmergyResult {
  const edges   = model.edges ?? [];
  const nodes   = model.nodes;

  /* Initialise transformity map */
  const tau = new Map<string, number>();
  for (const node of nodes) tau.set(node.id, 0);
  for (const s of sources)  tau.set(s.nodeId, s.transformity);

  /* Pre-compute current stock values */
  const Q = new Map<string, number>();
  for (const node of nodes) Q.set(node.id, nodeValue(node.id, currentState, nodes));

  /* Build outgoing-edge index */
  const outgoing = new Map<string, OdumEdge[]>();
  for (const node of nodes) outgoing.set(node.id, []);
  for (const edge of edges) outgoing.get(edge.origin)?.push(edge);

  /* Build incoming-edge index */
  const incoming = new Map<string, OdumEdge[]>();
  for (const node of nodes) incoming.set(node.id, []);
  for (const edge of edges) incoming.get(edge.target)?.push(edge);

  /* ── Iterative propagation (Jacobi, max 500 iterations) ──────── */
  const MAX_ITER = 500;
  const TOL      = 1e-9;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    let maxDelta = 0;

    for (const node of nodes) {
      /* Source and constant nodes: τ is fixed by the caller */
      if (node.type === 'source' || node.type === 'constant') continue;

      const inEdges = incoming.get(node.id) ?? [];
      if (inEdges.length === 0) continue;

      /* Σ (τ_j · flow_ji) = total empower arriving at node i */
      let totalEmIn = 0;
      for (const edge of inEdges) {
        const Q_origin = Q.get(edge.origin) ?? 0;
        const flow     = edgeFlow(edge, Q_origin);
        totalEmIn     += (tau.get(edge.origin) ?? 0) * flow;
      }

      /* Outflow rate of node i = Q_i · Σ_k k_ik  */
      const outEdges      = outgoing.get(node.id) ?? [];
      const outflowRate   = outEdges.reduce((s, e) => s + e.params.k * (Q.get(node.id) ?? 0), 0);

      const tauNew = outflowRate > 0 ? totalEmIn / outflowRate : totalEmIn;

      const delta = Math.abs(tauNew - (tau.get(node.id) ?? 0));
      if (delta > maxDelta) maxDelta = delta;
      tau.set(node.id, tauNew);
    }

    if (maxDelta < TOL) break;
  }

  /* ── Build result ─────────────────────────────────────────────── */
  const nodeEmergy:       Record<string, number> = {};
  const nodeTransformity: Record<string, number> = {};
  const flowEmergy:       Record<string, number> = {};

  for (const node of nodes) {
    const t = tau.get(node.id) ?? 0;
    nodeTransformity[node.id] = t;
    nodeEmergy[node.id]       = t * (Q.get(node.id) ?? 0);
  }

  let totalEmpower = 0;
  for (const edge of edges) {
    const Q_origin = Q.get(edge.origin) ?? 0;
    const flow     = edgeFlow(edge, Q_origin);
    const emFlow   = (tau.get(edge.origin) ?? 0) * flow;
    const key      = edge.id ?? `${edge.origin}_${edge.target}`;
    flowEmergy[key] = emFlow;
    totalEmpower   += emFlow;
  }

  return { nodeEmergy, nodeTransformity, flowEmergy, empower: totalEmpower };
}

/* ── Balance summary ─────────────────────────────────────────────── */

export function emergyBalance(
  model:        OdumEslModel,
  currentState: Record<string, number>,
  sources:      TransformityInit[],
): EmergyBalance {
  const result = computeEmergy(model, currentState, sources);
  const edges  = model.edges ?? [];
  const nodes  = model.nodes;

  /* Source empower: emergy leaving source/constant nodes */
  const sourceIds = new Set(
    nodes.filter(n => n.type === 'source' || n.type === 'constant').map(n => n.id),
  );
  /* Sink empower: emergy arriving at sink nodes */
  const sinkIds = new Set(
    nodes.filter(n => n.type === 'sink').map(n => n.id),
  );

  let sourceEmpower = 0;
  let sinkEmpower   = 0;

  for (const edge of edges) {
    const key     = edge.id ?? `${edge.origin}_${edge.target}`;
    const emFlow  = result.flowEmergy[key] ?? 0;
    if (sourceIds.has(edge.origin)) sourceEmpower += emFlow;
    if (sinkIds.has(edge.target))   sinkEmpower   += emFlow;
  }

  const totalEmpower      = result.empower;
  const renewableFraction = totalEmpower > 0 ? sourceEmpower / totalEmpower : 0;

  return {
    totalEmpower,
    sourceEmpower,
    sinkEmpower,
    renewableFraction: Math.min(1, Math.max(0, renewableFraction)),
  };
}
