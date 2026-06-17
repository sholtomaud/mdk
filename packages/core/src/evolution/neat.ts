import { type BgElementType } from '../schema/bondgraph.js';

/**
 * NodeGene represents a physical element or junction in the Bond Graph.
 */
export interface NodeGene {
  innovation: number;
  type: BgElementType;
  parameter: number;
}

/**
 * BondGene represents a power connection between two nodes.
 */
export interface BondGene {
  innovation: number;
  fromInnovation: number;
  toInnovation: number;
  enabled: boolean;
}

/**
 * InnovationTracker ensures that identical structural mutations across the 
 * population share the same historical marking (innovation number).
 */
export class InnovationTracker {
  private _nextId = 1;
  private _mutations = new Map<string, number>();

  getInnovation(key: string): number {
    if (this._mutations.has(key)) {
      return this._mutations.get(key)!;
    }
    const id = this._nextId++;
    this._mutations.set(key, id);
    return id;
  }
}

/**
 * NeatGenome is the genetic representation of a Bond Graph topology.
 */
export class NeatGenome {
  public fitness: number = 0;

  constructor(
    public nodes: NodeGene[] = [],
    public bonds: BondGene[] = []
  ) {}

  clone(): NeatGenome {
    return new NeatGenome(
      this.nodes.map(n => ({ ...n })),
      this.bonds.map(b => ({ ...b }))
    );
  }

  /**
   * Calculates the genomic distance between two individuals (compatibility).
   * Used for speciation.
   */
  static compatibility(g1: NeatGenome, g2: NeatGenome, c1 = 1.0, c2 = 1.0, c3 = 0.4): number {
    const maxInnovation1 = Math.max(0, ...g1.bonds.map(b => b.innovation), ...g1.nodes.map(n => n.innovation));
    const maxInnovation2 = Math.max(0, ...g2.bonds.map(b => b.innovation), ...g2.nodes.map(n => n.innovation));
    const N = Math.max(1, g1.bonds.length + g1.nodes.length, g2.bonds.length + g2.nodes.length);

    let disjoint = 0;
    let excess = 0;
    let weightDiff = 0;
    let matching = 0;

    const allInno1 = new Set([...g1.nodes.map(n => n.innovation), ...g1.bonds.map(b => b.innovation)]);
    const allInno2 = new Set([...g2.nodes.map(n => n.innovation), ...g2.bonds.map(b => b.innovation)]);
    const allInnovations = new Set([...allInno1, ...allInno2]);

    for (const id of allInnovations) {
      const in1 = allInno1.has(id);
      const in2 = allInno2.has(id);

      if (in1 && in2) {
        matching++;
        // For simplicity, we just compare parameters of nodes if they match
        const n1 = g1.nodes.find(n => n.innovation === id);
        const n2 = g2.nodes.find(n => n.innovation === id);
        if (n1 && n2) {
          weightDiff += Math.abs(n1.parameter - n2.parameter);
        }
      } else if (in1) {
        if (id > maxInnovation2) excess++; else disjoint++;
      } else if (in2) {
        if (id > maxInnovation1) excess++; else disjoint++;
      }
    }

    const avgWeightDiff = matching > 0 ? weightDiff / matching : 0;
    return (c1 * excess / N) + (c2 * disjoint / N) + (c3 * avgWeightDiff);
  }
}
