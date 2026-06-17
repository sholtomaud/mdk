// @ts-nocheck
/*
Well lets do it. I've attached Odum's implementation of tank for further clarification. but rather than running x3 separate computational layers, lets try and reduce it to one layer. I understand you wanted to keep ODE and IDE separate, but lets implement IDE so we can do the emergy computation with IDE. In fact lets do a full IDE implementation and we have the BG compute also. So we could use the BG auditing algorithms which are established in the Systems Engineering literature to validate the Odum model and do the linting and underlining in the VSCode editior.

I think then the ts stack should be defined in these terms. But We should still be able to do full support of both BG and Odum nomenclature, and I was thinking it would be more like AWS CDK. I mean, your work on `./examples/odum-store.ts` was impressive, but a little too complex, and it leaves too much to the coder to infer what is needed. We need good typeahead support, linting and also need a way to integrate LLM typeahead perhaps with fine tuning an agent or Skills.md etc.

So where, for example, AWS Budgets are imported like below, but it is a bit verbose and would not be viable for massively complex models, but I think that is the point of Odum's work is that it supports complexity by scaling constructs. So for example, when a system is above a certain complexity it should be broken out into a new file as a new construct which can be imported at the next level of organisation in the hierarchy. ModelStacks need to be saved, and I think the timeseries outputs of a model should be a part of the tests, and snapshot tests (the same test model should generate the same output else there is a regression). We should also include backtesting where we can add a timeseries data set into the model for calibration. And we should add the ability for the system to implement NEAT learning so that the model can improve over time, with the possiblity of suggestions where the model needs new nodes or edges. Right? So I'm channelling, CDK, Modelica, Odum, BG.

TBH, I have read some people get angry with the way that the AWS CDK overloaded the 'construct' with the full definition of a Stack in the construct. What's your opinion on this?




We could do something like below but I want your opinion on some of these ideas. 

ALSO: just thinking about the case where we let an Agetn/LLM/NEAT GeneticAI system build models in an automated way, and let it go to try and build a simulation of an ecosystem or a financial market, or a power system for a car, or Descartes' natural philosophy etc. This is supposed to be a Generalised Systems Theory implementation.


I think the issue about how to define all the nodes is an interesting one. Like, an enterprise system might provide a UI for defining/configuring all the nodes which are stored in a database, and the timeseries files for all the nodes are stored in binary files like cbor format or something. 

So I'm kind of free-forming here please excuse me. Are you able to see the vision here? Its basically GENESYS/SysML and Modellica/BondGraph implementation supporting Odum/Giannanatoni/General Systems Theory/EMergy etc. 

HACCP/HAZOP/RISK ANALYAIS. ETC.

I'ts 


*/

import { ModelStack  } from 'mdk';
import { Construct } from 'constructs';
import { SImulation } from '@mdk/provider-odum/lib/simulation';
import { DataSource } from '@mdk/lib/data';
import { Store, Source, Sink, Flow } from '@mdk/provider-odum';
import {SomeComplexSystemAtASmallerScale} from './some-local-file.ts'
import { AwsProvider } from '@cdktn/provider-aws/lib/provider';
import { BudgetsBudget } from '@cdktn/provider-aws/lib/budgets-budget';
import { IamRole } from '@cdktn/provider-aws/lib/iam-role';
import { IamRolePolicyAttachment } from '@cdktn/provider-aws/lib/iam-role-policy-attachment';



export interface EcosystemStackConfig {
  region:              string;
  alertEmail:          string;  // e.g. platform-alerts@yourdomain.com
  site_id: string;  // e.g. some unique identifier for the site of the ecosystem. Could be part of a government ecological/hydrological monitoring program, could be abstract perhaps, like a simulation.
latitude: number; 
longitude: number;
etc...
}

export class EcosystemStack extends ModelStack {
  // ARN of the role that Budget Actions assumes to apply/detach SCPs
  readonly budgetActionsRoleArn: string;

