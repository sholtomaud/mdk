/* ── Schema (T5.1 — Zod validation layer) ────────────────────────── */
export { BondGraphModel, BgElement, BgBond, SimConfig as BgSimConfig, BG_ELEMENT_TYPES } from './schema/bondgraph.js';
export type { BgElementType } from './schema/bondgraph.js';
export { OdumEslModel, OdumNode, OdumEdge, SimConfig as OdumSimConfig } from './schema/odum-esl.js';

/* ── DACM — Dimensional Analysis and Conceptual Modelling ───────── */
export {
  VAR_CATEGORIES, VAR_ROLES,
  SiDimensions, DacmVariable, PowerLaw,
  DacmFunction, DacmSubsystem, FunctionalModel,
} from './schema/dacm.js';
export type {
  VarCategory, VarRole, FunctionalModel as FunctionalModelType,
  DacmVariable as DacmVariableType, DacmSubsystem as DacmSubsystemType,
  DacmFunction as DacmFunctionType, PowerLaw as PowerLawType,
  SiDimensions as SiDimensionsType,
} from './schema/dacm.js';

/* ── Base element types ──────────────────────────────────────────── */
export { Element, PowerBond } from './elements/base.js';
export type { PhysicalDomain, VisualMeta } from './elements/base.js';

/* ── L1 primitives ───────────────────────────────────────────────── */
export { Se, Sf, R, C, I, TF, GY, J0, J1 } from './elements/primitives.js';

/* ── L2 composites ───────────────────────────────────────────────── */
export { DCMotor, Gearbox, LinearSlider, PIDController } from './elements/composites.js';
export type { DCMotorParams, GearboxParams, LinearSliderParams, PIDControllerParams } from './elements/composites.js';

/* ── CDK containers ──────────────────────────────────────────────── */
export { MdkSystem, MdkStack, MdkApp } from './system/app.js';
export type { BomEntry } from './system/app.js';

/* ── Token & Inflight Resolution (T11.1) ─────────────────────────── */
export {
  Token,
  ProcurementToken,
  Lazy,
  TokenResolver,
  TokenResolutionError,
  MapResolutionContext,
  tokenKey,
  collectUnresolvedTokens,
} from './system/token.js';
export type {
  ResolutionContext,
  InflightResolution,
} from './system/token.js';


/* ── SysML v2 structural subset ──────────────────────────────────── */
export {
  SysmlRef, ItemDefinition, PortDefinition, PortUsage,
  PartDefinition, PartUsage, FlowConnectionUsage, SysmlPackage,
} from './schema/sysml.js';
export type {
  SysmlElement, SysmlRef as SysmlRefType, ItemDefinition as ItemDefinitionType,
  PortUsage as PortUsageType, PartUsage as PartUsageType,
  FlowConnectionUsage as FlowConnectionUsageType, SysmlPackage as SysmlPackageType,
} from './schema/sysml.js';

/* ── IDC solver ──────────────────────────────────────────────────── */
export { solveIDC } from './solvers/idc-solver.js';
export type { IdcStateSpace, IdcConfig, IdcResult } from './solvers/idc-solver.js';

/* ── Emergy / transformity analysis ─────────────────────────────── */
export { computeEmergy, emergyBalance } from './emergy/transformity.js';
export type { TransformityInit, EmergyResult, EmergyBalance } from './emergy/transformity.js';

/* ── Transpilers ─────────────────────────────────────────────────── */
export { odumToBondGraph } from './transpilers/odum-to-bg.js';
export { flattenBondGraph } from './transpilers/flatten-bg.js';
export { sysmlToBondGraph } from './transpilers/sysml-to-bg.js';
export type {
  BgPortDeclaration, BgHierarchicalBlock, BgPortConnection, BgComposedSystem,
} from './transpilers/flatten-bg.js';

/* ── Sim-kernel bridge ───────────────────────────────────────────── */
export { runKernel, validateBondGraph, cleanupKernel } from './kernel/wasm-bridge.js';
export type { KernelResult, BgStateSpace, BgSimulation } from './kernel/wasm-bridge.js';
/* ── NEAT Topology Evolution (T10.1) ─────────────────────────────── */
export { NeatGenome, InnovationTracker } from './evolution/neat.js';
export type { NodeGene, BondGene } from './evolution/neat.js';
export { PopulationManager } from './evolution/population.js';
export { FitnessEvaluator, genomeToModel } from './evolution/fitness.js';
export type { EvolutionTask } from './evolution/fitness.js';
export { RequirementFitnessEvaluator } from './evolution/requirement-fitness.js';
/* ── Requirement Verification (T13.2) ────────────────────────────── */
export { verifyRequirement } from './verification/evaluator.js';
export type { VerificationResult } from './verification/evaluator.js';

/* ── DSEE Agent (injectable LLM pipeline) ────────────────────────── */
export { DseeAgent } from './agent/dsee-agent.js';
export { GeminiProvider } from './agent/gemini-provider.js';
export { MockLlmProvider } from './agent/mock-provider.js';
export type { LlmProvider, GenerateModelOpts, ExplainOpts } from './agent/llm-provider.js';
export type { DseeAgentOptions, DseeAgentResult, DseeStreamEvent, DseeTools } from './agent/dsee-agent.js';
