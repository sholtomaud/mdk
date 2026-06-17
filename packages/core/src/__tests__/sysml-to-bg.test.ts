import { describe, it, expect } from 'vitest';
import { sysmlToBondGraph } from '../transpilers/sysml-to-bg.js';
import { SysmlPackage } from '../schema/sysml.js';
import { BondGraphModel } from '../schema/bondgraph.js';

/* ── Fixed UUIDs for deterministic test fixtures ──────────────────── */
const ID = {
  pkg:       '00000000-0000-0000-0000-000000000001',
  // RC circuit parts & ports
  partVsrc:  '00000000-0000-0000-0000-000000000002',
  portVsrcP: '00000000-0000-0000-0000-000000000003',
  partR1:    '00000000-0000-0000-0000-000000000004',
  portR1P:   '00000000-0000-0000-0000-000000000005',
  portR1N:   '00000000-0000-0000-0000-000000000006',
  partC1:    '00000000-0000-0000-0000-000000000007',
  portC1P:   '00000000-0000-0000-0000-000000000008',
  portC1N:   '00000000-0000-0000-0000-000000000009',
  partGnd:   '00000000-0000-0000-0000-000000000010',
  portGndP:  '00000000-0000-0000-0000-000000000011',
  connVsrcR: '00000000-0000-0000-0000-000000000012',
  connRC:    '00000000-0000-0000-0000-000000000013',
  connCGnd:  '00000000-0000-0000-0000-000000000014',
  // misc
  partA:     '00000000-0000-0000-0000-000000000020',
  portAin:   '00000000-0000-0000-0000-000000000021',
  portAout:  '00000000-0000-0000-0000-000000000022',
  partB:     '00000000-0000-0000-0000-000000000023',
  portBin:   '00000000-0000-0000-0000-000000000024',
  portBout:  '00000000-0000-0000-0000-000000000025',
  connAB:    '00000000-0000-0000-0000-000000000026',
};

/* ── Helpers ─────────────────────────────────────────────────────────*/

function ref(id: string) { return { '@id': id }; }

/** Minimal valid package with a single Se source and one port */
function singleSePkg(): SysmlPackage {
  return {
    '@id': ID.pkg,
    '@type': 'Package',
    elements: [
      {
        '@id':  ID.partVsrc,
        '@type': 'PartUsage',
        name:  'Vsrc',
        ownedFeature: [ref(ID.portVsrcP)],
        bgMapping: { elementType: 'Se', parameter: 12.0 },
      },
      {
        '@id':  ID.portVsrcP,
        '@type': 'PortUsage',
        name:  'p',
      },
    ],
  };
}

/** RC circuit: Vsrc — R1 — C1 — Gnd in series */
function rcCircuitPkg(): SysmlPackage {
  return {
    '@id': ID.pkg,
    '@type': 'Package',
    elements: [
      // Parts
      { '@id': ID.partVsrc, '@type': 'PartUsage', name: 'Vsrc',
        ownedFeature: [ref(ID.portVsrcP)],
        bgMapping: { elementType: 'Se', parameter: 12.0 } },
      { '@id': ID.partR1, '@type': 'PartUsage', name: 'R1',
        ownedFeature: [ref(ID.portR1P), ref(ID.portR1N)],
        bgMapping: { elementType: 'R', parameter: 100.0 } },
      { '@id': ID.partC1, '@type': 'PartUsage', name: 'C1',
        ownedFeature: [ref(ID.portC1P), ref(ID.portC1N)],
        bgMapping: { elementType: 'C', parameter: 0.001 } },
      { '@id': ID.partGnd, '@type': 'PartUsage', name: 'Gnd',
        ownedFeature: [ref(ID.portGndP)],
        bgMapping: { elementType: 'Se', parameter: 0.0 } },
      // Ports
      { '@id': ID.portVsrcP, '@type': 'PortUsage', name: 'p' },
      { '@id': ID.portR1P,   '@type': 'PortUsage', name: 'p' },
      { '@id': ID.portR1N,   '@type': 'PortUsage', name: 'n' },
      { '@id': ID.portC1P,   '@type': 'PortUsage', name: 'p' },
      { '@id': ID.portC1N,   '@type': 'PortUsage', name: 'n' },
      { '@id': ID.portGndP,  '@type': 'PortUsage', name: 'p' },
      // Connections
      { '@id': ID.connVsrcR, '@type': 'FlowConnectionUsage',
        source: [ref(ID.portVsrcP)], target: [ref(ID.portR1P)] },
      { '@id': ID.connRC,    '@type': 'FlowConnectionUsage',
        source: [ref(ID.portR1N)],   target: [ref(ID.portC1P)] },
      { '@id': ID.connCGnd,  '@type': 'FlowConnectionUsage',
        source: [ref(ID.portC1N)],   target: [ref(ID.portGndP)] },
    ],
  };
}

