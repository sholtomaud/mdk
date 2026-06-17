import { describe, it, expect, beforeEach } from 'vitest';
import { Se, R, C, I, J1, J0, GY } from '../elements/primitives.js';
import { Element, PowerBond } from '../elements/base.js';
import { MdkSystem } from '../system/app.js';
import { BondGraphModel } from '../schema/bondgraph.js';

beforeEach(() => {
  Element.resetIds();
  PowerBond.resetIds();
});

describe('MdkSystem.synth()', () => {
  it('serialises a valid RC circuit without error', () => {
    const sys = new MdkSystem('RC');
    const vsrc = new Se('Vsrc', { parameter: 12.0, domain: 'electrical' });
    const j1   = new J1('J1');
    const r    = new R ('R1', { parameter: 100.0, domain: 'electrical' });
    const cap  = new C ('C1', { parameter: 0.001, domain: 'electrical' });

    vsrc.bond(j1); j1.bond(r); j1.bond(cap);
    sys.add(vsrc, j1, r, cap);

    const model = sys.synth({ t_start: 0, t_end: 0.5, dt: 0.001, method: 'rk4' });

    expect(model.domain).toBe('bondgraph');
    expect(model.elements).toHaveLength(4);
    expect(model.bonds).toHaveLength(3);
    expect(model.config?.method).toBe('rk4');
    expect(BondGraphModel.safeParse(model).success).toBe(true);
  });

  it('assigns sequential IDs starting from 0', () => {
    const sys = new MdkSystem('test');
    const se = new Se('A', { parameter: 1.0 });
    const c  = new C ('B', { parameter: 0.1 });
    se.bond(c);
    sys.add(se, c);
    const model = sys.synth();
    expect(model.elements[0].id).toBe(0);
    expect(model.elements[1].id).toBe(1);
    expect(model.bonds[0].source).toBe(0);
    expect(model.bonds[0].target).toBe(1);
  });

  it('throws on domain mismatch between non-junction elements', () => {
    const elec = new Se('V', { parameter: 5.0, domain: 'electrical' });
    const mech = new I ('M', { parameter: 1.0, domain: 'mechanical_translation' });
    expect(() => elec.bond(mech)).toThrow(/Domain mismatch/);
  });

  it('allows cross-domain bond via GY', () => {
    const elec = new Se('V', { parameter: 5.0, domain: 'electrical' });
    const gy   = new GY('Motor', { parameter: 0.1 });
    expect(() => elec.bond(gy)).not.toThrow();
  });

  it('validate-only synth (no config) produces valid schema', () => {
    const sys = new MdkSystem('validate');
    const se = new Se('Se', { parameter: 5.0 });
    const c  = new C ('C1', { parameter: 0.01 });
    se.bond(c);
    sys.add(se, c);
    const model = sys.synth();
    expect(model.config).toBeUndefined();
    expect(BondGraphModel.safeParse(model).success).toBe(true);
  });
});

describe('BondGraphModel Zod schema (T5.1)', () => {
  it('rejects missing elements array', () => {
    const result = BondGraphModel.safeParse({ domain: 'bondgraph', bonds: [] });
    expect(result.success).toBe(false);
  });

  it('rejects unknown element type', () => {
    const result = BondGraphModel.safeParse({
      domain: 'bondgraph',
      elements: [{ id: 0, name: 'X', type: 'Z', parameter: 1.0 }],
      bonds: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative element id', () => {
    const result = BondGraphModel.safeParse({
      domain: 'bondgraph',
      elements: [{ id: -1, name: 'X', type: 'R', parameter: 1.0 }],
      bonds: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a complete valid model', () => {
    const result = BondGraphModel.safeParse({
      schemaVersion: '1.0',
      domain: 'bondgraph',
      elements: [
        { id: 0, name: 'Se', type: 'Se', parameter: 12 },
        { id: 1, name: 'C1', type: 'C',  parameter: 0.001 },
      ],
      bonds: [{ id: 0, source: 0, target: 1 }],
    });
    expect(result.success).toBe(true);
  });
});
