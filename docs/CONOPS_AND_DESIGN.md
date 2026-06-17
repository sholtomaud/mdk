# Concept of Operations: mdk

## Vision

**mdk** is an open-source **Model-Based Systems Engineering (MBSE)** framework that treats mechatronic systems (robots, vehicles, IoT devices, and their integration with cloud services) as first-class code. It bridges the gap between mechanical/electrical design and modern software engineering practices.

By leveraging **Bond Graphs** (a domain-neutral energy-flow modeling language), mdk allows engineers to design complex physical systems in TypeScript, automatically generate system specifications, validate causality, and deploy control logic to microcontrollers or cloud-based digital twins.

## The Problem (Why Build This?)

Modern mechatronic development is fragmented:
1.  **Siloed Tooling:** Mechanical Engineers use CAD (SolidWorks), Electrical Engineers use SPICE/Altium, and Control Engineers use Simulink. These systems do not talk to each other.
2.  **Non-Versionable Design:** Design decisions are often trapped in proprietary binary formats. It is hard to do a `git diff` on a mechanical design or trace why a specific resistance value was chosen three years ago.
3.  **The "Integration Tax":** When you assemble components from different vendors (e.g., a motor from Maxon, a controller from TI, and a chassis from a 3D printer), you spend months debugging electrical compatibility and mechanical mounting.
4.  **Code Runs Away:** The control code on the microcontroller often diverges from the theoretical model, making debugging a nightmare.

**mdk solves this by making the physical system itself version-controlled and deterministic.**

## The Solution: Bond Graphs as the "Cloud Assembly"

We adapt the architecture of AWS Cloud Development Kit (CDK) to Mechatronics.

### 1. The Building Blocks (L1 Constructs)
Instead of `EC2`, `S3`, `Lambda`, we define the fundamental elements of physics using Bond Graph notation:
*   **Sources:** `Se` (Effort Source - e.g., Battery, Voltage), `Sf` (Flow Source - e.g., Gravity, Force).
*   **Dampers:** `R` (Resistance - e.g., Friction).
*   **Inertia:** `I` (Inertia - e.g., Mass).
*   **Compliance:** `C` (Capacitance - e.g., Spring).
*   **Transformers:** `TF` (Mechanical Gears, Voltage Converters), `GY` (Gyrators - e.g., Motors).
*   **Junctions:** `J0` (Common Effort), `J1` (Common Flow).

### 2. The Assembly (L2/L3 Constructs)
Engineers compose these primitives into familiar subsystems:
*   **L2 (Subsystems):** `DCMotor`, `Gearbox`, `PIDController`, `BLDCActuator`.
*   **L3 (Vendors):** `Maxon.RE40`, `Arduino.Uno`, `Bosch.PneumaticCylinder`.

### 3. The "Synth" Operation
When the user runs `mdk synth`:
1.  **Topological Analysis:** The system builds a graph of all connected components.
2.  **Causality Assignment:** The core `lib/core-engine` (written in C/Wasm) runs the **Causality Algorithm** (from the textbook). It determines mathematically whether the system is solvable or if there is a physical paradox (e.g., two voltage sources in parallel).
3.  **Artifact Generation:** It outputs two artifacts:
    *   **The Specification:** A human-readable YAML/JSON bill of materials and connection map.
    *   **The Digital Twin Model:** A deterministic model (e.g., State-Space Equations) ready to be deployed.

## Workflow Example: Designing a Robotic Arm

```typescript
import { DCMotor, Gearbox, RackAndPinion, Battery, Spring } from "@mdk/core";
import { ChassisStack } from "@mdk/robot-arm-kit";

const arm = new ChassisStack("MyArm", {
    motor: new DCMotor(this, "Motor", {
        resistance: 1.5, // Ohms
        inductance: 0.8, // mH
        torqueConstant: 0.05 // Nm/A
    }),
    drive: new Gearbox(this, "Gearbox", {
        ratio: 100
    }),
    load: new RackAndPinion(this, "LinearActuator", {
        pitch: 5 // mm per rotation
    })
});

// LINTING: If I try to connect two motors in parallel without a controller:
// arm.addParallelMotor(anotherMotor);
// The C engine throws a COMPILER ERROR: "Causality conflict at junction 1"

arm.synth(); // Generates the specs and simulation model
```

