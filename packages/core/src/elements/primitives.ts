import { Element } from './base.js';
import type { PhysicalDomain, VisualMeta } from './base.js';

/* ── L1 primitives ───────────────────────────────────────────────── */

export class Se extends Element {
  constructor(name: string, opts: { parameter: number; domain?: PhysicalDomain; visual?: VisualMeta }) {
    super(name, 'Se', opts.parameter, opts.domain ?? 'generic', opts.visual);
  }
}

export class Sf extends Element {
  constructor(name: string, opts: { parameter: number; domain?: PhysicalDomain; visual?: VisualMeta }) {
    super(name, 'Sf', opts.parameter, opts.domain ?? 'generic', opts.visual);
  }
}

export class R extends Element {
  constructor(name: string, opts: { parameter: number; domain?: PhysicalDomain; visual?: VisualMeta }) {
    super(name, 'R', opts.parameter, opts.domain ?? 'generic', opts.visual);
  }
}

export class C extends Element {
  constructor(name: string, opts: { parameter: number; domain?: PhysicalDomain; visual?: VisualMeta }) {
    super(name, 'C', opts.parameter, opts.domain ?? 'generic', opts.visual);
  }
}

export class I extends Element {
  constructor(name: string, opts: { parameter: number; domain?: PhysicalDomain; visual?: VisualMeta }) {
    super(name, 'I', opts.parameter, opts.domain ?? 'generic', opts.visual);
  }
}

export class TF extends Element {
  constructor(name: string, opts: { parameter: number; visual?: VisualMeta }) {
    super(name, 'TF', opts.parameter, 'generic', opts.visual);
  }
}

export class GY extends Element {
  constructor(name: string, opts: { parameter: number; visual?: VisualMeta }) {
    super(name, 'GY', opts.parameter, 'generic', opts.visual);
  }
}

export class J0 extends Element {
  constructor(name: string, opts?: { visual?: VisualMeta }) {
    super(name, 'J0', 0, 'generic', opts?.visual);
  }
}

export class J1 extends Element {
  constructor(name: string, opts?: { visual?: VisualMeta }) {
    super(name, 'J1', 0, 'generic', opts?.visual);
  }
}