/* ── Tests ───────────────────────────────────────────────────────────*/

describe('sysmlToBondGraph()', () => {

  describe('single Se source with one port', () => {
    it('produces a valid BondGraphModel', () => {
      const bg = sysmlToBondGraph(singleSePkg());
      expect(BondGraphModel.safeParse(bg).success).toBe(true);
    });

    it('has domain bondgraph', () => {
      expect(sysmlToBondGraph(singleSePkg()).domain).toBe('bondgraph');
    });

    it('creates a J0 junction for the port and an Se element', () => {
      const bg = sysmlToBondGraph(singleSePkg());
      const j0  = bg.elements.find(e => e.type === 'J0');
      const se  = bg.elements.find(e => e.type === 'Se');
      expect(j0).toBeDefined();
      expect(se).toBeDefined();
      expect(se?.parameter).toBe(12.0);
    });

    it('has exactly 2 elements and 1 bond', () => {
      const bg = sysmlToBondGraph(singleSePkg());
      expect(bg.elements).toHaveLength(2);
      expect(bg.bonds).toHaveLength(1);
    });

    it('bond connects Se to its J0 junction', () => {
      const bg = sysmlToBondGraph(singleSePkg());
      const se = bg.elements.find(e => e.type === 'Se')!;
      const j0 = bg.elements.find(e => e.type === 'J0')!;
      const bond = bg.bonds[0];
      const ids = [bond.source, bond.target];
      expect(ids).toContain(se.id);
      expect(ids).toContain(j0.id);
    });
  });

  describe('RC circuit (series: Vsrc — R1 — C1 — Gnd)', () => {
    it('produces a valid BondGraphModel', () => {
      const bg = sysmlToBondGraph(rcCircuitPkg());
      expect(BondGraphModel.safeParse(bg).success).toBe(true);
    });

    it('contains Se, R, and C elements with correct parameters', () => {
      const bg = sysmlToBondGraph(rcCircuitPkg());
      const se  = bg.elements.filter(e => e.type === 'Se');
      const r   = bg.elements.find(e => e.type === 'R');
      const c   = bg.elements.find(e => e.type === 'C');
      expect(se).toHaveLength(2);       // Vsrc + Gnd
      expect(r?.parameter).toBe(100.0);
      expect(c?.parameter).toBe(0.001);
    });

    it('merges connected ports into shared junctions (6 ports → 3 J0 nodes)', () => {
      const bg = sysmlToBondGraph(rcCircuitPkg());
      const j0s = bg.elements.filter(e => e.type === 'J0');
      expect(j0s).toHaveLength(3);
    });

    it('creates J1 intermediates for 2-port elements (R1 and C1)', () => {
      const bg = sysmlToBondGraph(rcCircuitPkg());
      const j1s = bg.elements.filter(e => e.type === 'J1');
      expect(j1s).toHaveLength(2);
    });

    it('produces 9 total elements', () => {
      // 3× J0(merged nodes) + 2× J1(R1,C1 loop junctions) + Se(Vsrc) + R(R1) + C(C1) + Se(Gnd)
      const bg = sysmlToBondGraph(rcCircuitPkg());
      expect(bg.elements).toHaveLength(9);
    });

    it('all bond source/target IDs reference existing elements', () => {
      const bg = sysmlToBondGraph(rcCircuitPkg());
      const ids = new Set(bg.elements.map(e => e.id));
      for (const bond of bg.bonds) {
        expect(ids.has(bond.source), `source ${bond.source} not in elements`).toBe(true);
        expect(ids.has(bond.target), `target ${bond.target} not in elements`).toBe(true);
      }
    });
  });

  describe('default BG element type', () => {
    it('defaults to R with parameter 1.0 when bgMapping is absent', () => {
      const pkg: SysmlPackage = {
        '@id': ID.pkg, '@type': 'Package',
        elements: [
          { '@id': ID.partA, '@type': 'PartUsage', name: 'Mystery',
            ownedFeature: [ref(ID.portAin), ref(ID.portAout)] },
          { '@id': ID.portAin,  '@type': 'PortUsage', name: 'in' },
          { '@id': ID.portAout, '@type': 'PortUsage', name: 'out' },
        ],
      };
      const bg = sysmlToBondGraph(pkg);
      const mystery = bg.elements.find(e => e.name === 'Mystery');
      expect(mystery?.type).toBe('R');
      expect(mystery?.parameter).toBe(1.0);
    });
  });

  describe('FlowConnectionUsage port merging', () => {
    it('two unconnected parts have separate junctions', () => {
      const pkg: SysmlPackage = {
        '@id': ID.pkg, '@type': 'Package',
        elements: [
          { '@id': ID.partA, '@type': 'PartUsage', name: 'A',
            ownedFeature: [ref(ID.portAin)],
            bgMapping: { elementType: 'Se', parameter: 5.0 } },
          { '@id': ID.partB, '@type': 'PartUsage', name: 'B',
            ownedFeature: [ref(ID.portBin)],
            bgMapping: { elementType: 'C', parameter: 0.01 } },
          { '@id': ID.portAin, '@type': 'PortUsage', name: 'p' },
          { '@id': ID.portBin, '@type': 'PortUsage', name: 'p' },
          // No FlowConnectionUsage
        ],
      };
      const bg = sysmlToBondGraph(pkg);
      const j0s = bg.elements.filter(e => e.type === 'J0');
      expect(j0s).toHaveLength(2);  // each port gets its own junction
    });

    it('connected ports collapse to a single shared junction', () => {
      const pkg: SysmlPackage = {
        '@id': ID.pkg, '@type': 'Package',
        elements: [
          { '@id': ID.partA, '@type': 'PartUsage', name: 'A',
            ownedFeature: [ref(ID.portAout)],
            bgMapping: { elementType: 'Se', parameter: 5.0 } },
          { '@id': ID.partB, '@type': 'PartUsage', name: 'B',
            ownedFeature: [ref(ID.portBin)],
            bgMapping: { elementType: 'C', parameter: 0.01 } },
          { '@id': ID.portAout, '@type': 'PortUsage', name: 'out' },
          { '@id': ID.portBin,  '@type': 'PortUsage', name: 'in' },
          { '@id': ID.connAB, '@type': 'FlowConnectionUsage',
            source: [ref(ID.portAout)], target: [ref(ID.portBin)] },
        ],
      };
      const bg = sysmlToBondGraph(pkg);
      const j0s = bg.elements.filter(e => e.type === 'J0');
      expect(j0s).toHaveLength(1);  // both ports merge into one junction
    });
  });

  describe('PortUsage junctionType override', () => {
    it('creates a J1 junction when bgMapping.junctionType is J1', () => {
      const pkg: SysmlPackage = {
        '@id': ID.pkg, '@type': 'Package',
        elements: [
          { '@id': ID.partA, '@type': 'PartUsage', name: 'Src',
            ownedFeature: [ref(ID.portAin)],
            bgMapping: { elementType: 'Sf', parameter: 1.0 } },
          { '@id': ID.portAin, '@type': 'PortUsage', name: 'flow_out',
            bgMapping: { junctionType: 'J1' } },
        ],
      };
      const bg = sysmlToBondGraph(pkg);
      const j1s = bg.elements.filter(e => e.type === 'J1');
      expect(j1s.length).toBeGreaterThanOrEqual(1);
      // The port junction itself should be J1
      const portJ = j1s.find(e => e.name.includes('flow_out'));
      expect(portJ).toBeDefined();
    });
  });

  describe('Zod schema validation', () => {
    it('SysmlPackage rejects missing elements array', () => {
      const result = SysmlPackage.safeParse({ '@id': ID.pkg, '@type': 'Package' });
      expect(result.success).toBe(false);
    });

    it('SysmlPackage rejects unknown @type in elements', () => {
      const result = SysmlPackage.safeParse({
        '@id': ID.pkg, '@type': 'Package',
        elements: [{ '@id': ID.partA, '@type': 'UnknownType', name: 'X' }],
      });
      expect(result.success).toBe(false);
    });

    it('SysmlPackage rejects a package with no FlowConnectionUsage', () => {
      // Our refinement: at least one FlowConnectionUsage is required
      expect(SysmlPackage.safeParse(singleSePkg()).success).toBe(false);
    });

    it('SysmlPackage accepts a package with FlowConnectionUsage', () => {
      expect(SysmlPackage.safeParse(rcCircuitPkg()).success).toBe(true);
    });

    it('SysmlPackage accepts the full RC circuit package', () => {
      expect(SysmlPackage.safeParse(rcCircuitPkg()).success).toBe(true);
    });
  });

  describe('PartUsage with no owned ports is skipped', () => {
    it('does not produce BG elements for portless parts', () => {
      const pkg: SysmlPackage = {
        '@id': ID.pkg, '@type': 'Package',
        elements: [
          { '@id': ID.partA, '@type': 'PartUsage', name: 'Ghost',
            bgMapping: { elementType: 'R', parameter: 10.0 } },
          // no ownedFeature
        ],
      };
      const bg = sysmlToBondGraph(pkg);
      expect(bg.elements).toHaveLength(0);
      expect(bg.bonds).toHaveLength(0);
    });
  });
});