## Key Technical Concepts

### A. The C/Wasm Resolver (The "Linter")
We will implement the Causality Algorithm from the textbook (`Chapter 3.4` & `5.4`) in C and compile it to Wasm.
*   **Why C?** It is the language of embedded systems and simulation kernels. It is fast and deterministic.
*   **Why Wasm?** It allows the Node.js/TypeScript layer to call the C logic without needing a C compiler installed on the user's machine. The heavy lifting (math) happens in the secure sandbox.
*   **How it works:** The TypeScript compiler parses the syntax tree. It then serializes the graph topology into a strict JSON format (defined in `core-engine/schema`). The Wasm module loads this JSON, performs the causality check, and returns a "Causality Report" (Valid, Invalid, or Warning). If Invalid, the TypeScript compilation fails.

### B. State-Space Representation (The "Digital Twin")
Bond Graphs naturally decompose into Ordinary Differential Equations (ODEs) of the form:
$$x' = A x + B u$$
$$y = C x + D u$$

The mdk synthesizer will automatically generate the `A`, `B`, `C`, `D` matrices based on the component connections and parameters. This matrix can be:
1.  **Exported:** To Python/Scipy for analysis.
2.  **Deployed:** To an embedded system (e.g., STM32) running a numerical solver (like [Euler-Lagrange solvers](https://github.com/marksv/el)
    ) to compare the simulated state vs. the actual sensor readings in real-time.

### C. Hardware Provider Registry (The "Store")
We will create a registry where vendors can publish their component datasheets as `mdk` packages.
*   **Example:** `@mdk/maxon-re40`.
*   **Content:** This package contains the specific parameters (`R`, `I`, `k_t`) for that motor.
*   **Function:** When the synthesizer builds the system, it reads these parameters and injects them into the correct Bond Graph elements, ensuring that a "Maxon RE40" in the code behaves exactly like the physical component.

## Deliverables

1.  **`core-engine` (Wasm):**
    *   Data structures for Bond Graph Elements and Nodes.
    *   Implementation of the Causality Assignment Algorithm.
    *   State-Space matrix generation.

2.  **`mdk` CLI:**
    *   `synth`: Generates Specification + State-Space Model.
    *   `validate`: Runs the C/Wasm linter on existing code.
    *   `deploy`: Uploads the specification to a cloud MBSE platform (e.g., PTC ThingWorx or a custom dashboard).
    *   `package`: Publishes the component to the registry.
    *   `new`: Creates a new project.
    *   `search`: Searches the registry for components.
    *   `add`: Adds a component to the project.
    *   `remove`: Removes a component from the project. 
    *   `list`: Lists all components in the project.
    *   `research`: Talks to an LLM which finds out what hardware is availble online on Amazon, or Alibaba, etc. and generates an L3 construct based on the engineers spec., and then registers it. The LLM should be able to use the mdk research api to find components and then use the mdk add api to add them to the project.
    *   `digital-twin`: Runs a digital twin simulation locally.
    *   `dashboard`: Runs a dashboard to visualize the digital twin.
    *   `harness`: Runs a harness to test the digital twin with real-time data.
    *   `firmware`: Generates C code for a generic microcontroller (e.g., STM32) that implements a PID controller or State-Space controller using the generated matrices.
    *   `simulink`: Generates Simulink models for simulation.
    *   `scipy`: Generates Python code for simulation.
    *   `pcb`: Generates PCB layout files for the system.
    *   `cad`: Generates CAD models for the system.
    *   `solidworks`: Generates SolidWorks models for the system.
    *   `autodesk-fusion-360`: Generates Autodesk Fusion 360 models for the system.
    *   `ptc- Creo`: Generates PTC Creo models for the system.
    *   `ansys`: Generates Ansys models for the system.
    *   `rhino`: Generates Rhino models for the system.
    *   `blender`: Generates Blender models for the system.
    *   `sketchup`: Generates SketchUp models for the system.
    *   `onshape`: Generates Onshape models for the system.
    *   `mcp`: Generates MCP models for the system.
    *   `open-cascade`: Generates OpenCascade models for the system.
    *   `freecad`: Generates FreeCAD models for the system.
    *   `zbrush`: Generates ZBrush models for the system.
    *   `catia`: Generates CATIA models for the system.


3.  **TypeScript Constructs:**
    *   L1Primitives (Se, I, C, R, TF, GY, 0, 1).
    *   L2Composites (DCMotor, Gearbox, LinearSlider).
    *   Vendor Packs (Example: Maxon DC Motors).

## Conclusion

By treating mechatronics as code, we apply the discipline of software engineering to the physical world. **mdk** enables:
*   **Traceability:** Every physical parameter is tracked in Git.
*   **Collaboration:** Mechanical, electrical, and software teams work on the same TypeScript codebase.
*   **Validation:** Physical paradoxes are caught at compile time, not during expensive hardware integration.

---

## Architecture Evolution (2026-04-30)

*This section supersedes and extends the above where they conflict. The original remains for historical context.*

### Tagline

> **"MDKd oracle: forces you to confront the business topology in the same language you use to model physical systems."**

---

### 1. The Two-Track Authoring Model

The original CONOPS assumed TypeScript constructs as the only authoring path. The evolved architecture supports two tracks that converge on the same artifact:

```
Track A (Domain Experts / Provider Authors):
  TypeScript constructs  →  synth()  →  Model Assembly JSON

Track B (End Users / Chat):
  Chat prompt  →  Claude API (structured output)  →  Model Assembly JSON

Both tracks:
  Model Assembly JSON  →  Zod/AJV schema validation  →  WASM kernel  →  Simulation results + BOM
```

**Schema is the lingua franca.** TypeScript constructs are a knowledge-encoding tool for domain experts who publish `@mdk/provider-*` packages. LLM structured output is the knowledge-application interface for end users who never write TypeScript. The WASM kernel speaks only JSON.

**Why not LLM → TypeScript?** LLMs generating TypeScript have three failure modes (compile error, synthesis error, semantic physics error) vs one for JSON (schema validation failure). Structured outputs use constrained decoding to guarantee schema compliance. TypeScript constructs remain valuable as the knowledge base that trains and grounds the LLM's JSON synthesis — they become RAG data and fine-tuning examples, not user-facing artefacts.

---

### 2. Distribution: Native Node.js MCP Server

The MCP server is a standard Node.js HTTP server. No bundling, no SEA, no special packaging — users who run it locally already have Node.js, and the cloud target is Lambda which provides the runtime itself.

```
mdk-server (Node.js)
├── MCP protocol handler
│   ├── stdio transport    — Claude Desktop / VSCode (local)
│   └── HTTP/SSE transport — Lambda / hosted endpoint (cloud)
├── Tool implementations
│   ├── create_model      — initialise a Model Assembly JSON from schema
│   ├── run_simulation    — execute WASM kernel on model JSON
│   ├── generate_bom      — extract component list with commercial metadata
│   ├── validate_model    — run BG causality + domain-specific rules
│   └── generate_diagram  — produce Graphviz/Mermaid from model graph
├── WASM kernel (path-resolved asset, same file locally and in Lambda)
├── Zod schema validator (runs before WASM, on all JSON input)
└── Local inference client (HTTP → llama.cpp OpenAI-compat API)
```

**Two entry points, one codebase:**
```
Local dev:   node dist/index.js --transport stdio   (Claude Desktop / VSCode)
             node dist/index.js --transport http    (local HTTP for testing)
Cloud:       Lambda handler wrapping the same tool implementations
```

The WASM kernel is a plain file reference (`path.resolve(__dirname, 'kernel.wasm')`). No bundling needed — Lambda includes it as a deployment asset alongside the JS bundle.

**Local model routing:**  
Tool implementations call `localhost:8080` (llama.cpp OpenAI-compat API) for low-stakes inference (parameter suggestions, unit conversions, JSON boilerplate). Claude API handles synthesis. Cost routing is a config flag — local first, Claude API as fallback.

---

### 3. The "Construct" Product

The end-user product is a **private MCP server** backed by Claude API, named "Construct":

```
User (plain English) → Claude Desktop / VSCode
  → MCP tool: create_model (structured output against MDK JSON schema)
  → MCP tool: run_simulation (WASM kernel)
  → MCP tool: generate_bom (commercial metadata from component catalog)
  → Results delivered in chat context
```

No TypeScript knowledge required. No Bond Graph knowledge required. The user describes their system; Claude synthesizes a valid Model Assembly JSON; the WASM kernel validates physics and runs simulation; results return to chat.

**Pricing:** Metered per synthesis, per BOM export, or per simulation run. Claude Pro users install the MCP server locally; enterprise users call a hosted endpoint.

---

### 4. The Moat

The open/closed boundary is deliberate:

| Open (public, builds trust) | Closed (private, builds moat) |
|---|---|
| WASM kernel source | Synthesis prompt templates |
| BG primitive schema | Component catalog (prices, tolerances, lead times) |
| JSON schema definition | Fine-tuned domain models |
| `@mdk/provider-*` package format | MDKd oracle calibrated parameters |
| CLI (`mdk synth`, `mdk validate`) | "Construct" MCP server source |

The WASM kernel being open does not give away the synthesis quality — the kernel only validates and simulates. Synthesis quality depends on the prompts, the RAG store, and the component catalog, all of which remain private.

---

### 5. MDKd Oracle: Eating Our Own Dog Food

MDK models its own business as a running MDK instance. This is not metaphorical — the MDKd oracle is a real Model Assembly JSON with:

**Bond Graph layer (energy/$ flow quantification):**
- `Se` Sources: revenue streams (MCP subscriptions, BOM exports, enterprise licenses, research grants)
- `C` Stores: reputation capital (τ ~ 12 months), codebase capability (τ ~ 3 months), domain coverage
- `R` Flows: user conversion rate (GitHub star → paid), churn, support burden per user
- `Sink` (dissipators): operational costs (AWS, Claude API), developer time, subsidised domains (ecology, research)
- `GY` Transducer: "Construct" product — transforms Claude API cost (electrical domain) into MDK synthesis value (information domain)

**Beer's Viable System Model layer (organisational control structure):**

| VSM System | MDK Mapping |
|---|---|
| S1 — Operations | WASM simulation runs per domain (`@mdk/provider-*`) |
| S2 — Coordination | MCP server routing requests between domains and models |
| S3 — Control | $ resource allocation across domain investments |
| S3* — Audit | CDKd validation lambda — divergence detector (forecast vs actual) |
| S4 — Intelligence | NEAT topology search + PINN parameter calibration, market scanning |
| S5 — Policy | Pareto frontier of business model topologies; viability constraints |

BG quantifies *how much* flows where. VSM defines *who regulates what*. They are orthogonal axes — BG is the physics layer, VSM is the governance layer. Both run on the same WASM kernel.

**NEAT in the oracle:**  
Genotype = MDK JSON business model topology. Fitness = multi-objective: $ ROI, domain coverage, user growth rate, ecological domain viability. NEAT evolves the topology (add/remove revenue streams, adjust feedback paths) over simulated quarters. Output is a Pareto frontier of viable business topologies, not a single "correct" answer.

**PINN/CMA-ES in the oracle:**  
Once 6+ months of real data exists (Stripe revenue, GitHub metrics, CloudWatch API usage), PINN calibrates R, C, TF parameters in the business BG model against observed history. Physics constraint in the PINN loss function: $ conservation (revenue in = stored + consumed + in-flight). The fitted model is then projected forward.

**CDKd loop:**
- *How it started:* Synthesized business model JSON at t=0 (forecasts)
- *How it is going:* Actual metrics ingested from Stripe, GitHub, CloudWatch, Hydstra
- *Divergence signal:* When actual flows deviate beyond uncertainty bands, the oracle identifies the causal path — not "revenue is down" but "reputation Store decaying faster than modelled because domain coverage Store is under-invested"

---

### 6. Domain Extensions

**Odum ESL (`@mdk/provider-odum`):**  
Store (≈ BG C), Source (≈ BG Se), Sink, Flow (≈ BG R + junction). Emergy accounting. `Site` construct anchoring models to physical locations with Hydstra API and SQLite data sources. ValidationRuleSet registry inheriting from `bondgraph` and extending with Odum-specific rules.

**Other domains via `@mdk/provider-*` pattern:**  
Each provider encodes domain physics once, in a testable versioned form. Provider packages become RAG data for LLM synthesis — the LLM learns correct patterns from compiled construct examples.

---

### 7. Persistence, RAG, and Local Models

| Task | Model | Rationale |
|---|---|---|
| Model synthesis (create_model) | Claude API | Highest fidelity, structured output, schema-constrained |
| Parameter suggestions | llama.cpp (local) | Low-stakes, fast, no API cost |
| Component catalog lookup | Embeddings + vector store (RAG) | Retrieval, not generation |
| BOM enrichment (prices, lead times) | RAG + web tool | Catalog data changes frequently |
| MDKd oracle inference | Fine-tuned local model (long-term) | Domain-specific, runs offline |

The component catalog is the primary RAG store. As `@mdk/provider-*` packages accumulate real hardware data, the catalog becomes the main quality differentiator — the LLM synthesis is only as good as what it retrieves.

---

### 8. Revenue Day One

Priority ordering driven by sales cycle length:

1. **Immediate:** MCP server in Claude Desktop — zero friction trial, Claude Pro users already paying. Charge per synthesis or BOM export.
2. **Month 2–3:** Hosted "Construct" endpoint for teams — shared component catalog, persistent projects.
3. **Month 6+:** Enterprise domain packages (HVAC, water, ecology) — longer sales cycle, institutional procurement.
4. **Ongoing:** Research licensing, academic partnerships, grant co-applicant on ecology/sustainability projects.

The MDKd oracle tracks actual vs forecast for each of these streams from day one, even before NEAT/PINN is active — the static BG model alone is useful for decision-making.

---

### 9. Cloud Deployment Architecture

#### Distribution Boundary: Local vs Cloud

The same Node.js MCP server codebase runs in both contexts. Lambda provides its own runtime — no bundling or special packaging needed. The WASM kernel is a plain file asset in both cases:

```
Local:   node dist/index.js ──stdio──►  Claude Desktop / VSCode (MCP client)
Cloud:   Lambda handler     ──HTTP/SSE► Claude API remote tool use / web SPA
```

#### Compute Strategy

WASM simulation is CPU-bound and completes in milliseconds for typical BG models. Lambda ARM64 (Graviton) is the correct shape:
- ~20–30% cheaper than x86 per invocation
- Excellent performance for compiled WASM
- Scales to zero between requests — zero fixed cost at low traffic
- 256–512 MB memory is sufficient for all current BG workloads
- Provisioned concurrency on `mdk-simulate` eliminates cold start if chat UX requires it

Use **HTTP API Gateway** (not REST API) — 70% cheaper, lower latency, native Cognito JWT authorisation without a Lambda authoriser for standard routes.

Use **VTL mapping templates** for routes that only transform and forward — approximately 20–30% of routes qualify. Everything involving WASM, multi-step logic, or Claude API calls requires Lambda.

#### Full Stack Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                    │
│  CloudFront + S3  (SPA: React/Svelte, static assets)       │
│  Cognito  (social login → JWT)                             │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS + JWT
┌──────────────────────▼──────────────────────────────────────┐
│  API Gateway HTTP API                                       │
│  ├── VTL → DynamoDB        model metadata CRUD             │
│  ├── VTL → S3              presigned URLs (upload/download) │
│  └── Lambda proxy                                          │
│       ├── mdk-chat         Claude API tool_use loop        │
│       ├── mdk-simulate     WASM kernel  ARM64 256MB        │
│       ├── mdk-validate     WASM kernel + Zod/AJV           │
│       └── mdk-bom          catalog lookup + enrichment     │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  Storage                                                    │
│  S3                                                         │
│    model-assembly/   user Model Assembly JSON (versioned)  │
│    reports/          BOMs, diagrams (presigned on demand)  │
│    oracle/           MDKd oracle snapshots                 │
│  DynamoDB (on-demand billing)                              │
│    Models            metadata (owner, domain, status)      │
│    ComponentCatalog  BG params, prices, tolerances         │
│    OracleTimeseries  business model state history          │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  MDKd Oracle  (scheduled, not request-driven)               │
│  EventBridge Scheduler ──► Lambda (mdk-oracle)             │
│    reads:   Stripe API, GitHub API, CloudWatch metrics     │
│    runs:    WASM BG simulation of business model           │
│    writes:  DynamoDB OracleTimeseries                      │
│             CloudWatch custom metrics (oracle dashboard)   │
│  Cadence:   hourly for metrics ingestion                   │
│             daily for full BG simulation + CDKd check      │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  Inference                                                  │
│  Bedrock (managed, pay-per-token)                          │
│    Llama / Mistral for low-stakes tasks                    │
│    Bedrock Knowledge Base for component catalog RAG        │
│    Switch to EC2 t4g llama.cpp when Bedrock > ~$200/month  │
│  Claude API (synthesis, primary chat)                      │
│    Called from mdk-chat Lambda only                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  Agent Orchestration                                        │
│  Step Functions  (multi-step, durable, retryable)          │
│    e.g. provision site → simulate → BOM → notify          │
│    each state = Lambda invocation                          │
│  mdk-chat Lambda  (conversational tool_use loop, stateless)│
└─────────────────────────────────────────────────────────────┘
```

#### Specific Questions Resolved

| Question | Answer |
|---|---|
| What does MCP do in cloud? | Local Node.js server uses MCP over stdio. Cloud uses Claude API `tool_use` — `mdk-chat` Lambda calls MDK tool Lambdas on Claude's behalf. Web SPA never speaks MCP directly. |
| Where are BOMs and reports stored? | Generated on demand by `mdk-bom` Lambda. Returned in API response for immediate display. Persisted to `s3://reports/{userId}/{modelId}/bom.json` + presigned URL for download/share. |
| Where does MDKd oracle run? | EventBridge Scheduler → `mdk-oracle` Lambda on a schedule. No always-on process. Effectively $0 at early-stage cadence. |
| Where do small LLMs run? | Bedrock (managed, zero infra) until volume justifies EC2 ARM + llama.cpp (~$30/month fixed vs per-token). |
| Where do agents run? | Conversational agents: `mdk-chat` Lambda (tool_use loop, stateless per request). Long-running workflows: Step Functions + Lambda workers. |

#### Cost Profile at Early Stage

| Service | Estimated monthly cost at low traffic |
|---|---|
| CloudFront + S3 (SPA) | < $1 |
| API GW HTTP API | < $5 |
| Lambda (ARM64, on-demand) | < $5 |
| DynamoDB (on-demand) | < $5 |
| S3 (model + report storage) | < $2 |
| EventBridge + oracle Lambda | < $1 |
| Bedrock (small model tasks) | ~$10–30 depending on volume |
| Claude API (synthesis) | Variable — passed through to user pricing |
| **Total fixed infrastructure** | **< $50/month** |

Claude API synthesis cost is metered to users — it is not a fixed infrastructure cost. The platform itself runs near-zero until real traffic arrives.