// @ts-nocheck
/**
 * @mdk/core — Proposed v1 Public API Surface
 *
 * This file is a design document, not an implementation.
 * It shows the full intended public API in one place.
 *
 * Architecture layers:
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  L3 CDK Constructs   ModelConstruct / ModelStack         │  <── new
 *   │  Odum ESL L3         Store / Source / Sink / Flow / Site │  <── new
 *   ├──────────────────────────────────────────────────────────┤
 *   │  L2 BG Composites    DCMotor / Gearbox / PIDController   │  existing
 *   ├──────────────────────────────────────────────────────────┤
 *   │  L1 BG Primitives    Se Sf R C I TF GY J0 J1             │  existing
 *   ├──────────────────────────────────────────────────────────┤
 *   │  Schema (Zod)        BondGraphModel / OdumEslModel        │  existing
 *   │  Kernel bridge       runKernel / cleanupKernel            │  existing
 *   └──────────────────────────────────────────────────────────┘
 *
 * Rule: L3 constructs call L1/L2. L1/L2 never import L3.
 * Rule: ModelConstruct = pure physics. ModelStack = synthesis boundary.
 * Rule: Cloud / IoT providers live in @mdk/provider-* packages, not here.
 */

/* ═══════════════════════════════════════════════════════════════════
   EXISTING — keep as-is
   ═══════════════════════════════════════════════════════════════════ */

// L1 Bond Graph primitives
export {
  Se, Sf, R, C, I, TF, GY, J0, J1,
  Element, PowerBond,
} from '@mdk/core/elements';
export type { PhysicalDomain } from '@mdk/core/elements';

// L2 Bond Graph composites
export {
  DCMotor, Gearbox, LinearSlider, PIDController,
} from '@mdk/core/elements';
export type {
  DCMotorParams, GearboxParams, LinearSliderParams, PIDControllerParams,
} from '@mdk/core/elements';

// Schema validators
export { BondGraphModel, OdumEslModel } from '@mdk/core/schema';
export type { BgElementType } from '@mdk/core/schema';

// Kernel bridge
export { runKernel, validateBondGraph, cleanupKernel } from '@mdk/core/kernel';
export type { KernelResult, BgStateSpace, BgSimulation } from '@mdk/core/kernel';

// Low-level containers (keep for programmatic / scripting use)
export { MdkSystem, MdkStack, MdkApp } from '@mdk/core/system';


/* ═══════════════════════════════════════════════════════════════════
   NEW — proposed additions
   ═══════════════════════════════════════════════════════════════════ */

// ── Construct tree ────────────────────────────────────────────────

export type SimDomain = 'bondgraph' | 'odum-esl';
export type SolverMethod = 'euler' | 'rk4';
export type TimeUnit = 'seconds' | 'minutes' | 'hours' | 'days';

export interface SimConfig {
  t_start?: number;
  t_end: number;
  dt: number;
  t_units?: TimeUnit;
  method?: SolverMethod;
  domain?: SimDomain;
}

export interface OutputConfig {
  description?: string;
  format?: 'json' | 'cbor' | 'csv';
  target?: string;           // logical store id — resolved at synth time
}

/**
 * Base class for all reusable system fragments.
 *
 * Constructor signature mirrors AWS CDK: scope / id / props.
 * Every construct automatically registers with its parent scope.
 * Constructs are pure physics — no cloud infrastructure, no I/O.
 */
export declare abstract class ModelConstruct {
  /** Unique path within the construct tree, e.g. "EcosystemStack/Hydro/SoilWater" */
  readonly path: string;
  /** Local id within parent scope */
  readonly id: string;
  /** Parent scope — either a ModelConstruct or a ModelStack */
  readonly scope: ModelConstruct | ModelStack;

  constructor(scope: ModelConstruct | ModelStack, id: string);

  /** Collect all Elements owned by this subtree (deep). Used by ModelStack.synth(). */
  synthesize(): { elements: Element[]; bonds: PowerBond[] };
}

/**
 * Synthesis boundary and deployment unit.
 *
 * Contains one or more ModelConstructs.
 * Holds the SimConfig and output definitions.
 * Call stack.synth() to produce the validated JSON model.
 * Call stack.run() to execute the kernel and return timeseries results.
 */
export declare abstract class ModelStack {
  readonly id: string;
  readonly config: SimConfig;

  constructor(app: MdkApp, id: string, config: SimConfig);

  /** Register a simulation output. */
  output(id: string, subject: ModelConstruct, config?: OutputConfig): void;

  /** Produce validated JSON model. Traverses all child constructs. */
  synth(): BondGraphModel;

