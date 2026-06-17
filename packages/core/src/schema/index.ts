export * from './bondgraph.js';
/* Selective re-export to avoid SimConfig name clash with bondgraph.js */
export { OdumNode, OdumEdge, OdumEslModel } from './odum-esl.js';
export type { SimConfig as OdumSimConfig } from './odum-esl.js';

export type { BondGraphModel as MdkBondGraphModel } from './bondgraph.js';
export type { OdumEslModel as MdkOdumEslModel } from './odum-esl.js';

/* DACM — Dimensional Analysis and Conceptual Modelling schemas */
export {
  VAR_CATEGORIES, VAR_ROLES,
  SiDimensions, DacmVariable, PowerLaw,
  DacmFunction, DacmSubsystem, FunctionalModel,
} from './dacm.js';
export type {
  VarCategory, VarRole,
  SiDimensions as SiDimensionsType,
  DacmVariable as DacmVariableType,
  PowerLaw as PowerLawType,
  DacmFunction as DacmFunctionType,
  DacmSubsystem as DacmSubsystemType,
  FunctionalModel as FunctionalModelType,
} from './dacm.js';
