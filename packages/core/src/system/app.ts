import { Element, PowerBond } from '../elements/base.js';
import { BondGraphModel, SimConfig } from '../schema/bondgraph.js';
import { TokenResolver, Token } from './token.js';
import type { ResolutionContext } from './token.js';
import type { z } from 'zod';

type SimConfigInput = z.input<typeof SimConfig>;


/* ── MdkSystem ───────────────────────────────────────────────────── *
 * A self-contained Bond Graph sub-system.  Elements and bonds are
 * registered here; synth() serialises to a BondGraphModel JSON object
 * validated by Zod before being passed to the sim-kernel.
 */
export class MdkSystem {
  private readonly _elements: Element[] = [];

  constructor(public readonly name: string) {}

  add(...elems: Element[]): this {
    for (const el of elems) this._elements.push(el);
    return this;
  }

  get elements(): readonly Element[] {
    return this._elements;
  }

  get bonds(): PowerBond[] {
    /* Collect unique bonds by id */
    const seen = new Set<number>();
    const result: PowerBond[] = [];
    for (const el of this._elements) {
      for (const b of el.bonds) {
        if (!seen.has(b.id)) { seen.add(b.id); result.push(b); }
      }
    }
    return result;
  }

  synth(config?: SimConfigInput, initialState?: Record<string, number>): BondGraphModel {
    /* Re-assign sequential IDs based on registration order */
    const idMap = new Map<number, number>();
    this._elements.forEach((el, idx) => idMap.set(el.id, idx));

    const elements = this._elements.map((el, idx) => ({
      id: idx,
      name: el.name,
      type: el.type,
      parameter: el.parameter,
    }));

    const bonds = this.bonds.map((b, idx) => ({
      id: idx,
      source: idMap.get(b.source.id) ?? b.source.id,
      target: idMap.get(b.target.id) ?? b.target.id,
    }));

    const model: Record<string, unknown> = {
      schemaVersion: '1.0' as const,
      domain: 'bondgraph' as const,
      elements,
      bonds,
    };
    if (config)       model['config'] = config;
    if (initialState) model['initial_state'] = initialState;

    return BondGraphModel.parse(model);
  }

  /**
   * Resolves all Token placeholders in the synth'd model using the
   * provided ResolutionContext and returns a fully-numeric BondGraphModel
   * ready for the sim-kernel.
   *
   * Throws `TokenResolutionError` if any token cannot be resolved.
   */
  resolve(context: ResolutionContext, config?: SimConfigInput, initialState?: Record<string, number>): BondGraphModel {
    const resolver = new TokenResolver(context);
    const synthed = this.synth(config, initialState);
    return resolver.resolve(synthed) as BondGraphModel;
  }
}

/* ── BOM types ───────────────────────────────────────────────────── */

export interface BomEntry {
  systemName: string;
  elementName: string;
  elementType: string;
  /** Concrete numeric value or Token placeholder if still unresolved. */
  parameter: number | string;
  /** True if the parameter is a Token placeholder pending resolution. */
  isPending: boolean;
  externalId?: string;
  metadata?: Record<string, unknown>;
}

/* ── MdkStack ────────────────────────────────────────────────────── *
 * Logical grouping of MdkSystems (analogous to an AWS CDK stack).
 * Synthesis traverses all child systems.
 */
export class MdkStack {
  private readonly _systems: MdkSystem[] = [];

  constructor(public readonly name: string) {}

  addSystem(system: MdkSystem): this {
    this._systems.push(system);
    return this;
  }

  get systems(): readonly MdkSystem[] {
    return this._systems;
  }

  /**
   * Exports a machine-readable Bill of Materials for all elements across
   * all systems in this stack. Elements with unresolved Token parameters
   * are flagged as `isPending: true` for the Purchases Agent.
   */
  exportBOM(): BomEntry[] {
    const bom: BomEntry[] = [];

    for (const system of this._systems) {
      for (const el of system.elements) {
        const param = el.parameter;
        const isPending = typeof param === 'string' && Token.isToken(param);
        bom.push({
          systemName:  system.name,
          elementName: el.name,
          elementType: el.type,
          parameter:   param as number | string,
          isPending,
          externalId:  (el as unknown as { externalId?: string }).externalId,
          metadata:    (el as unknown as { metadata?: Record<string, unknown> }).metadata,
        });
      }
    }

    return bom;
  }
}

/* ── MdkApp ──────────────────────────────────────────────────────── *
 * Root container.  Call app.synth() to produce the full model JSON.
 */
export class MdkApp {
  private readonly _stacks: MdkStack[] = [];

  addStack(stack: MdkStack): this {
    this._stacks.push(stack);
    return this;
  }

  get stacks(): readonly MdkStack[] {
    return this._stacks;
  }
}