  /** Synthesize then execute the sim-kernel. */
  run(): Promise<KernelResult>;
}


// ── Odum ESL L3 constructs ────────────────────────────────────────

export interface StoreProps {
  /** Initial stored quantity (e.g. mm water, J energy, kg biomass) */
  initialValue: number;
  domain?: PhysicalDomain;
  /** Optional label for diagram rendering */
  label?: string;
}

/**
 * A storage compartment — the fundamental state variable in Odum ESL.
 * Maps to a Bond Graph C element.  dQ/dt = Σ(inflows) − Σ(outflows)
 */
export declare class Store extends ModelConstruct {
  /** The underlying BG C element — available for advanced BG composition. */
  readonly element: C;
  constructor(scope: ModelConstruct | ModelStack, id: string, props: StoreProps);
}


export interface SourceProps {
  /** Nominal output value. May be overridden by a timeseries DataSource. */
  value: number;
  domain?: PhysicalDomain;
  label?: string;
}

/**
 * An external energy/matter source — unbounded input.
 * Maps to a Bond Graph Se (effort source) or Sf (flow source).
 */
export declare class Source extends ModelConstruct {
  readonly element: Se;
  constructor(scope: ModelConstruct | ModelStack, id: string, props: SourceProps);
}


export interface SinkProps {
  domain?: PhysicalDomain;
  label?: string;
}

/**
 * An energy/matter sink — outflow terminates here (heat sink, export, etc.)
 * Maps to a BG R termination (R→∞ or dissipation element).
 */
export declare class Sink extends ModelConstruct {
  constructor(scope: ModelConstruct | ModelStack, id: string, props?: SinkProps);
}


export type FlowLogic = 'constant' | 'linear' | 'quadratic';

export interface FlowProps {
  origin: Store | Source;
  target: Store | Sink;
  /** Odum flow logic — governs how flow scales with source/store level. */
  logic: FlowLogic;
  /**
   * Flow coefficient k.
   *
   * For 'constant':  flow = k  (source-independent, pure forcing)
   * For 'linear':    flow = k × Q_origin  (first-order drain / linear pathway)
   * For 'quadratic': flow = k × Q_origin²  (self-limiting Lotka–Volterra style)
   *
   * k = 1/RC in Bond Graph terms: R = 1/k, C = storage capacitance of origin.
   * Units: [flow units] / [storage units] / [time unit]
   */
  k: number;
}

/**
 * A directed energy/matter flow pathway between two nodes.
 * Maps to a BG R element + appropriate junction topology.
 */
export declare class Flow extends ModelConstruct {
  constructor(scope: ModelConstruct | ModelStack, id: string, props: FlowProps);
}


// ── Site abstraction ──────────────────────────────────────────────

/**
 * Parameterised site — NOT one file per site.
 *
 * For small N: define SiteConfig objects inline or import from a JSON file.
 * For large N (100+ sites): load SiteConfig[] from SQLite via SiteRegistry
 * and iterate over them to instantiate one ModelStack per site.
 *
 * Example (100-site fleet):
 *   const sites = SiteRegistry.load('./sites.db');
 *   for (const cfg of sites) {
 *     new EcosystemStack(app, cfg.site_id, { ...simConfig, site: cfg });
 *   }
 */
export interface SiteConfig {
  site_id: string;
  latitude: number;
  longitude: number;
  /** Optional link to a DataSource for real timeseries (calibration / backtesting). */
  dataSource?: DataSourceRef;
}

export interface DataSourceRef {
  type: 'sqlite' | 'cbor' | 'csv' | 'api';
  uri: string;
  /** Variable name in the external dataset, mapped to a node id. */
  mappings?: Record<string, string>;
}

/**
 * Loads SiteConfig[] from a SQLite database.
 * One row per site; schema matches SiteConfig.
 */
export declare class SiteRegistry {
  static load(dbPath: string): SiteConfig[];
  static loadOne(dbPath: string, siteId: string): SiteConfig;
}


// ── NOT in v1 scope — future roadmap ─────────────────────────────

/*
  @mdk/provider-aws          — cloud constructs (S3, IoT Core, Lambda)
  @mdk/provider-edge         — edge compute (RasPi, Arduino, Maxon RE65)
  @mdk/neat                  — NEAT genetic algorithm for model optimisation
  @mdk/sysml                 — SysML diagram suite (BDD, IBD, EFFBD, N² etc.)
  @mdk/backtesting           — timeseries calibration against historical data
  snapshot testing           — vitest snapshots of sim output (v1 test pattern)
*/
