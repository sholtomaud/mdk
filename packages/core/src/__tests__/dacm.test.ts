import { describe, it, expect } from 'vitest';
import {
  SiDimensions, DacmVariable, PowerLaw,
  DacmFunction, DacmSubsystem, FunctionalModel,
  VAR_CATEGORIES, VAR_ROLES,
} from '../schema/dacm.js';
import { BG_ELEMENT_TYPES } from '../schema/bondgraph.js';
import { PartUsage } from '../schema/sysml.js';

/* ── SiDimensions ─────────────────────────────────────────────────── */

describe('SiDimensions', () => {
  it('defaults all exponents to 0', () => {
    const d = SiDimensions.parse({});
    expect(d).toEqual({ M: 0, L: 0, T: 0, I: 0, Θ: 0, N: 0, J: 0 });
  });

  it('accepts partial SI exponents', () => {
    const d = SiDimensions.parse({ M: 1, L: 1, T: -2 });
    expect(d.M).toBe(1);
    expect(d.L).toBe(1);
    expect(d.T).toBe(-2);
    expect(d.I).toBe(0);
  });

  it('accepts force dimensions [M=1, L=1, T=-2]', () => {
    const result = SiDimensions.safeParse({ M: 1, L: 1, T: -2 });
    expect(result.success).toBe(true);
  });
});

/* ── DacmVariable ─────────────────────────────────────────────────── */

