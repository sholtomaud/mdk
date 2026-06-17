import { z } from 'zod';
import { BG_ELEMENT_TYPES } from './bondgraph.js';

/* ── Variable taxonomy (Dhalpe et al. 2025, DACM framework) ─────────── */

export const VAR_CATEGORIES = ['effort', 'flow', 'momentum', 'displacement', 'connecting'] as const;
export type VarCategory = typeof VAR_CATEGORIES[number];

export const VAR_ROLES = ['independent', 'dependent', 'exogenous', 'performance'] as const;
export type VarRole = typeof VAR_ROLES[number];

/* ── SI dimension vector ─────────────────────────────────────────────── */

export const SiDimensions = z.object({
  M: z.number().default(0),
  L: z.number().default(0),
  T: z.number().default(0),
  I: z.number().default(0),
  Θ: z.number().default(0),
  N: z.number().default(0),
  J: z.number().default(0),
}).describe('SI base dimension exponents [M, L, T, I, Θ, N, J]');

export type SiDimensions = z.infer<typeof SiDimensions>;

/* ── Variable ────────────────────────────────────────────────────────── */

export const DacmVariable = z.object({
  id:           z.string().min(1),
  name:         z.string(),
  symbol:       z.string(),
  category:     z.enum(VAR_CATEGORIES).optional(),
  role:         z.enum(VAR_ROLES).optional(),
  unit:         z.string().optional(),
  siDimensions: SiDimensions.optional(),
  description:  z.string().optional(),
});

export type DacmVariable = z.infer<typeof DacmVariable>;

/* ── Power-law relationship (dimensionless pi-group) ────────────────── */

export const PowerLaw = z.object({
  id:                 z.string().min(1),
  functionId:         z.string(),
  dependentVar:       z.string().describe('id of the dependent variable'),
  piConstant:         z.number().default(1).describe('multiplicative constant C in y = C·x1^a1·x2^a2…'),
  exponents:          z.record(z.string(), z.number()).describe('variable id → exponent'),
  dimensionlessGroup: z.string().optional().describe('Pi-group label, e.g. "Re" for Reynolds number'),
  physicalPhenomenon: z.string().optional().describe('Named phenomenon captured by this law'),
});

export type PowerLaw = z.infer<typeof PowerLaw>;

/* ── Functional element (maps to a bond-graph organ) ────────────────── */

export const DacmFunction = z.object({
  id:          z.string().min(1),
  name:        z.string(),
  description: z.string().optional(),
  organ:       z.enum(BG_ELEMENT_TYPES).optional().describe('Bond-graph element type that implements this function'),
  variables:   z.array(DacmVariable).optional(),
  powerLaws:   z.array(PowerLaw).optional(),
});

export type DacmFunction = z.infer<typeof DacmFunction>;

/* ── Subsystem ───────────────────────────────────────────────────────── */

export const DacmSubsystem = z.object({
  id:            z.string().min(1),
  name:          z.string(),
  description:   z.string().optional(),
  functions:     z.array(DacmFunction),
  connectorType: z.enum(['MTF', 'MGY', 'CTF']).optional().describe('DACM connector element used to couple this subsystem'),
  connectedTo:   z.array(z.string()).optional().describe('ids of subsystems this one is connected to'),
});

export type DacmSubsystem = z.infer<typeof DacmSubsystem>;

/* ── Top-level Functional Model ──────────────────────────────────────── */

export const FunctionalModel = z.object({
  name:            z.string(),
  domain:          z.literal('functional'),
  objective:       z.string().optional().describe('System design objective or performance goal'),
  subsystems:      z.array(DacmSubsystem).min(1),
  systemVariables: z.array(DacmVariable).optional().describe('System-level variables spanning multiple subsystems'),
  metadata:        z.record(z.unknown()).optional(),
});

export type FunctionalModel = z.infer<typeof FunctionalModel>;
