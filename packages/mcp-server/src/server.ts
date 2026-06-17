import { MdkServer } from './mdk-server.js';
import { zodSchemaToInputSchema } from './transport/zod-to-schema.js';

import { createModel, createModelSchema }                   from './tools/create-model.js';
import { runSimulation, runSimulationSchema }               from './tools/run-simulation.js';
import { validateModel, validateModelSchema }               from './tools/validate-model.js';
import { generateBom, generateBomSchema }                   from './tools/generate-bom.js';
import { generateDiagram, generateDiagramSchema }           from './tools/generate-diagram.js';
import { createProjectTool, createProjectSchema }           from './tools/create-project.js';
import { createBlockTool, createBlockSchema }               from './tools/create-block.js';
import { refineBlockTool, refineBlockSchema }               from './tools/refine-block.js';
import { getModelState, getModelStateSchema }               from './tools/get-model-state.js';
import { listPending, listPendingSchema }                   from './tools/list-pending.js';
import { assembleModel, assembleModelSchema }               from './tools/assemble-model.js';
import { computeEmergyTool, computeEmergySchema }           from './tools/compute-emergy.js';
import { transpileSysml, transpileSysmlSchema }             from './tools/transpile-sysml.js';
import { verifyRequirementsTool, verifyRequirementsSchema } from './tools/verify-requirements.js';
import { computePiGroupsTool, computePiGroupsSchema }     from './tools/compute-pi-groups.js';

export function createMdkServer(): MdkServer {
  const server = new MdkServer();

  server.tool(
    'create_model',
    'Generate a SysML, Bond Graph, or Odum ESL model from plain-English description (uses Gemini responseJsonSchema)',
    zodSchemaToInputSchema(createModelSchema),
    async (args) => createModel(args as Parameters<typeof createModel>[0]),
  );

  server.tool(
    'run_simulation',
    'Run a Bond Graph or Odum ESL simulation on a Model Assembly JSON using the WASM kernel',
    zodSchemaToInputSchema(runSimulationSchema),
    async (args) => runSimulation(args as Parameters<typeof runSimulation>[0]),
  );

  server.tool(
    'validate_model',
    'Validate a Model Assembly JSON: schema check (Zod) then Bond Graph causality check (WASM)',
    zodSchemaToInputSchema(validateModelSchema),
    async (args) => validateModel(args as Parameters<typeof validateModel>[0]),
  );

  server.tool(
    'generate_bom',
    'Generate a structured Bill of Materials JSON from a Model Assembly JSON',
    zodSchemaToInputSchema(generateBomSchema),
    async (args) => generateBom(args as Parameters<typeof generateBom>[0]),
  );

  server.tool(
    'generate_diagram',
    'Generate SysML diagrams and Bond Graph/ESL energy circuit views from model JSON',
    zodSchemaToInputSchema(generateDiagramSchema),
    async (args) => generateDiagram(args as Parameters<typeof generateDiagram>[0]),
  );

  server.tool(
    'create_project',
    'Create a new MDK project with an optional initial block decomposition',
    zodSchemaToInputSchema(createProjectSchema),
    async (args) => createProjectTool(args as Parameters<typeof createProjectTool>[0]),
  );

  server.tool(
    'create_block',
    'Add a block (sub-system) to an existing MDK project',
    zodSchemaToInputSchema(createBlockSchema),
    async (args) => createBlockTool(args as Parameters<typeof createBlockTool>[0]),
  );

  server.tool(
    'refine_block',
    'Generate and validate a Bond Graph model JSON for a pending block',
    zodSchemaToInputSchema(refineBlockSchema),
    async (args) => refineBlockTool(args as Parameters<typeof refineBlockTool>[0]),
  );

  server.tool(
    'get_model_state',
    'Get the current state of a project or a single block',
    zodSchemaToInputSchema(getModelStateSchema),
    async (args) => getModelState(args as Parameters<typeof getModelState>[0]),
  );

  server.tool(
    'list_pending',
    'List all pending blocks in a project and the next refine_block action to take',
    zodSchemaToInputSchema(listPendingSchema),
    async (args) => listPending(args as Parameters<typeof listPending>[0]),
  );

  server.tool(
    'assemble_model',
    'Merge all refined blocks into a single flat Bond Graph model ready for validation and simulation',
    zodSchemaToInputSchema(assembleModelSchema),
    async (args) => assembleModel(args as Parameters<typeof assembleModel>[0]),
  );

  server.tool(
    'compute_emergy',
    'Compute emergy, transformity, and emergy balance for an Odum ESL model',
    zodSchemaToInputSchema(computeEmergySchema),
    async (args) => computeEmergyTool(args as Parameters<typeof computeEmergyTool>[0]),
  );

  server.tool(
    'transpile_sysml',
    'Convert a SysmlPackage (PartUsage/PortUsage/FlowConnectionUsage) to a flat BondGraphModel',
    zodSchemaToInputSchema(transpileSysmlSchema),
    async (args) => transpileSysml(args as Parameters<typeof transpileSysml>[0]),
  );

  server.tool(
    'verify_requirements',
    'Check SysML RequirementUsage constraints against simulation results (PASS/FAIL report)',
    zodSchemaToInputSchema(verifyRequirementsSchema),
    async (args) => verifyRequirementsTool(args as Parameters<typeof verifyRequirementsTool>[0]),
  );

  server.tool(
    'compute_pi_groups',
    'Compute Buckingham π dimensionless groups from a FunctionalModel or variable list — step 3 of DACM dimensional decomposition',
    zodSchemaToInputSchema(computePiGroupsSchema),
    async (args) => computePiGroupsTool(args as Parameters<typeof computePiGroupsTool>[0]),
  );

  return server;
}
