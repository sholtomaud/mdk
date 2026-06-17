import type { z } from 'zod';
import type { OdumEslModel } from '../schema/odum-esl.js';
import type { BondGraphModel } from '../schema/bondgraph.js';

/**
 * Transpile an Odum ESL model to an equivalent Bond Graph.
 *
 * Mapping:
 *   source   → Se (effort source, e = node.value)
 *   storage  → C  (C = 1, so effort = stored quantity; initial_state[name] = node.value)
 *   sink     → Se (grounded, e = 0, so drain flows converge to zero potential)
 *   constant → Se (e = node.value)
 *
 * Each Odum node gets a J0 junction (common effort = stored quantity).
 * Each Odum edge becomes an R element (R = 1/k) bonded between the two J0s.
 * interaction/limit/threshold edges use the same R approximation for causality
 * purposes — their nonlinear semantics are handled by the GSSK solver.
 *
 * Why J0 (not J1) for nodes?
 *   At a J0, ONE element fixes the effort (Se or C in integral causality).
 *   All other connected bonds then determine flows via their constitutive relations.
 *   This matches the Odum convention: a node's "potential" (stored quantity) drives
 *   the flows through all edges incident on that node.
 */
export function odumToBondGraph(
  odum: z.infer<typeof OdumEslModel>,
): z.infer<typeof BondGraphModel> {
  type Elem = z.infer<typeof BondGraphModel>['elements'][number];
  type Bond = z.infer<typeof BondGraphModel>['bonds'][number];

  const elements: Elem[] = [];
  const bonds: Bond[] = [];
  const initial_state: Record<string, number> = {};
  let nextId = 1;

  const nodeToJ0 = new Map<string, number>();

  for (const node of odum.nodes) {
    const j0Id   = nextId++;
    const elemId = nextId++;
    nodeToJ0.set(node.id, j0Id);

    elements.push({ id: j0Id, name: `J0_${node.id}`, type: 'J0', parameter: 0 });

    switch (node.type) {
      case 'source':
      case 'constant':
        elements.push({ id: elemId, name: node.id, type: 'Se', parameter: node.value });
        break;
      case 'storage':
        elements.push({ id: elemId, name: node.id, type: 'C', parameter: 1 });
        initial_state[node.id] = node.value;
        break;
      case 'sink':
        elements.push({ id: elemId, name: node.id, type: 'Se', parameter: 0 });
        break;
    }

    bonds.push({ id: nextId++, source: elemId, target: j0Id, type: 'power_bond' });
  }

  for (const edge of odum.edges ?? []) {
    const originJ0 = nodeToJ0.get(edge.origin);
    const targetJ0 = nodeToJ0.get(edge.target);
    if (originJ0 === undefined || targetJ0 === undefined) continue;

    const k     = edge.params.k;
    const rId   = nextId++;
    const label = edge.id ?? `${edge.origin}_to_${edge.target}`;
    elements.push({ id: rId, name: `R_${label}`, type: 'R', parameter: k > 0 ? 1 / k : 1e9 });

    bonds.push({ id: nextId++, source: originJ0, target: rId,      type: 'power_bond' });
    bonds.push({ id: nextId++, source: rId,      target: targetJ0, type: 'power_bond' });
  }

  return {
    schemaVersion: '1.0',
    domain: 'bondgraph',
    elements,
    bonds,
    initial_state: Object.keys(initial_state).length > 0 ? initial_state : undefined,
    config: odum.config ? {
      t_start: odum.config.t_start,
      t_end:   odum.config.t_end,
      dt:      odum.config.dt,
      method:  odum.config.method,
    } : undefined,
  };
}