  constructor(scope: Construct, id: string, config: EcosystemStackConfig) {
    super(scope, id);
    
const soilWater = new Store(this, 'SoilWater', {
      name: 'soil-water-1',
value: 10
})

const rain = new Source(this, 'Rain', {
      name: 'rainfall',
value: 10
})

const ET = new Sink(this, 'EvapoTranspiration', {
      name: 'Evapotranspiration',
value: 0
})

const groundWaterFlow = new Flow(this, 'GroundWater',{
origin: rain,
target: soilWater,
logic: 'constant',
k: // In Odum's system, k = 1/RC, So we would need to define R (resistance) and C (capacitance) the product of which is the 'Time constant' and the 
}) 

const site = new Site() // I'm wondering whether this is like a Hydstra site database or a specific site, how do we transition between adding a site to a db in typescript, or defining the site in ts here as a construct? what if there are 100 sites? is that like 100 ts files one for each site?

const groundWaterSink = new Flow(this, 'GroundWaterSink',{
origin: soilWater,
target: ET,
logic: 'constant',
k: // In Odum's system, k = 1/RC, So we would need to define R (resistance) and C (capacitance) the product of which is the 'Time constant' and the 
}) 

const someSmalerScaleConstruct = new SomeComplexSystemAtASmallerScale(this,'SmallerConstruct',{
origin: groundWaterSink
})

const sim = new SimulationModel(this, 'EcologicalSimulationModel',{
nodes: [soilWater ,rain,ET, someSmalerScaleConstruct],
edges: [groundWaterFlow , groundWaterSink],
domain: 'ecology',
t_start: 0,
t_end: 60,
dt: 0.5, 
t_units: days,
method: 'rk4'
})

const dataSource1 = new DataSource(this,'SQlite1')


const site1 = new Site(this,'Site1',{
    data: dataSource1
}) 
// or new Store(this, 'HydrographicDB',{
//   type: 'data',
//   dataSource: ..., // an actual database or a simluation data. Eg.'myLocalSQLITEDB'// Or perhaps an API url for the Hydstra api for New South Wales or Vic, or Queensland in Australia. Or some Kisters product in Europe or something.
// })

const solarPanel = new Source(this,'Solar1',{
   name: 'mySolarPanek',
   site:''


})

const batteryPower = new Store(...,{
    chargeSource: solarPanel,

})

const maintenanceSchedule = new MaintenanceProgram(this,'',{})

const dataSource = new EdgeCompute(this, 'RasPi_1',{
  name: 'Some name',
  system: new RasPi(this,'System',{site:site1, 
  model: '4B',
  power: batteryPower}),
  output: MQTT,
  maintenanceSchedule: maintenanceSchedule
...etc
})



const dataStore = new S3Bucket(this,'MyDataStorage',{
  region:'ap-southest-2',
  ...etc
}) 

const iot = new AwsProvider.AWSIoT.Core(this,'IoT',{
    dataSource : dataSource,
    store: dataStore
})





    new MDKOutput(this, 'ModelSimulation', {
      value:       sim.data,
type: table|plot|report|latex|docx,
      description: 'Simulation Data',
      target: dataStore 
    });
    
    new MDKOutput(this, 'ModelSimulation', {
      value:       sim.data,
type: EFFBD || FFBD || BD || DFD || NSquared || Sequence | UseCase 
// full SysML 1.x suite, including State Machine and Parametric diagrams.
// Enhanced Function Flow Block Diagram (EFFBD)
// Enhanced Function Flow Block Diagram (EFFBD): CORE's "flagship" diagram. It combines functional flow with data triggers and resources to show exactly how a system operates.Function Flow Block Diagram (FFBD): A simpler version of the EFFBD focusing purely on the sequence of functions.Behavior Diagram (BD): A unified representation that captures both the control flow and data flow.Data Flow Diagram (DFD): Focuses on the transformation of data as it moves through various functions.N-Squared ($N^2$) Chart: A matrix representation used to identify and manage interfaces between functional or physical elements.Sequence Diagram: Captures the chronological exchange of messages between system components.  Use Case Diagram: Defines the interactions between external actors and the system to identify high-level requirements. Physical Hierarchy Diagram: A traditional tree-style view showing how the system is decomposed into subsystems, components, and parts.
// Structural Diagrams
// Block Definition Diagram (BDD): Defines the "what" of the system—classes of components and their relationships (inherited from SysML).

// Internal Block Diagram (IBD): Defines the "how" of the system—the internal connections and flows between specific parts of a block.

// Interface Block Diagram: Specifically visualizes the connections and ports between different system elements.
// Requirements Diagrams
// CORE ensures that every design element is traceable back to a source requirement.

// Requirements Hierarchy Diagram: Shows the nesting and decomposition of requirements from high-level "Originating Requirements" down to "Derived Requirements."

// Requirement Diagram (SysML): A specialized view showing requirements and their relationships, such as Satisfy, Verify, or Refine.

// Traceability Matrix: While often viewed as a table, CORE can output graphical representations of the traceability links between requirements and the functions or components that fulfill them.

// 4. Specialized & Analytical Outputs
// Spider Diagram: A "relational" view that starts with a single central entity and branches out to show every related object in the database, regardless of class.

// Hierarchy Diagram: A generic output that can be applied to any class (e.g., Document hierarchy, Test Plan hierarchy).

// Timeline Diagram: Used for scheduling and visualizing the duration of functions during simulation.
,
      description: 'Simulation Data',
      target: dataStore 
    });

}
}