describe('DacmVariable', () => {
  it('parses a minimal variable (id + name + symbol)', () => {
    const v = DacmVariable.parse({ id: 'v1', name: 'Force', symbol: 'F' });
    expect(v.id).toBe('v1');
    expect(v.name).toBe('Force');
    expect(v.symbol).toBe('F');
  });

  it('accepts all VAR_CATEGORIES', () => {
    for (const cat of VAR_CATEGORIES) {
      const result = DacmVariable.safeParse({ id: 'x', name: 'x', symbol: 'x', category: cat });
      expect(result.success, `category ${cat} should be valid`).toBe(true);
    }
  });

  it('accepts all VAR_ROLES', () => {
    for (const role of VAR_ROLES) {
      const result = DacmVariable.safeParse({ id: 'x', name: 'x', symbol: 'x', role });
      expect(result.success, `role ${role} should be valid`).toBe(true);
    }
  });

  it('rejects unknown category', () => {
    const result = DacmVariable.safeParse({ id: 'x', name: 'x', symbol: 'x', category: 'energy' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown role', () => {
    const result = DacmVariable.safeParse({ id: 'x', name: 'x', symbol: 'x', role: 'constant' });
    expect(result.success).toBe(false);
  });

  it('accepts siDimensions inline', () => {
    const result = DacmVariable.safeParse({
      id: 'F', name: 'Force', symbol: 'F',
      unit: 'N',
      siDimensions: { M: 1, L: 1, T: -2 },
    });
    expect(result.success).toBe(true);
  });
});

/* ── PowerLaw ─────────────────────────────────────────────────────── */

describe('PowerLaw', () => {
  it('parses a minimal power-law relationship', () => {
    const pl = PowerLaw.parse({
      id: 'pl1',
      functionId: 'fn1',
      dependentVar: 'F',
      exponents: { v: 2, rho: 1 },
    });
    expect(pl.id).toBe('pl1');
    expect(pl.piConstant).toBe(1);
    expect(pl.exponents['v']).toBe(2);
  });

  it('defaults piConstant to 1', () => {
    const pl = PowerLaw.parse({
      id: 'pl1', functionId: 'fn1', dependentVar: 'D', exponents: {},
    });
    expect(pl.piConstant).toBe(1);
  });

  it('accepts optional dimensionlessGroup and physicalPhenomenon', () => {
    const result = PowerLaw.safeParse({
      id: 'Re', functionId: 'fn2', dependentVar: 'drag',
      exponents: { rho: 1, v: 1, L: 1, mu: -1 },
      dimensionlessGroup: 'Re',
      physicalPhenomenon: 'viscous drag',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = PowerLaw.safeParse({ id: 'pl1' });
    expect(result.success).toBe(false);
  });
});

/* ── DacmFunction ─────────────────────────────────────────────────── */

describe('DacmFunction', () => {
  it('parses a minimal function (id + name)', () => {
    const fn = DacmFunction.parse({ id: 'fn1', name: 'Dissipation' });
    expect(fn.id).toBe('fn1');
    expect(fn.variables).toBeUndefined();
  });

  it('accepts all BG_ELEMENT_TYPES as organ', () => {
    for (const t of BG_ELEMENT_TYPES) {
      const result = DacmFunction.safeParse({ id: 'f', name: 'fn', organ: t });
      expect(result.success, `organ type ${t} should be valid`).toBe(true);
    }
  });

  it('rejects unknown organ type', () => {
    const result = DacmFunction.safeParse({ id: 'f', name: 'fn', organ: 'UNKNOWN' });
    expect(result.success).toBe(false);
  });

  it('accepts variables and powerLaws arrays', () => {
    const result = DacmFunction.safeParse({
      id: 'fn1', name: 'Drag',
      variables: [{ id: 'F', name: 'Drag Force', symbol: 'F_D', category: 'effort' }],
      powerLaws: [{ id: 'pl1', functionId: 'fn1', dependentVar: 'F', exponents: { v: 2 } }],
    });
    expect(result.success).toBe(true);
  });
});

/* ── DacmSubsystem ────────────────────────────────────────────────── */

describe('DacmSubsystem', () => {
  it('parses a minimal subsystem with one function', () => {
    const sub = DacmSubsystem.parse({
      id: 's1', name: 'Aerodynamics',
      functions: [{ id: 'fn1', name: 'Drag' }],
    });
    expect(sub.id).toBe('s1');
    expect(sub.functions).toHaveLength(1);
  });

  it('accepts connector types MTF, MGY, CTF', () => {
    for (const ct of ['MTF', 'MGY', 'CTF'] as const) {
      const result = DacmSubsystem.safeParse({
        id: 's', name: 'sub', functions: [],
        connectorType: ct,
      });
      expect(result.success, `connectorType ${ct} should be valid`).toBe(true);
    }
  });

  it('rejects unknown connectorType', () => {
    const result = DacmSubsystem.safeParse({
      id: 's', name: 'sub', functions: [],
      connectorType: 'TF',
    });
    expect(result.success).toBe(false);
  });

  it('accepts connectedTo array of ids', () => {
    const result = DacmSubsystem.safeParse({
      id: 's1', name: 'A', functions: [],
      connectedTo: ['s2', 's3'],
    });
    expect(result.success).toBe(true);
  });
});

/* ── FunctionalModel ──────────────────────────────────────────────── */

describe('FunctionalModel', () => {
  const minimalModel = {
    name: 'Vehicle Dynamics',
    domain: 'functional' as const,
    subsystems: [
      {
        id: 'aero', name: 'Aerodynamics',
        functions: [{ id: 'drag', name: 'Drag Force', organ: 'R' }],
        connectorType: 'CTF' as const,
      },
    ],
  };

  it('parses a minimal FunctionalModel', () => {
    const m = FunctionalModel.parse(minimalModel);
    expect(m.name).toBe('Vehicle Dynamics');
    expect(m.domain).toBe('functional');
    expect(m.subsystems).toHaveLength(1);
  });

  it('rejects wrong domain literal', () => {
    const result = FunctionalModel.safeParse({ ...minimalModel, domain: 'bondgraph' });
    expect(result.success).toBe(false);
  });

  it('rejects empty subsystems array', () => {
    const result = FunctionalModel.safeParse({ ...minimalModel, subsystems: [] });
    expect(result.success).toBe(false);
  });

  it('accepts full model with systemVariables and objective', () => {
    const result = FunctionalModel.safeParse({
      ...minimalModel,
      objective: 'Minimise aerodynamic drag',
      systemVariables: [
        { id: 'v', name: 'Vehicle speed', symbol: 'v', category: 'flow', role: 'independent', unit: 'm/s' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts nested powerLaws inside functions', () => {
    const result = FunctionalModel.safeParse({
      name: 'Wind Turbine',
      domain: 'functional',
      subsystems: [{
        id: 'rotor', name: 'Rotor',
        functions: [{
          id: 'power', name: 'Power extraction', organ: 'TF',
          powerLaws: [{
            id: 'betz', functionId: 'power',
            dependentVar: 'P',
            piConstant: 0.593,
            exponents: { rho: 1, A: 1, v: 3 },
            physicalPhenomenon: 'Betz limit',
          }],
        }],
      }],
    });
    expect(result.success).toBe(true);
  });
});

/* ── MTF/MGY/CTF in BG_ELEMENT_TYPES ─────────────────────────────── */

describe('BG_ELEMENT_TYPES includes DACM elements', () => {
  it('includes MTF', () => {
    expect(BG_ELEMENT_TYPES).toContain('MTF');
  });
  it('includes MGY', () => {
    expect(BG_ELEMENT_TYPES).toContain('MGY');
  });
  it('includes CTF', () => {
    expect(BG_ELEMENT_TYPES).toContain('CTF');
  });
});

/* ── PartUsage varRole + varCategory ──────────────────────────────── */

describe('PartUsage varRole and varCategory', () => {
  const basePartUsage = {
    '@id': 'pu1',
    '@type': 'PartUsage' as const,
    name: 'Velocity',
    bgMapping: { elementType: 'MTF' as const, parameter: 1.0 },
  };

  it('accepts varRole: independent', () => {
    const result = PartUsage.safeParse({ ...basePartUsage, varRole: 'independent' });
    expect(result.success).toBe(true);
  });

  it('accepts varRole: dependent', () => {
    const result = PartUsage.safeParse({ ...basePartUsage, varRole: 'dependent' });
    expect(result.success).toBe(true);
  });

  it('accepts varRole: exogenous', () => {
    const result = PartUsage.safeParse({ ...basePartUsage, varRole: 'exogenous' });
    expect(result.success).toBe(true);
  });

  it('accepts varRole: performance', () => {
    const result = PartUsage.safeParse({ ...basePartUsage, varRole: 'performance' });
    expect(result.success).toBe(true);
  });

  it('rejects unknown varRole', () => {
    const result = PartUsage.safeParse({ ...basePartUsage, varRole: 'constant' });
    expect(result.success).toBe(false);
  });

  it('accepts varCategory: connecting', () => {
    const result = PartUsage.safeParse({ ...basePartUsage, varCategory: 'connecting' });
    expect(result.success).toBe(true);
  });

  it('accepts bgMapping with MTF elementType', () => {
    const result = PartUsage.safeParse({
      '@id': 'pu2', '@type': 'PartUsage', name: 'Modulator',
      bgMapping: { elementType: 'MTF', parameter: 2.5 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts bgMapping with MGY elementType', () => {
    const result = PartUsage.safeParse({
      '@id': 'pu3', '@type': 'PartUsage', name: 'Gyrator',
      bgMapping: { elementType: 'MGY', parameter: 0.8 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts bgMapping with CTF elementType', () => {
    const result = PartUsage.safeParse({
      '@id': 'pu4', '@type': 'PartUsage', name: 'Controller',
      bgMapping: { elementType: 'CTF', parameter: 1.0 },
    });
    expect(result.success).toBe(true);
  });
});
