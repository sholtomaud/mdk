import { describe, it, expect } from 'vitest';
import { BondGraphModel, BgElement } from '../schema/bondgraph.js';
import { SysmlPackage } from '../schema/sysml.js';

/* ── BgElement: externalId + metadata ───────────────────────────── */

describe('BgElement schema: externalId + metadata (T11.2)', () => {
  const base = { id: 0, name: 'R1', type: 'R' as const };

  it('accepts an element without externalId or metadata', () => {
    const result = BgElement.safeParse({ ...base, parameter: 100 });
    expect(result.success).toBe(true);
  });

  it('accepts a concrete string externalId (e.g. serial number)', () => {
    const result = BgElement.safeParse({
      ...base,
      parameter: 100,
      externalId: 'SN-2024-MAXON-RE40-001',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.externalId).toBe('SN-2024-MAXON-RE40-001');
  });

  it('accepts a Token placeholder as externalId', () => {
    const result = BgElement.safeParse({
      ...base,
      parameter: 100,
      externalId: '${Token[s_abc-123]}',
    });
    expect(result.success).toBe(true);
  });

  it('accepts arbitrary metadata key-value pairs', () => {
    const result = BgElement.safeParse({
      ...base,
      parameter: 100,
      metadata: {
        vendor: 'Maxon',
        stockNumber: 'SKU-9921-X',
        leadTimeDays: 14,
        datasheet: 'https://maxon.com/re40.pdf',
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata?.vendor).toBe('Maxon');
      expect(result.data.metadata?.leadTimeDays).toBe(14);
    }
  });

  it('accepts a Token placeholder string as parameter', () => {
    const result = BgElement.safeParse({
      ...base,
      parameter: '${Token[n_abc-123]}',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.parameter).toBe('string');
    }
  });

  it('accepts a concrete number as parameter (backward compat)', () => {
    const result = BgElement.safeParse({ ...base, parameter: 47.0 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.parameter).toBe(47.0);
  });
});

/* ── BondGraphModel: externalId + metadata round-trip ───────────── */

describe('BondGraphModel round-trip with externalId and metadata', () => {
  it('parses and preserves externalId and metadata through Zod', () => {
    const raw = {
      schemaVersion: '1.0',
      domain: 'bondgraph',
      elements: [
        {
          id: 0,
          name: 'Se',
          type: 'Se',
          parameter: 12.0,
          externalId: 'arn:aws:iot:us-east-1:123456789:thing/PowerSupply',
          metadata: { vendor: 'Acme', sku: 'PSU-12V-5A' },
        },
        {
          id: 1,
          name: 'Ra',
          type: 'R',
          parameter: '${Token[n_abc-123]}',   // unresolved token
          externalId: '${Token[s_xyz-456]}',  // unresolved externalId token
          metadata: { vendor: 'Maxon', sku: 'SKU-9921-X', leadTimeDays: 14 },
        },
      ],
      bonds: [{ id: 0, source: 0, target: 1 }],
    };

    const result = BondGraphModel.safeParse(raw);
    expect(result.success).toBe(true);

    if (result.success) {
      const se = result.data.elements[0];
      expect(se.externalId).toBe('arn:aws:iot:us-east-1:123456789:thing/PowerSupply');
      expect(se.metadata?.vendor).toBe('Acme');

      const ra = result.data.elements[1];
      expect(ra.parameter).toBe('${Token[n_abc-123]}');
      expect(ra.externalId).toBe('${Token[s_xyz-456]}');
      expect(ra.metadata?.leadTimeDays).toBe(14);
    }
  });
});

/* ── SysmlBase: externalId + metadata ───────────────────────────── */

describe('SysmlPackage: externalId and metadata on SysmlBase (T11.2)', () => {
  const minimalPackage = {
    '@id': 'pkg-1',
    '@type': 'Package' as const,
    elements: [
      {
        '@id': 'part-1',
        '@type': 'PartUsage' as const,
        name: 'PrimaryPump',
        bgMapping: { elementType: 'Sf' as const, parameter: 0.5 },
      },
      {
        '@id': 'port-1',
        '@type': 'PortUsage' as const,
        name: 'PumpPort',
        bgMapping: { junctionType: 'J1' as const },
      },
      {
        '@id': 'flow-1',
        '@type': 'FlowConnectionUsage' as const,
        name: 'PumpFlow',
        source: [{ '@id': 'port-1' }],
        target: [{ '@id': 'port-1' }],
      },
    ],
  };

  it('accepts PartUsage with externalId as a concrete string', () => {
    const pkg = {
      ...minimalPackage,
      elements: [
        {
          ...minimalPackage.elements[0],
          externalId: 'arn:aws:iot:us-east-1:123:thing/Pump1',
        },
        ...minimalPackage.elements.slice(1),
      ],
    };
    const result = SysmlPackage.safeParse(pkg);
    expect(result.success).toBe(true);
  });

  it('accepts PartUsage with a Token placeholder externalId', () => {
    const pkg = {
      ...minimalPackage,
      elements: [
        {
          ...minimalPackage.elements[0],
          externalId: '${Token[s_device-arn-xyz]}',
        },
        ...minimalPackage.elements.slice(1),
      ],
    };
    const result = SysmlPackage.safeParse(pkg);
    expect(result.success).toBe(true);
  });

  it('accepts PartUsage with metadata block', () => {
    const pkg = {
      ...minimalPackage,
      elements: [
        {
          ...minimalPackage.elements[0],
          metadata: {
            vendor: 'Grundfos',
            sku: 'CM1-5-A-R-I-E-AVBE',
            leadTimeDays: 21,
          },
        },
        ...minimalPackage.elements.slice(1),
      ],
    };
    const result = SysmlPackage.safeParse(pkg);
    expect(result.success).toBe(true);
    if (result.success) {
      const part = result.data.elements.find(e => e['@type'] === 'PartUsage');
      expect(part?.metadata?.vendor).toBe('Grundfos');
    }
  });

  it('accepts bgMapping.parameter as a Token string', () => {
    const pkg = {
      ...minimalPackage,
      elements: [
        {
          ...minimalPackage.elements[0],
          bgMapping: {
            elementType: 'Sf' as const,
            parameter: '${Token[n_flow-rate-xyz]}',
          },
        },
        ...minimalPackage.elements.slice(1),
      ],
    };
    const result = SysmlPackage.safeParse(pkg);
    expect(result.success).toBe(true);
  });
});
