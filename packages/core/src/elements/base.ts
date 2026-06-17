import type { BgElementType } from '../schema/bondgraph.js';

export type PhysicalDomain =
  | 'electrical'
  | 'mechanical_translation'
  | 'mechanical_rotation'
  | 'hydraulic'
  | 'thermal'
  | 'generic';

export interface VisualMeta {
  x?: number;
  y?: number;
  label?: string;
}

export class Port {
  constructor(
    public readonly element: Element,
    public readonly index: number,
  ) {}
}

export class PowerBond {
  private static _nextId = 0;
  public readonly id: number;

  constructor(
    public readonly source: Element,
    public readonly target: Element,
    public readonly bondType: 'power_bond' | 'InformationBond' = 'power_bond',
    public readonly visual?: {
      cpx1?: number; cpy1?: number;
      cpx2?: number; cpy2?: number;
      label?: string;
    },
  ) {
    this.id = PowerBond._nextId++;
  }

  static resetIds(): void {
    PowerBond._nextId = 0;
  }

  toJSON(): object {
    const out: Record<string, unknown> = {
      id: this.id,
      source: this.source.id,
      target: this.target.id,
    };
    if (this.bondType !== 'power_bond') out['type'] = this.bondType;
    if (this.visual) out['visual'] = this.visual;
    return out;
  }
}

export abstract class Element {
  private static _nextId = 0;
  public readonly id: number;
  public readonly bonds: PowerBond[] = [];

  constructor(
    public readonly name: string,
    public readonly type: BgElementType,
    public readonly parameter: number,
    public readonly domain: PhysicalDomain = 'generic',
    public readonly visual?: VisualMeta,
  ) {
    this.id = Element._nextId++;
  }

  static resetIds(): void {
    Element._nextId = 0;
  }

  bond(target: Element, bondType: PowerBond['bondType'] = 'power_bond'): PowerBond {
    /* Domain compatibility check: both elements must share a domain, or one
     * must be a junction / two-port (TF/GY) which bridges domains. */
    if (this.domain !== 'generic' && target.domain !== 'generic' &&
        this.domain !== target.domain &&
        target.type !== 'TF' && target.type !== 'GY' &&
        this.type !== 'TF' && this.type !== 'GY' &&
        target.type !== 'J0' && target.type !== 'J1' &&
        this.type !== 'J0' && this.type !== 'J1') {
      throw new Error(
        `Domain mismatch: cannot bond ${this.name} (${this.domain}) ` +
        `to ${target.name} (${target.domain}) without a TF or GY`
      );
    }

    const b = new PowerBond(this, target, bondType);
    this.bonds.push(b);
    target.bonds.push(b);
    return b;
  }

  toJSON(): object {
    const out: Record<string, unknown> = {
      id: this.id,
      name: this.name,
      type: this.type,
      parameter: this.parameter,
    };
    if (this.visual) out['visual'] = this.visual;
    return out;
  }
}
