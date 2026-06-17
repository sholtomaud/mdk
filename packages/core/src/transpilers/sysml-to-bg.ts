import type { SysmlPackage, SysmlElement, PartUsage, PortUsage, FlowConnectionUsage } from '../schema/sysml.js';
import type { BondGraphModel, BgElement, BgBond } from '../schema/bondgraph.js';

/**
 * Transpile a SysML v2 structural package to a flat Bond Graph model.
 *
 * Mapping rules
 * ─────────────
 * PortUsage     → J0 (default) or J1 junction; one per port
 * FlowConnectionUsage → merges connected port junctions (union-find)
 *                       Two ports on the same node → one junction
 * PartUsage (1 port)  → BG element bonded directly to port junction
 * PartUsage (2 ports) → BG element bonded to a new J1 intermediate;
 *                       J1 is connected to both port junctions
 *                       (models difference-of-potential across the element)
 * PartUsage (0 ports) → skipped
 *
 * BG element type  comes from  bgMapping.elementType  (default: 'R')
 * BG parameter     comes from  bgMapping.parameter    (default: 1.0)
 */
export function sysmlToBondGraph(pkg: SysmlPackage): BondGraphModel {
  /* ── Step 0: Hierarchical Flattening (T14.1) ────────────────────── */
  const allElements: SysmlElement[] = [];
  const walk = (el: any, prefix = "") => {
    const namedEl = { ...el, name: prefix ? `${prefix}.${el.name}` : el.name };
    allElements.push(namedEl);
    if (el.ownedElement) {
      for (const child of el.ownedElement) walk(child, namedEl.name);
    }
  };
  for (const el of pkg.elements) walk(el);

  /* ── Index all elements by @id ──────────────────────────────────── */
  const index = new Map<string, SysmlElement>();
  for (const el of allElements) index.set(el['@id'], el);

  let nextId = 1;
  const elements: BgElement[] = [];
  const bonds:    BgBond[]    = [];

  /* ── Step 1: Junction for every PortUsage ───────────────────────── */
  const portToJunctionId = new Map<string, number>();

  for (const el of allElements) {
    if (el['@type'] !== 'PortUsage') continue;
    const port = el as PortUsage;
    const jType = port.bgMapping?.junctionType ?? 'J0';
    const jId   = nextId++;
    portToJunctionId.set(port['@id'], jId);
    elements.push({ id: jId, name: `${jType}_${port.name}`, type: jType, parameter: 0 });
  }

  /* ── Step 2: Merge or bond per FlowConnectionUsage ─────────────── *
   *                                                                    *
   * Two cases:                                                          *
   *   MERGE: both ports belong to non-junction PartUsages (Se/R/C/I…)  *
   *          → they represent the same physical wire node.              *
   *          The FlowConnectionUsage is a "same-node" declaration.      *
   *   BOND:  at least one port belongs to an explicit junction element  *
   *          PartUsage (bgMapping.elementType = 'J0' | 'J1').           *
   *          → create a power bond between the two port junctions.      *
   *                                                                     *
   * This preserves the RC-circuit series topology (all port pairs are   *
   * wire-node merges) while correctly routing through explicit J0/J1    *
   * PartUsages used as intermediate junctions (soil-water, motor…).    */

  const JUNCTION_ELEMENT_TYPES = new Set(['J0', 'J1']);

  const parent = new Map<number, number>();
  const find = (id: number): number => {
    while (parent.has(id)) id = parent.get(id)!;
    return id;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  /* portId → owning PartUsage @id + its BG element type */
  const portOwner  = new Map<string, string>();
  const partBgType = new Map<string, string>();
  for (const el of allElements) {
    if (el['@type'] !== 'PartUsage') continue;
    const pu = el as PartUsage;
    partBgType.set(pu['@id'], pu.bgMapping?.elementType ?? 'R');
    for (const ref of pu.ownedFeature ?? []) portOwner.set(ref['@id'], pu['@id']);
  }

  for (const el of allElements) {
    if (el['@type'] !== 'FlowConnectionUsage') continue;
    const conn = el as FlowConnectionUsage;
    const srcPortId = conn.source[0]['@id'];
    const tgtPortId = conn.target[0]['@id'];
    const srcJ = portToJunctionId.get(srcPortId);
    const tgtJ = portToJunctionId.get(tgtPortId);
    if (srcJ === undefined || tgtJ === undefined) continue;

    const srcIsJunction = JUNCTION_ELEMENT_TYPES.has(partBgType.get(portOwner.get(srcPortId) ?? '') ?? '');
    const tgtIsJunction = JUNCTION_ELEMENT_TYPES.has(partBgType.get(portOwner.get(tgtPortId) ?? '') ?? '');

    if (!srcIsJunction && !tgtIsJunction) {
      /* Both ports are on wire/component elements → same physical node: merge */
      union(srcJ, tgtJ);
    } else {
      /* At least one side is an explicit J0/J1 element → power bond */
      bonds.push({ id: nextId++, source: find(srcJ), target: find(tgtJ), type: 'power_bond' });
    }
  }

  /* ── Step 3: BG element + bonds per PartUsage ───────────────────── */
  for (const el of allElements) {
    if (el['@type'] !== 'PartUsage') continue;
    const part = el as PartUsage;

    /* Resolve owned ports (ownedFeature refs that are PortUsages) */
    const ownedPorts = (part.ownedFeature ?? [])
      .map(ref => index.get(ref['@id']))
      .filter((e): e is PortUsage => e?.['@type'] === 'PortUsage');

    if (ownedPorts.length === 0) continue;

    const bgType  = part.bgMapping?.elementType ?? 'R';
    const bgParam = part.bgMapping?.parameter   ?? 1.0;
    const isJunc  = bgType === 'J0' || bgType === 'J1';
    
    const bgId    = nextId++;
    elements.push({ id: bgId, name: part.name, type: bgType, parameter: bgParam });

    if (isJunc && ownedPorts.length > 0) {
      /* If the PartUsage IS a junction, merge its element ID with its port junctions
         so it becomes part of the same physical node in the union-find. */
      for (const port of ownedPorts) {
        union(bgId, portToJunctionId.get(port['@id'])!);
      }
    } else if (ownedPorts.length === 1) {
      /* 1-port non-junction: bond directly to the (canonical) port junction */
      const jId = find(portToJunctionId.get(ownedPorts[0]['@id'])!);
      bonds.push({ id: nextId++, source: bgId, target: jId, type: 'power_bond' });
    } else if (ownedPorts.length >= 2) {
      /* 2-port non-junction: J1 intermediate — element bonds to J1,
         J1 bonds to each port junction (models effort difference) */
      const j1Id = nextId++;
      elements.push({ id: j1Id, name: `J1_${part.name}`, type: 'J1', parameter: 0 });
      bonds.push({ id: nextId++, source: bgId, target: j1Id, type: 'power_bond' });
      for (const port of ownedPorts) {
        const jId = find(portToJunctionId.get(port['@id'])!);
        bonds.push({ id: nextId++, source: jId, target: j1Id, type: 'power_bond' });
      }
    }
  }

  /* ── Step 4: Remove absorbed (non-canonical) junction elements ───── */
  const flatElements = elements.filter(e => find(e.id) === e.id);

  /* Rewrite all bond endpoints through the canonical map */
  const rewrittenBonds: BgBond[] = bonds.map(b => ({
    ...b,
    source: find(b.source),
    target: find(b.target),
  }));

  /* ── Step 5: Re-sequence IDs from 1 ─────────────────────────────── */
  const idMap = new Map<number, number>();
  let reseqId = 1;
  for (const el of flatElements) idMap.set(el.id, reseqId++);

  return {
    schemaVersion: '1.0',
    domain: 'bondgraph',
    elements: flatElements.map(el => ({ ...el, id: idMap.get(el.id)! })),
    bonds: rewrittenBonds.map(b => ({
      ...b,
      id:     reseqId++,
      source: idMap.get(b.source) ?? b.source,
      target: idMap.get(b.target) ?? b.target,
    })),
  };
}
