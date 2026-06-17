import type { BondGraphModel, BgElement, BgBond } from '../schema/bondgraph.js';

/* ── Port declarations ────────────────────────────────────────────────
 * A port is a J0 or J1 junction in the block's internal model that is
 * exposed at the subsystem boundary.  Connections between blocks merge
 * the two port junctions into one, removing the artificial boundary.
 */
export interface BgPortDeclaration {
  name:        string;   // port name (unique within the block)
  junction_id: number;   // ID of the junction element inside model
}

/* ── Hierarchical block ───────────────────────────────────────────────
 * A sub-system: its internal BG model plus the ports it exposes.
 */
export interface BgHierarchicalBlock {
  id:    string;   // unique within the composed system
  name:  string;   // used for element namespacing after flatten
  model: BondGraphModel;
  ports: BgPortDeclaration[];
}

/* ── Connection between blocks ────────────────────────────────────────
 * Connects one block's port junction to another's.
 * On flatten, the two junction elements are merged into a single node.
 */
export interface BgPortConnection {
  from_block: string;  // BgHierarchicalBlock.id
  from_port:  string;  // BgPortDeclaration.name
  to_block:   string;
  to_port:    string;
}

/* ── Composed system (input to flattenBondGraph) ──────────────────────*/
export interface BgComposedSystem {
  name:        string;
  blocks:      BgHierarchicalBlock[];
  connections: BgPortConnection[];
}

/* ── flattenBondGraph ─────────────────────────────────────────────────
 * Merge a hierarchy of BG sub-models into a single flat BondGraphModel.
 *
 * Algorithm
 * ─────────
 * 1. Assign each block a global ID offset so local IDs don't collide.
 * 2. Collect all elements and bonds from all blocks (namespacing names).
 * 3. For each inter-block connection: the two port junctions represent
 *    the same physical node.  Merge them by:
 *      a. Keep the first junction (from_block side).
 *      b. Rewrite all bond source/target references of the second
 *         junction (to_block side) to point to the first.
 *      c. Remove the second junction element.
 * 4. Re-sequence all IDs starting from 1 (cosmetic, keeps downstream
 *    tools and tests stable).
 */
export function flattenBondGraph(system: BgComposedSystem): BondGraphModel {
  /* ── Step 1: assign per-block ID offsets ───────────────────────────*/
  const offsets = new Map<string, number>();
  let cursor = 0;
  for (const block of system.blocks) {
    offsets.set(block.id, cursor);
    const maxId = Math.max(
      0,
      ...block.model.elements.map(e => e.id),
      ...block.model.bonds.map(b => b.id),
    );
    cursor += maxId + 1;
  }

  /* ── Step 2: collect all elements and bonds ─────────────────────────*/
  const elements: BgElement[] = [];
  const bonds:    BgBond[]    = [];
  const initial_state: Record<string, number> = {};

  for (const block of system.blocks) {
    const off = offsets.get(block.id)!;
    for (const el of block.model.elements) {
      elements.push({ ...el, id: el.id + off, name: `${block.name}__${el.name}` });
    }
    for (const bond of block.model.bonds) {
      bonds.push({
        ...bond,
        id:     bond.id     + off,
        source: bond.source + off,
        target: bond.target + off,
      });
    }
    if (block.model.initial_state) {
      for (const [k, v] of Object.entries(block.model.initial_state)) {
        initial_state[`${block.name}__${k}`] = v;
      }
    }
  }

  /* ── Step 3: merge port junctions ───────────────────────────────────
   * Build a Union-Find map: global junction ID → canonical junction ID.
   * Then rewrite all bond endpoints accordingly and remove duplicates.
   */
  const canonical = new Map<number, number>();

  const resolve = (id: number): number => {
    let cur = id;
    while (canonical.has(cur)) cur = canonical.get(cur)!;
    return cur;
  };

  for (const conn of system.connections) {
    const fromBlock = system.blocks.find(b => b.id === conn.from_block);
    const toBlock   = system.blocks.find(b => b.id === conn.to_block);
    if (!fromBlock || !toBlock) continue;

    const fromPort = fromBlock.ports.find(p => p.name === conn.from_port);
    const toPort   = toBlock.ports.find(p => p.name === conn.to_port);
    if (!fromPort || !toPort) continue;

    const fromGlobal = resolve(fromPort.junction_id + offsets.get(fromBlock.id)!);
    const toGlobal   = resolve(toPort.junction_id   + offsets.get(toBlock.id)!);

    if (fromGlobal !== toGlobal) {
      /* Absorb toGlobal into fromGlobal */
      canonical.set(toGlobal, fromGlobal);
    }
  }

  /* Apply canonical IDs to all bonds */
  for (const bond of bonds) {
    bond.source = resolve(bond.source);
    bond.target = resolve(bond.target);
  }

  /* Remove absorbed (non-canonical) junction elements */
  const absorbed = new Set(canonical.keys());
  const flatElements = elements.filter(e => !absorbed.has(e.id));

  /* ── Step 4: re-sequence IDs from 1 ────────────────────────────────*/
  const idMap = new Map<number, number>();
  let nextId = 1;
  for (const el of flatElements) {
    idMap.set(el.id, nextId++);
  }
  for (const bond of bonds) {
    idMap.set(bond.id, nextId++);
  }

  const reseqElements: BgElement[] = flatElements.map(el => ({
    ...el,
    id: idMap.get(el.id)!,
  }));

  const reseqBonds: BgBond[] = bonds.map(bond => ({
    ...bond,
    id:     nextId++,
    source: idMap.get(bond.source) ?? bond.source,
    target: idMap.get(bond.target) ?? bond.target,
  }));

  return {
    schemaVersion: '1.0',
    domain: 'bondgraph',
    elements: reseqElements,
    bonds:    reseqBonds,
    initial_state: Object.keys(initial_state).length > 0 ? initial_state : undefined,
  };
}
