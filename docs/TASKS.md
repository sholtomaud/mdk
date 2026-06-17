# TASKS

> **Status key:** `[x]` complete · `[~]` in progress · `[ ]` todo · `[-]` blocked  
> **Scope key:** `MVP` ship-blocking · `EXT` post-MVP extension · `RES` research / long-term  
> **Partner flag:** `⚑` task requires an external academic or industry partner

---

## Architecture Overview

```
TypeScript CDK (@mdk/core)          @mdk/dia (drag-and-drop Webview)
         |                                      |
         └──────────────┬───────────────────────┘
                        |
LLM structured output ──┘  ← Claude API constrained decoding against mdk.schema.json
   (Track B: chat users)      (Track A: domain experts / provider authors)
                        ↓
              JSON model spec  ← canonical, version-controlled
                        ↓
         Zod/AJV schema validation
                        ↓
         @mdk/sim-kernel (C/WASM)
         ├── Domain: Bond Graph  (ported from Phase 1 C engine)
         └── Domain: Odum ESL   (ported from GSSK)
                        ↓
              Output artefacts
         ├── mdk firmware  (embedded C)
         ├── mdk scipy     (Python simulation)
         ├── mdk simulink  (Simulink export)
         ├── @mdk/runtime  (digital twin)
         └── BOM           (commercial metadata)
```

**Key constraints:**
- JSON model is truth. TypeScript constructs, the diagram editor, and LLM structured output are all authoring paths to the same JSON.
- TypeScript → JSON: `mdk synth()` (always available)
- LLM → JSON: Claude API structured output constrained to `mdk.schema.json`; Zod validates before WASM
- Diagram → JSON: `@mdk/dia` Webview writes back to the model file (bidirectional)
- JSON → TypeScript: one-way codegen export only (T2.5, Extension scope) — no live sync in this direction
- TypeScript constructs serve double duty: domain knowledge encoding for experts, and RAG/fine-tuning source for LLM synthesis quality

**Retired projects:** GSSK and gssk-dia are retired as standalone repos. Their code is ported into the MDK monorepo as `@mdk/sim-kernel` (Phase 0) and `@mdk/dia` (Phase 6).

---

## Scope Overview

### MVP — Build This First

| ID | Task |
|----|------|
| T1.1 | Bond Graph Library (Core-BG) — ✅ done |
| T1.2 | WASM Integration & JSON Bridge — ✅ done |
| T0.1 | Fork GSSK into `packages/sim-kernel` as `@mdk/sim-kernel` — ✅ done |
| T0.2 | Add Bond Graph domain mode to sim-kernel — ✅ done |
| T0.3 | Extend shared JSON schema for both Odum ESL and Bond Graph — ✅ done |
| T0.4 | Update WASM bridge to expose both domain modes — ✅ done |
| T0.5 | Migrate GSSK tests; add Bond Graph simulation integration tests — ✅ done |
| T2.1 | Project Setup & CLI Scaffolding — ✅ done |
| T2.2 | TypeScript Constructs (`@mdk/core`) — ✅ done |
| T2.3 | State-Space Matrix Solver (wired into `@mdk/sim-kernel`) — ✅ done |
| T2.4 | Output Generators (`firmware`, `scipy`, `simulink`) — ✅ done |
| T3.1 | Vendor Package Specification — ✅ done |
| T3.2 | Registry CLI + seed packages — ✅ done |
| T5.1 | JSON Schema & Zod Validation Layer — ✅ done |
| T5.2 | TypeScript Language Server Plugin — ✅ done |
| T5.3 | VSCode Extension (linting + `@mdk/dia` Webview panel) — ✅ done |
| T6.1 | Migrate gssk-dia → `@mdk/dia` web component package — ✅ done |
| T6.2 | Add Bond Graph element types to `@mdk/dia` palette — ✅ done |
| T6.3 | Bidirectional JSON sync: VSCode file system ↔ `@mdk/dia` Webview — ✅ done |

### Extension — After MVP Ships

| ID | Task |
|----|------|
| T2.5 | TypeScript codegen from JSON model (one-way export) |
| T2.6 | `ModelConstruct` base class — CDK-style scope/id/props pattern |
| T2.7 | `ModelStack` base class — multi-artefact `synth()` (simulation JSON + CloudFormation + validator) |
| T2.8 | `mdk synth --bom` — Bill of Materials with commercial metadata from `mdk-package.json` |
| T0.8 | Parameter calibration harness — CMA-ES optimizer extending `advanced.c` (backtesting against Hydstra timeseries) |
| T0.9 | NEAT structure discovery — TypeScript population manager + WASM kernel fitness evaluator |
| T3.3 | LLM-Powered Component Research (`mdk research`) — GitOps review gate |
| T3.4 | `@mdk/provider-odum` package — `Store`, `Source`, `Sink`, `Flow`, `Site`, `SiteRegistry` with Hydstra API + SQLite loading |
| T4.1 | Digital Twin Runtime (`@mdk/runtime`) |
| T4.2 | Local Digital Twin & Dashboard CLI (embeds `@mdk/dia`) |
| T4.4 | CDKd Validation Lambda — queries CloudWatch/IoT metrics, computes divergence from sim prediction, alerts on drift ("how it started vs how it is going"). Captures deployed AWS ARNs into MDK model assembly JSON for audit trail. |
| T5.4 | GitHub Pages HTML/WASM interactive demo (priority onboarding tool — no install required) |
| T5.6 | Native Node.js MCP Server Platform — stdio + HTTP transports, Zod gate, WASM loading, Lambda handler, llama.cpp routing |
| T5.5 | "Construct" Product — LLM synthesis layer: Claude structured output → MDK JSON → BOM + diagrams (revenue day one) |
| T10.1 | MDKd Oracle — BG+VSM business model, EventBridge scheduler, Stripe/GitHub/CloudWatch ingestion, CDKd divergence loop |
| T10.2 | Cloud Platform CDK Stack — CloudFront+S3 SPA, Cognito, API GW HTTP API, VTL routes, Lambda suite, DynamoDB, S3 buckets |
| T4.3 | Harness (Real-Time Data Testing) |
| T5.4 | GitHub Pages HTML/WASM demo site |
| T6.4 | `@mdk/dia` embedded in `mdk dashboard` |
| T6.5 | `mdk diagram` Export CLI |
| T7.1 | `assertSafetyEnvelope()` API |
| T9.1 | `InformationBond` Type & Signal-Flow Semantics |
| T9.3 | `@mdk/aws-constructs` Package |

### Research — Long-Term, Some Require Partners

| ID | Task | Partner |
|----|------|---------|
| T0.6 | Dual TDC/IDC solver mode (Giannantoni IDC + drift metric) | ⚑ Mathematics / dynamical systems researcher |
| T0.7 | Fractional-order Bond Graph elements (Grünwald-Letnikov, Warburg, viscoelastic) | — |
| T6.6 | SysML IBD view in `@mdk/dia` | ⚑ Systems engineering domain expert |
| T7.2 | Topological Prover (Conservation Laws) | — |
| T7.3 | State-Space Safety Envelope Model Checking | ⚑ Academic (control theory / formal methods) |
| T7.4 | `mdk prove` CLI | ⚑ Depends on T7.3 |
| T8.1 | Fault Injection Engine | ⚑ Engineering domain (failure mode databases) |
| T8.2 | Monte Carlo Simulation Runner | — |
| T8.3 | Fault Simulation Report Generator | ⚑ Engineering domain |
| T8.4 | CI/CD Integration (`mdk test --fault-sim`) | — |
| T9.2 | Cloud Latency as Physical Delay Block | ⚑ Probabilistic framing required |
| T9.4 | `Fleet.Swarm` Construct & SRE Metrics | — |
| T9.5 | Bode Plot / Nyquist Stability Analysis | ⚑ Control theory review |
| T9.6 | Stochastic Disturbance Injection (Packet Loss) | — |
| T9.7 | Edge vs. Cloud Trade-off Simulator | — |

---

## Phase 0 — @mdk/sim-kernel: Kernel Migration (GSSK + Bond Graph) 🔄

GSSK is retired as a standalone project. Its C simulation engine is ported into the MDK monorepo as `packages/sim-kernel` and published as `@mdk/sim-kernel`. The Bond Graph C engine from Phase 1 is integrated as a second domain mode alongside GSSK's existing Odum ESL domain.

### T0.1 — Fork GSSK into `@mdk/sim-kernel` `MVP` ✅
> Priority: **high** | Depends on: —

- [x] Copy GSSK source (`gssk.c`, `advanced.c`, `main.c`) from https://github.com/sholtomaud/GSSK/ into `packages/sim-kernel/src/domains/odum-esl/`
- [x] Bond Graph code (Phase 1) moved from `packages/core-engine/` into `packages/sim-kernel/src/domains/bondgraph/`; `packages/core-engine/` deleted
- [x] Root `package.json` with npm workspaces pointing to `packages/*`
- [x] `CMakeLists.txt` written for sim-kernel: two domain static libs (`simkernel_bondgraph`, `simkernel_odum`), both building with `-Wall -Wextra -Werror -pedantic`
- [x] All 18 Bond Graph unit tests pass in the new location
- [x] All 7 GSSK regression tests pass in the new location (8/8 CTest)
- [ ] Publish as `@mdk/sim-kernel` on npm with pre-compiled WASM binary

### T0.2 — Add Bond Graph Domain Mode to sim-kernel `MVP` ✅
> Priority: **high** | Depends on: T0.1, T1.1

- [x] Port `bondgraph.c`, `bondgraph.h`, `json_io.c`, `json_io.h` into `packages/sim-kernel/src/domains/bondgraph/` (done in T0.1)
- [x] Implement `bg_compute_derivatives()` in `bg_solver.c`: seeds from Se/Sf/C/I state, propagates through J0 (KCL), J1 (KVL + common flow), R, TF, GY with fixed-point iteration; harvests `dq/dt` and `dp/dt` with power-direction sign convention
- [x] Bond Graph Euler/RK4 solver loop (`bg_simulate()`) in `bg_solver.c`; domain dispatched via `"domain"` field in JSON
- [x] `sim_kernel_run()` in `wasm_bridge.c` dispatches to Bond Graph or Odum ESL path; both domains share the same compiled binary
- [x] `advanced.c` (calibration, ensemble forecasting) available via `simkernel_odum` library linked into both test runner and WASM target
- [x] Validation: RC charging `V_C(t=τ) = 7.5854V` (analytic 7.5854V, 0.000% error); RC discharge also validated; RK4 at dt=0.0001s
- [x] 22/22 Bond Graph tests pass; 8/8 CTest (including 7 Odum ESL regression models)

### T0.3 — Extend Shared JSON Schema `MVP` ✅
> Priority: **high** | Depends on: T0.2

- [x] Existing GSSK JSON schema extended (not replaced) with Bond Graph element types — unified schema at `packages/sim-kernel/schema/mdk.schema.json`; `gssk.schema.json` kept with deprecation pointer
- [x] Bond Graph node types added: `Se`, `Sf`, `R`, `C`, `I`, `TF`, `GY`, `J0`, `J1`; `FractionalC`/`FractionalR` reserved for T0.7
- [x] Bond Graph edge type: `power_bond` (distinct from Odum ESL flow edges using `logic`/`params`)
- [x] `InformationBond` edge type reserved in `bg_bond.type` enum (implemented in T9.1)
- [x] Visual metadata layer: `visual_node` (`x`, `y`, `label`) and `visual_edge` (`cpx1`/`cpy1`/`cpx2`/`cpy2` cubic Bézier + `label`) on all node/element and edge/bond objects
- [x] Schema versioned (`"schemaVersion": "1.0"`) as optional field (absent on legacy GSSK models for backward compatibility; required on new models)
- [x] `oneOf` discriminated union: `odum_esl_model` (requires `nodes`) vs `bondgraph_model` (requires `domain:"bondgraph"` + `elements` + `bonds`); legacy GSSK files with no `domain` field still validate

### T0.4 — Update WASM Bridge `MVP` ✅
> Priority: **high** | Depends on: T0.3

- [x] WASM bridge (`wasm_bridge.c`) updated to dispatch to the correct domain based on `"domain"` field — implemented in T0.2 via `sim_kernel_run()` → `run_bondgraph()` / `run_odum()`
- [x] Single exported function: `sim_kernel_run(json_input)` → returns simulation results + causality report — live, `EMSCRIPTEN_KEEPALIVE`, listed in CMake `EXPORTED_FUNCTIONS`
- [x] Existing `validate_bondgraph` entry point preserved for backward compatibility — unchanged

### T0.5 — Migration Tests `MVP` ✅
> Priority: **high** | Depends on: T0.4

- [x] All 22 Bond Graph unit tests pass (22/22 — includes 18 original Phase 1 tests plus 4 simulation tests)
- [x] All 7 GSSK regression models pass (odum_regression_* in CTest)
- [x] Integration test: Odum ESL model runs end-to-end through `sim_kernel_run()` — `test_kernel_integration.c` (3 tests: simple model, decay/RK4, bad JSON error path)
- [x] Integration test: Bond Graph RC circuit runs simulation through `sim_kernel_run()` — `test_sim_kernel_run_rc` in `test_sim.c`
- [x] All 9 CTest entries pass with `-Wall -Wextra -Werror -pedantic`

### T0.8 — Parameter Calibration Harness `EXT`
> Priority: **high** | Depends on: T0.2, T0.5

Extends `advanced.c`'s existing ensemble forecasting with a proper gradient-free optimiser for parameter estimation against observed timeseries.

- [ ] Implement CMA-ES (Covariance Matrix Adaptation Evolution Strategy) in `advanced.c` — robust gradient-free optimiser suitable for the k-parameter space of Odum ESL models
- [ ] Calibration loop: load Hydstra timeseries via `SiteRegistry` → run kernel with candidate params → compute MSE residual → update via CMA-ES → repeat
- [ ] Expose via TypeScript: `calibrate(model: OdumEslModel, observed: Timeseries, options?: CalibrationOptions): Promise<CalibratedModel>`
- [ ] Output: best-fit parameter set, residual history, confidence intervals (from ensemble)
- [ ] Integration test: synthetic Yarrangobilly soil-water model, known params → noised timeseries → calibration recovers params within 5%

### T0.9 — NEAT Structure Discovery `EXT`
> Priority: **medium** | Depends on: T0.8

NEAT (NeuroEvolution of Augmenting Topologies) applied to model structure: evolves the graph topology (add/remove nodes and edges) when parameter calibration alone cannot reduce residuals.

Architecture note: NEAT population management (crossover, mutation, speciation) operates on MDK JSON model specs in TypeScript. Fitness evaluation calls `runKernel()` — already WASM. No new C work required for NEAT itself.

- [ ] TypeScript NEAT population manager: individual = JSON model spec, mutation = add/remove Store/Flow, crossover = merge two model specs at a structural boundary
- [ ] Fitness function: weighted sum of MSE against observed timeseries + model complexity penalty (fewer nodes preferred)
- [ ] Speciation to maintain topological diversity during evolution
- [ ] Output: Pareto front of (fitness, complexity); user selects preferred model structure
- [ ] Identified novel structures publishable as `@mdk/provider-*` constructs with provenance metadata

### T0.6 — Dual TDC / IDC Solver Mode `RES` ⚑
> Priority: **medium** | Depends on: T0.2 | Partner: Mathematics / dynamical systems researcher

Giannantoni's Incipient Differential Calculus (IDC) is the mathematical formalisation of Odum's Maximum Em-Power Principle — the same theoretical tradition the Odum ESL domain is built on. IDC claims explicit closed-form solutions for nonlinear ODE classes that TDC (Traditional Differential Calculus / RK4) solves only numerically (Riccati, Abel equations, co-production feedback systems).

The goal here is not to replace TDC with IDC, but to run **both solvers on the same model** and expose the output together. This lets users and researchers observe "drift" — the divergence between TDC and IDC solutions — empirically, for real systems. This is a novel research capability no existing tool offers.

> **Scope constraint:** Full IDC requires symbolic algebraic manipulation (constructing binary/duet/n-et functions from `φ̃'`). That is a CAS, not a numerical solver. Phase 1 of this task therefore implements IDC only for the specific ODE classes that have known closed-form IDC solutions (Riccati, linear ODEs with variable coefficients ≤ order 4). General symbolic IDC is out of scope.

- [ ] Implement IDC closed-form solver for first-order linear ODEs with variable coefficients (basis case, verifiable)
- [ ] Implement IDC solver for Riccati equation (models co-production / interaction feedback in Odum ESL)
- [ ] Both TDC (RK4) and IDC run on the same model; results returned in the same JSON payload under `"tdc"` and `"idc"` keys
- [ ] Drift metric computed and exposed: `"drift": { "max": float, "rms": float, "first_divergence_t": float }`
- [ ] Unit tests: for cases where TDC and IDC are known to agree (linear constant-coefficient ODEs), drift is within numerical tolerance
- [ ] Unit tests: for Riccati with feedback, IDC returns an explicit duet-function solution; TDC returns a numerical trajectory; drift is quantified
- [ ] Both modes available in both Odum ESL and Bond Graph domains

> **Moving Riccati sub-item to EXT:** The Riccati equation appears directly in Odum ESL co-production feedback models (the Interaction flow type with feedback). Its IDC closed-form solution is known and can be hardcoded in C without a CAS. See T0.8 for the calibration prerequisite that makes this practically useful.

### T0.7 — Fractional-Order Bond Graph Elements `RES`
> Priority: **medium** | Depends on: T0.2, T2.3

Standard Bond Graph theory only handles integer-order constitutive relations. This is a real gap — real-world systems that cannot be correctly modelled without fractional-order elements include:
- **Viscoelastic materials** (rubber, polymers, biological tissue): stress/strain sits between spring (0th order) and damper (1st order); requires fractional `C` with 0 < α < 1
- **Electrochemical systems** (batteries, fuel cells): Warburg impedance ∝ s^{-1/2} — a half-order element that RC ladders only approximate
- **Porous media / anomalous diffusion**: Fick's law doesn't hold; fractional `R` needed

Primary numerical approach: **Grünwald-Letnikov** fractional derivative, which approximates the fractional derivative as a weighted sum of past values over a history window. This maps to a fixed-length ring buffer in C and can be implemented in WASM without a CAS. IDC's fractional incipient derivative is a secondary approach to compare against.

- [ ] Add `FractionalC(alpha)` and `FractionalR(alpha)` element types to the Bond Graph domain JSON schema (T0.3 extension)
- [ ] Implement Grünwald-Letnikov fractional derivative in `sim-kernel` — configurable order `α ∈ (0,1)`, configurable history window length
- [ ] Wire fractional elements into Bond Graph `compute_derivatives()` — fractional elements contribute to state derivative using GL approximation
- [ ] Validate: fractional spring-damper (`α = 0.5`) matches known analytic creep-compliance curves for viscoelastic materials
- [ ] Validate: Warburg impedance element (`α = 0.5`) produces correct impedance spectrum vs. frequency
- [ ] Compare Grünwald-Letnikov results against IDC fractional derivative (T0.6 dual-solver) where both are applicable
- [ ] Assess numerical stability with respect to history window length and time step

---

## Phase 1 — The "Linter" Core (C/Wasm) ✅

### T1.1 — Bond Graph Library (Core-BG) `MVP`
> Priority: **high** | Depends on: —

- [x] Struct definitions for `Se`, `Sf`, `R`, `C`, `I`, `TF`, `GY`, `J0`, `J1`, `power_bond`
- [x] Graph traversal implemented in `bondgraph.c` from `bondgraph.h`
- [x] SCAP (Sequential Causality Assignment Procedure) algorithm
- [x] Unit tests: RC circuit, RLC circuit
- [x] Unit tests: causality conflicts (two `Se` on `J0`, two `Sf` on `J1`)
- [x] Unit tests: DC Motor (Gyrator) topology, Transformer topology
- [x] All 10 tests passing with `-Wall -Wextra -Werror`

### T1.2 — WASM Integration & JSON Bridge `MVP`
> Priority: **high** | Depends on: T1.1

- [x] Vendor cJSON (MIT) for JSON parsing
- [x] `json_io.h` / `json_io.c` — JSON ↔ `SystemGraph` conversion
- [x] `wasm_bridge.c` — Emscripten entry point (`validate_bondgraph`)
- [x] `CMakeLists.txt` updated with Emscripten WASM target
- [x] JSON I/O + bridge tests (8 new tests)
- [x] All 18 tests passing with `-Wall -Wextra -Werror`
- [x] Root-level `AGENTS.md` created

---

## Phase 2 — The "Synthesizer" CLI (TypeScript) ⬜

### T2.1 — Project Setup & CLI Scaffolding `MVP` ✅
> Priority: **high** | Depends on: T0.5

- [x] Monorepo: npm workspaces (`packages/*`) with root `build`/`test`/`typecheck` scripts
- [x] `mdk` CLI (`packages/cli/`) using `commander` v12
- [x] `mdk new <project>` — scaffolds `mdk.config.json`, `package.json`, `tsconfig.json`, `src/model.ts` with RC circuit example
- [x] `mdk synth` — loads compiled model, calls `runKernel()`, writes `model.mdk.json`
- [x] `mdk validate` — validates schema with Zod then calls `validate_bondgraph` WASM entry point

### T2.2 — TypeScript Constructs (`@mdk/core`) `MVP` ✅
> Priority: **high** | Depends on: T2.1

- [x] `Element` base class with sequential id, `bond()` method, `toJSON()`; `PowerBond` with sequential id
- [x] L1 primitives: `Se`, `Sf`, `R`, `C`, `I`, `TF`, `GY`, `J0`, `J1` in `src/elements/primitives.ts`
- [x] `MdkSystem` — registers elements, collects unique bonds, `synth()` → `BondGraphModel`
- [x] `MdkStack` / `MdkApp` CDK-pattern containers
- [x] `synth()` re-maps element IDs to sequential integers and Zod-validates the output
- [x] L2 composites: `DCMotor`, `Gearbox`, `LinearSlider`, `PIDController` in `src/elements/composites.ts`
- [x] Domain-type enforcement: `bond()` throws `Domain mismatch` when connecting different-domain non-junction elements
- [x] Unit tests in `src/__tests__/synth.test.ts` (Vitest): valid RC synth, id assignment, domain mismatch throws, cross-domain via GY passes, schema validation

### T2.3 — State-Space Matrix Solver `MVP` ✅
> Priority: **high** | Depends on: T0.2

This is now a feature of `@mdk/sim-kernel`'s Bond Graph domain, not a separate library.

- [x] `bg_compute_state_space()` in `bg_solver.c` extracts A/B/C/D after SCAP using probe-column method (temporarily zeros sources, probes state and input unit vectors, restores)
- [x] Matrices included in the JSON simulation result payload under `"state_space"` key in `sim_result_to_json()`
- [x] WASM bridge computes and passes `BG_StateSpace *` through `run_bondgraph()` → exposed to TypeScript via `sim_kernel_run()` JSON response
- [x] Unit test: RC circuit A=[-10.0], B=[0.01], C=[1000.0], D=[0.0] (exact, 23/23 tests pass)
- [ ] _(Research extension)_ Stiff ODE solvers for electrical/mechanical hybrids — defer

### T2.4 — Output Generators `MVP` ✅
> Priority: **medium** | Depends on: T2.2, T2.3

- [x] `mdk synth` → Specification JSON (model + causality report + state_space)
- [x] `mdk firmware` → C code for STM32/generic MCU (forward-Euler state-space: `mdk_ss.h` + `mdk_ss.c`)
- [x] `mdk scipy` → Python/SciPy `solve_ivp` simulation script with matplotlib output
- [x] `mdk simulink` → MATLAB `.m` script creating Simulink state-space block via `add_block` + `c2d`

### T2.6 — `ModelConstruct` Base Class `EXT`
> Priority: **high** | Depends on: T2.2

CDK-style base class for all reusable system fragments. Replaces ad-hoc `MdkSystem` usage for user-authored constructs.

- [ ] `ModelConstruct(scope, id)` constructor — registers with parent scope, builds path string
- [ ] `synthesize()` — deep traversal collecting all `Element` and `PowerBond` instances in subtree
- [ ] `ValidationRuleSet` registry — domains register rule dialects; `ModelConstruct` runs validators on synthesis
- [ ] `OdumConstruct extends ModelConstruct` — registers Odum ESL validation rules (inherits BG rules + adds emergy signs, non-negativity)
- [ ] Remove `@ts-nocheck` from `examples/construct-pattern/` as each class is implemented
- [ ] Unit tests: scope path, deep synthesis, rule inheritance

### T2.7 — `ModelStack` Base Class `EXT`
> Priority: **high** | Depends on: T2.6

Synthesis boundary and multi-artefact producer. The Stack holds `SimConfig`; Constructs hold physics.

- [ ] `ModelStack(app, id, config: SimConfig)` — registers with `MdkApp`, holds sim config
- [ ] `synth()` — traverses child constructs, produces validated `OdumEslModel` or `BondGraphModel`
- [ ] `synth('cloudformation')` — traverses CDK constructs in same scope, produces CF template
- [ ] `synth('validator')` — produces Lambda handler code that queries CloudWatch and compares to sim prediction
- [ ] `output(id, subject, config?)` — registers output declarations; CBOR inferred from `Site` ancestor
- [ ] Infrastructure reference capture: when CDK resources are synthesized alongside MDK constructs, their CloudFormation logical IDs and resolved ARNs are stored in the MDK model assembly JSON under `"infrastructure"` block — creating an audit trail from model construct path to deployed AWS resource

### T2.8 — `mdk synth --bom` Bill of Materials Output `EXT`
> Priority: **medium** | Depends on: T2.7, T3.1

- [ ] Extend `mdk-package.json` schema with `commercial` block: `distributors[]`, `leadTimeDays`, `minOrderQty`, `tolerance` (per-parameter %)
- [ ] `mdk synth --bom` — traverses construct tree, collects all L3 component constructs with `mdk-package.json`, outputs BOM
- [ ] BOM format: JSON + Markdown table; fields: component, qty, distributor, SKU, unit price, lead time, extended price
- [ ] Total cost and critical-path lead time (longest lead time in the BOM) computed and surfaced
- [ ] Tolerance ranges from `commercial.tolerance` fed into T8.2 Monte Carlo runner for uncertainty bounds on simulation outputs
- [ ] Unit test: a construct tree with two components → BOM output matches expected structure

### T3.4 — `@mdk/provider-odum` Package `EXT`
> Priority: **high** | Depends on: T2.6, T2.7

The first real provider package. Implements the Odum ESL L3 construct API designed in `examples/construct-pattern/`.

- [ ] `Store`, `Source`, `Sink`, `Flow` TypeScript construct classes (map to BG C/Se/R elements internally)
- [ ] `Site` construct — holds `SiteConfig`, owns CBOR output inference
- [ ] `SiteRegistry` — `load(dbPath): SiteConfig[]` using Node.js native SQLite (`node:sqlite`)
- [ ] `Site.fromHydstraApi()` — async factory fetching timeseries from Hydstra REST API
- [ ] `Site.fromSQLite()` — sync factory from local SQLite Hydstra export
- [ ] Odum ESL validation rules registered with `ValidationRuleSet` (inherits BG rules + emergy signs + non-negativity)
- [ ] Integration test: Yarrangobilly site → fill/discharge simulation → snapshot test of output timeseries

### T4.4 — CDKd Validation Lambda `EXT`
> Priority: **medium** | Depends on: T2.7, T4.1

The "how it started vs how it is going" feedback loop. Simulation output is the specification; deployed system metrics are the observation.

- [ ] `ModelStack.synth('validator')` produces a Lambda handler that:
  1. Reads the MDK model assembly JSON (simulation prediction) from S3
  2. Queries CloudWatch / AWS IoT for actual timeseries metrics, using ARNs stored in the model assembly's `"infrastructure"` block
  3. Computes divergence (MSE, max deviation, first-divergence timestamp) between prediction and observation
  4. Posts divergence report to SNS topic; exits with non-zero if divergence exceeds threshold
- [ ] Lambda deployed on a CloudWatch Events schedule (configurable, default daily)
- [ ] Divergence report format mirrors TDC/IDC `"drift"` schema for consistency
- [ ] Integration test: synthetic CloudWatch data matching sim prediction → divergence near zero; perturbed data → divergence above threshold → SNS message sent

### T5.6 — Native Node.js MCP Server Platform `EXT` ✅
> Priority: **high** | Depends on: T0.5, T5.1

The transport and validation platform that all MCP tools run on. One codebase, two entry points.

- [x] `packages/mcp-server/` — Node.js package with `@modelcontextprotocol/sdk`
- [x] `--transport stdio` entry point — Claude Desktop / VSCode local use
- [x] `--transport http` entry point — local HTTP testing (SSEServerTransport + Express)
- [x] Lambda handler export stub (`src/lambda.ts`) — full implementation deferred to T10.2
- [x] Zod schema validation gate — all tool inputs validated before WASM invocation
- [x] WASM kernel loaded via existing `@mdk/core` `runKernel` / `validateBondGraph` bridge
- [x] Tool implementations: `create_model` (stub), `run_simulation`, `validate_model`, `generate_bom`, `generate_diagram`
- [x] `make mcp-server` and `make mcp-server-http` Makefile targets
- [x] esbuild used for transpilation (tsc OOMs on MCP SDK types); typecheck remains `tsc --noEmit`
- [ ] Local inference routing: `localhost:8080` (llama.cpp) for low-stakes tasks; config flag
- [x] Integration test: `validate_model` + `run_simulation` (TDC + IDC) + `generate_diagram` RC circuit round-trip through Zod + WASM (12 tests in `packages/mcp-server/src/__tests__/mcp-integration.test.ts`)

### T5.5 — "Construct" Product: LLM Model Synthesis `EXT`
> Priority: **high** | Depends on: T5.6, T3.4

Plain-English model generation via Claude structured outputs → MDK JSON → BOM + diagrams. The revenue day one surface. Depends on T5.6 for transport; this task implements the synthesis intelligence layer.

- [x] `create_model` tool: Gemini structured output with `SYSML_SCHEMA` responseJsonSchema; SysML-first with BG/Odum-ESL fallback
- [x] Domain-specific system prompt templates: SysML, Bond Graph, Odum ESL (including ecological)
- [x] `generate_bom` tool stub
- [x] `generate_diagram` tool: model JSON -> 9x SysML + ESL + BG Mermaid views
- [ ] Component catalog browsable as MCP resources
- [ ] Session storage: all generated models stored in SQLite (`~/.mdk/sessions.db`) for iteration and audit
- [ ] Pricing meter: synthesis calls logged with token counts for metered billing hookup

### T5.7 -- Pipeline Quality & Observability `EXT`
> Priority: **high** | Depends on: T5.6

- [x] **SSE streaming**: `GET /chat-stream` endpoint; `chatStream()` async generator yields `status`/`tool`/`reply` events per step; frontend renders each card immediately as it arrives
- [x] **Actor badges**: LLM (blue) / WASM (amber) / MDK (green) per-step status rows with spinner in send button
- [x] **Debug download**: download debug report button after each run; structured JSON with full prompt, all tool args+results, status events, duration
- [x] **Post-SCAP semantic checks**: `validate_model` runs 3 checks after causality passes -- no state variables, orphan elements, under-connected junctions; eliminates false-positive "causality OK" on topologically broken models
- [x] **SysML schema hardening**: `name` added to `required` in Gemini `responseJsonSchema`; rules 11-14 added to system prompt (FlowConnectionUsage mandatory, storage elements must be connected)
- [x] **Zod `SysmlPackage` refinement**: rejects packages with 0 `FlowConnectionUsage` at the schema layer
- [x] **Transpiler union-find bug fix**: `sysml-to-bg.ts` now distinguishes wire-node merges (Se/R/C/I ports = same physical node) from explicit junction bonds (J0/J1 PartUsage ports = power bond); fixes soil-water and similar models where intermediate junctions were collapsed into the first port

### T2.5 — TypeScript Codegen from JSON Model `EXT`
> Priority: **low** | Depends on: T0.3, T2.2

One-way export only. Generated code is a runnable starting point, not idiomatic — the user is expected to refactor it. No live sync in the JSON→TS direction.

- [ ] `mdk codegen <model.json>` → generates `model.ts` using `@mdk/core` constructs
- [ ] Generated code is valid TypeScript that `mdk synth` can round-trip back to equivalent JSON
- [ ] Output clearly commented: `// Generated by mdk codegen — refactor as needed`
- [ ] Unit tests: codegen output is syntactically valid and synthesises without error

---

## Phase 3 — The "Hardware Registry" (Ecosystem) ⬜

### T3.1 — Vendor Package Specification `MVP` ✅
> Priority: **high** | Depends on: T2.2

- [x] JSON schema for `@mdk/<vendor>-<model>` npm packages — `packages/vendor-spec/mdk-vendor.schema.json`
- [x] Required fields: `mdk.vendor`, `mdk.model_number`, `mdk.description`, `mdk.datasheet_url`, `elements[]` with `bgType`
- [x] `mdk package validate` — checks schema compliance (vendor, model_number, description, datasheet_url, elements)
- [x] `mdk package publish` — validates then `npm publish --access public`

### T3.2 — Registry CLI & Seed Packages `MVP` ✅
> Priority: **high** | Depends on: T3.1

- [x] `mdk search <query>` — searches npm registry for `@mdk/*` packages via HTTPS
- [x] `mdk add <name>` — `npm install @mdk/<name>` in the current project
- [x] `mdk remove <name>` — `npm uninstall @mdk/<name>` from the current project
- [x] `mdk list` — lists all `@mdk/*` packages in the current project's `package.json`
- [x] `mdk package validate [dir]` — validates `mdk-package.json` against vendor spec
- [x] `mdk package publish [dir]` — validates then `npm publish --access public`
- [x] Seed packages (mdk-package.json + package.json created, ready to publish):
  - [x] `@mdk/maxon-re40` — 5-element BG model (Ra, La, GY, Jr, B) from datasheet
  - [x] `@mdk/maxon-re65` — 5-element BG model (heavy-duty 250W)
  - [x] `@mdk/arduino-uno` — digital_out_5v, pwm_supply, supply_resistance
  - [x] `@mdk/raspberry-pi-4` — gpio_high, power_supply, idle_load
  - [x] `@mdk/adafruit-dc-motor-featherwing` — h_bridge_tf, driver_resistance, logic_supply
  - [ ] 15–20 further common components from Digi-Key / Adafruit catalogue

### T3.3 — LLM-Powered Component Research (`mdk research`) `EXT`
> Priority: **low** | Depends on: T3.1, T3.2

LLM agent researches hardware and proposes a construct. Never auto-merges — enters a GitOps review workflow requiring a verified engineering datasheet.

- [ ] `mdk research "<spec>"` — LLM finds hardware and drafts an L3 construct
- [ ] Output is a pull request, not a direct `npm publish`
- [ ] CI checklist enforced on the PR: datasheet URL present, parameters within plausible ranges, unit tests pass
- [ ] On merge, calls `mdk package` to publish to registry

---

## Phase 4 — The "Cloud Assembly" (Integration) ⬜

### T4.1 — Digital Twin Runtime (`@mdk/runtime`) `EXT`
> Priority: **medium** | Depends on: T2.4

- [ ] Reads Specification JSON from `mdk synth`
- [ ] Connects to a Digital Twin provider (AWS IoT TwinMaker or PTC ThingWorx)
- [ ] Streams real-time sensor data (MQTT / IoT Core) to the Twin
- [ ] Runs `@mdk/sim-kernel` simulation in parallel with live data
- [ ] Anomaly detection: flags divergence between sensor readings and model prediction

### T4.2 — Local Digital Twin & Dashboard CLI `EXT`
> Priority: **medium** | Depends on: T4.1, T6.4

- [ ] `mdk digital-twin` — runs a digital twin simulation locally
- [ ] `mdk dashboard` — launches a local web app embedding `@mdk/dia` for visualisation
  - [ ] Simulation View: live plot of system dynamics
  - [ ] Configuration View: change parameters, see simulation update in real-time
  - [ ] Digital Twin View: physical vs. simulated state comparison

### T4.3 — Harness (Real-Time Data Testing) `EXT`
> Priority: **low** | Depends on: T4.1

- [ ] `mdk harness` — injects real-time hardware data into the local simulation
- [ ] Configurable data sources: serial port, MQTT, file replay
- [ ] Pass/fail assertions against `assertSafetyEnvelope()` bounds during a harness run

---

## Phase 5 — Developer Experience: VSCode Extension & TS Language Plugin ⬜

### T5.1 — JSON Schema & Zod Validation Layer (TS↔WASM Bridge) `MVP` ✅
> Priority: **high** | Depends on: T0.3, T2.2

- [x] `BondGraphModel` and `OdumEslModel` defined with Zod in `packages/core/src/schema/` — mirrors `mdk.schema.json` exactly (same types, enums, constraints)
- [x] `Schema.parse()` called inside `runKernel()` and `validateBondGraph()` before every WASM invocation
- [x] `schemaVersion: '1.0'` included in synthesised output; Zod validates the literal
- [x] Unit tests: missing elements, unknown type, negative id — all caught by schema layer (`safeParse().success === false`)

### T5.2 — TypeScript Language Server Plugin `MVP` ✅
> Priority: **high** | Depends on: T5.1

- [x] TS compiler plugin (`@mdk/ts-plugin`) hooks into the language server via `typescriptServerPlugins`
- [x] `getQuickInfoAtPosition` override: injects Bond Graph semantics into hover docs for Se/Sf/R/C/I/TF/GY/J0/J1 + composites + CDK containers
- [x] `getSemanticDiagnostics` override: emits `Suggestion` diagnostic when `.bond()` is called between elements from different logical domains without a TF or GY
- [x] Registered as `typescriptServerPlugins` in the VSCode extension `package.json`

### T5.4 — GitHub Pages HTML/WASM Demo Site `EXT`
> Priority: **medium** | Depends on: T0.5, T6.1, T6.2

GSSK published an interactive WASM demo to GitHub Pages via VitePress. MDK should do the same. A user can open the page, draw a Bond Graph or Odum ESL model in `@mdk/dia`, run the sim-kernel, and see causality errors or simulation output — with no install required. This is the strongest possible onboarding and credibility tool.

- [ ] VitePress (or plain HTML) documentation site published to GitHub Pages
- [ ] Embeds `@mdk/dia` web component for interactive model editing
- [ ] Loads `sim_kernel.wasm` in the browser — Bond Graph and Odum ESL domain modes both available
- [ ] Example models pre-loaded: RC circuit (Bond Graph), simple ecological web (Odum ESL)
- [ ] Live causality check: editing a causality conflict highlights it in real time
- [ ] Live simulation: user can run a time-step simulation and see a chart of state variables
- [ ] No npm install required — pure static HTML/JS/WASM

### T5.3 — VSCode Extension `MVP` ✅
> Priority: **high** | Depends on: T5.2, T6.3

- [x] VSCode extension package (`mdk-vscode`) at `packages/vscode/`
- [x] `@mdk/ts-plugin` registered as `typescriptServerPlugins` — hover docs + cross-domain bond suggestions active in any TS file
- [x] `MdkDiagnosticProvider` validates `.mdk.json` on save — structural errors shown in Problems panel
- [x] Status bar item: ✅ MDK Valid / ❌ MDK N errors (shown when a `.mdk.json` is active)
- [x] `MDK: Open Diagram Editor` command — opens `MdkDiagramPanel` Webview hosting `<mdk-dia>`
- [x] Webview panel syncs bidirectionally with the active `*.mdk.json` file (T6.3)
- [ ] Red squiggly underlines on causality conflicts (requires WASM built — full integration deferred to post-MVP)

---

## Phase 6 — @mdk/dia: Diagram Component ⬜

`@mdk/dia` is a standalone web component package (vanilla JS, Web Components, SVG — no React dependency, following gssk-dia's existing approach). It is hosted in two places: the VSCode extension Webview and the `mdk dashboard` local web app. The component communicates with its host via `postMessage`.

gssk-dia is retired. Its working code (~49KB editor, full drag-drop, wiring, property editing, live simulation callbacks) is migrated into the MDK monorepo rather than rebuilt from scratch.

### T6.1 — Migrate gssk-dia → `@mdk/dia` Web Component `MVP` ✅
> Priority: **high** | Depends on: T0.3

- [x] gssk-dia source migrated into `packages/dia/` — class renamed `MdkEditor`, element renamed `<mdk-dia>`
- [x] Published as `@mdk/dia` npm package with Vite ESM build
- [x] Odum ESL node types (Source, Storage, Sink, Constant, Boundary) fully retained
- [x] Drag-drop, wiring (port-to-port), property editing, pan/zoom, delete all retained
- [x] Package exposes `<mdk-dia>` custom element with `value` getter/setter and `change` event
- [x] Inline validator (no ajv dependency) validates both Odum ESL and Bond Graph JSON
- [ ] Archive / deprecation notice — deferred (gssk-dia repo update requires separate PR)

### T6.2 — Add Bond Graph Element Types to `@mdk/dia` Palette `MVP` ✅
> Priority: **high** | Depends on: T6.1, T0.3

- [x] Bond Graph node types added to palette: Se, Sf, R, C, I, TF, GY, J0, J1 (draggable)
- [x] `power_bond` edge type rendered as solid dark-blue line with half-arrow (distinct from Odum dashed)
- [x] Causal stroke rendered as perpendicular line near the target end of each bond
- [x] Domain selector (ESL / BG toggle buttons) in palette header switches palette and rendering mode
- [x] Bond Graph SVG symbols: standard BG notation (circles for sources, rectangles for passives, circles with 0/1 for junctions)

### T6.3 — Bidirectional JSON Sync: VSCode ↔ `@mdk/dia` `MVP` ✅
> Priority: **high** | Depends on: T6.2

- [x] `MdkDiagramPanel` sends current `*.mdk.json` content to webview on open (`load-model` message)
- [x] `<mdk-dia>` fires `change` events → webview sends `model-update` to extension host → `WorkspaceEdit` writes to disk
- [x] `onDidSaveTextDocument` forwards file changes to any open diagram panel (`sendModel`)
- [x] `FileSystemWatcher` on `**/*.mdk.json` reloads diagram on external changes (e.g. `mdk synth`)
- [x] Conflict note: `.mdk.json` is the single source of truth; TypeScript model uses `mdk synth` to regenerate it

### T6.4 — `@mdk/dia` Embedded in `mdk dashboard` `EXT`
> Priority: **medium** | Depends on: T6.1, T4.2

- [ ] `mdk dashboard` local web app imports `@mdk/dia` as a component
- [ ] Diagram panel shows live simulation state (node fill levels, edge flows) from `@mdk/runtime`
- [ ] Same `<mdk-dia>` component, different host — no forking of diagram code

### T6.5 — `mdk diagram` Export CLI `EXT`
> Priority: **low** | Depends on: T6.1

- [ ] `mdk diagram --format bondgraph` — exports Bond Graph diagram as SVG/PNG
- [ ] `mdk diagram --format odum` — exports Odum ESL diagram

### T6.6 — SysML IBD View in `@mdk/dia` `RES` ⚑
> Priority: **low** | Depends on: T6.1 | Partner: Systems engineering domain expert

- [ ] Groups L1 primitives into their L2/L3 parent constructs
- [ ] SysML IBD-style layout (Cameo / MagicDraw compatible)
- [ ] Exportable to SVG and PNG

---

## Phase 7 — Formal Verification Layer ⬜

### T7.1 — `assertSafetyEnvelope()` API `EXT`
> Priority: **medium** | Depends on: T2.2, T2.3

- [ ] `system.assertSafetyEnvelope(signal, operator, bound)` on `MdkSystem`
- [ ] Operators: `<`, `<=`, `>`, `>=`, `==`
- [ ] Envelopes serialised into Specification JSON
- [ ] Violations during simulation or harness run throw `SafetyEnvelopeViolation`

### T7.2 — Topological Prover `RES`
> Priority: **low** | Depends on: T2.3

- [ ] Conservation of energy: `ΣPower_in − ΣPower_out = d/dt(Stored) + Dissipation`
- [ ] Domain consistency: no direct cross-domain bond without `TF`/`GY`
- [ ] Runs as part of `mdk validate`

### T7.3 — State-Space Safety Envelope Model Checking `RES` ⚑
> Priority: **low** | Depends on: T7.1, T7.2 | Partner: Academic (control theory / formal methods)

Do not attempt without an academic partner.

- [ ] Integration with KeYmaera X or SpaceEx (or WASM reachability analysis)
- [ ] Prove or disprove: "under any admissible input, can signal X exceed bound Y?"
- [ ] Output: proven safe / proven unsafe / unknown (with counterexample)

### T7.4 — `mdk prove` CLI `RES` ⚑
> Priority: **low** | Depends on: T7.3 | Partner: Required (see T7.3)

- [ ] `mdk prove` — formal verification on the synthesised model
- [ ] JSON output (CI/CD gate) and Markdown proof report

---

## Phase 8 — Automated Sensitivity Analysis & Fault Simulation ⬜

> **Note:** This phase implements fault injection and sensitivity analysis. Output is not a formal DFMEA but provides mathematical inputs that a DFMEA process can consume.

### T8.1 — Fault Injection Engine `RES` ⚑
> Priority: **medium** | Depends on: T7.1, T2.3 | Partner: Engineering domain (failure mode databases)

- [ ] Failure modes per element type (open circuit → R→∞, seized → I→∞, leak → C→0)
- [ ] Re-run `@mdk/sim-kernel` after each perturbation
- [ ] Check against `assertSafetyEnvelope()` bounds
- [ ] Record: `{ component, failureMode, envelopeBreached, severity }`

### T8.2 — Monte Carlo Simulation Runner `RES`
> Priority: **medium** | Depends on: T8.1

Leverage `@mdk/sim-kernel`'s existing `advanced.c` ensemble forecasting rather than building from scratch.

- [ ] Sample component parameter distributions (not just extremes)
- [ ] Configurable: iteration count, random seed, per-component distribution type
- [ ] Confirm `advanced.c` ensemble runner is sufficient or extend as needed
- [ ] Output: probability distribution of safety envelope breaches per failure mode

### T8.3 — Fault Simulation Report Generator `RES` ⚑
> Priority: **medium** | Depends on: T8.1, T8.2 | Partner: Engineering domain

- [ ] JSON: `{ component, failureMode, effect, severity, probability, riskScore }`
- [ ] Markdown report ranked by risk score
- [ ] Single-point failures causing safety breach clearly identified
- [ ] Structured for import into a formal DFMEA tool

### T8.4 — CI/CD Integration `RES`
> Priority: **low** | Depends on: T8.3

- [ ] `mdk test --fault-sim` — runs fault simulation as a CI step
- [ ] Exit code 1 if any risk score exceeds configured threshold
- [ ] GitHub Actions example workflow in docs

---

## Phase 9 — Cyber-Physical Cloud Link ⬜

### T9.1 — `InformationBond` Type & Signal-Flow Semantics `EXT`
> Priority: **high** | Depends on: T2.2, T0.3

- [ ] `InformationBond` class distinct from `PowerBond` (signal, not energy)
- [ ] No causality assignment (directed by definition)
- [ ] Reserved in shared JSON schema (T0.3); rendered as dashed arrow in `@mdk/dia`
- [ ] Serialised distinctly in Specification JSON

### T9.2 — Cloud Latency as Physical Delay Block `RES` ⚑
> Priority: **medium** | Depends on: T9.1, T2.3 | Partner: Control theory review required

> **Caution:** Cloud latency is stochastic. Any implementation must surface uncertainty explicitly. This is a probabilistic approximation tool, not a deterministic safety guarantee.

- [ ] `CloudLink` wraps a latency distribution (p50, p99 ms) as a delay model in state-space
- [ ] Output clearly labelled as probabilistic
- [ ] Compile warning (not error) if stability margin is narrow

### T9.3 — `@mdk/aws-constructs` Package `EXT`
> Priority: **medium** | Depends on: T9.1
> **Scope note:** Do not create `@mdk/provider-aws`. Use `aws-cdk-lib` directly within MDK stacks. This task implements MDK physics constructs for AWS *service behaviour* (latency, throughput, error budget as Bond Graph elements) — not CDK resource wrappers. Deployed AWS resource ARNs are captured in the MDK model assembly `"infrastructure"` block for audit trail.

- [ ] `aws.Lambda(this, id, { concurrency, slaLatencyMs })` — BG model of Lambda latency and concurrency saturation
- [ ] `aws.DynamoDB(this, id, { writeCapacity })` — BG model with WCU saturation as a flow resistance
- [ ] `aws.IoTCore(this, id, { maxMessagesPerSecond })` — BG model of message throughput limit
- [ ] Each construct exposes `slaLatencyMs`, `throughputLimit`, `errorBudget` as Bond Graph parameters
- [ ] CloudFormation logical IDs and ARNs captured in model assembly `"infrastructure"` block on synth

### T9.4 — `Fleet.Swarm` Construct & SRE Metrics `RES`
> Priority: **medium** | Depends on: T9.3

- [ ] `Fleet.Swarm(this, id, { hardware, fleetSize, telemetryHz, controller, database })`
- [ ] Aggregate load: `fleetSize × telemetryHz` vs. `database.throughputLimit`
- [ ] Queue backpressure model updates `CloudLink` latency
- [ ] Updated latency re-evaluated against physical stability (T9.2)

### T9.5 — Bode Plot / Nyquist Stability Analysis `RES` ⚑
> Priority: **medium** | Depends on: T9.2 | Partner: Control theory review

- [ ] Transfer function computation from A/B/C/D matrices in `@mdk/sim-kernel`
- [ ] Gain margin and phase margin computed
- [ ] Phase margin below threshold → stability warning

### T9.6 — Stochastic Disturbance Injection (Packet Loss) `RES`
> Priority: **low** | Depends on: T9.1, T8.2

- [ ] SRE Error Budget → stochastic disturbance on `InformationBond`
- [ ] Zero-Order Hold or Drop-to-Zero model (user-configurable)
- [ ] Monte Carlo runner evaluates effect on safety envelopes

### T9.7 — Edge vs. Cloud Trade-off Simulator `RES`
> Priority: **low** | Depends on: T9.3, T9.4

- [ ] Swap `aws.Lambda` for `hardware.NvidiaJetson` in one line
- [ ] Edge compute: adds mass (kg), power draw (W), latency (ms) to Bond Graph
- [ ] `mdk tradeoff` prints: stability / endurance / AWS cost / risk score

---

## Phase 10 — Cloud Platform & MDKd Oracle ⬜

### T10.1 — MDKd Oracle `EXT`
> Priority: **high** | Depends on: T0.5, T5.6

MDK models its own business as a running MDK instance — the "eat your own dog food" feedback loop. Bond Graph quantifies $ flows; Beer's VSM provides the organisational control structure. Both run on the same WASM kernel.

**Bond Graph business model elements:**
- `Se` Sources: revenue streams (MCP subscriptions, BOM exports, enterprise licenses, research grants)
- `C` Stores: reputation capital (τ ~ 12 months), codebase capability (τ ~ 3 months), domain coverage
- `R` Resistances: user conversion rate (GitHub star → paid), churn, support burden per user
- `R` Dissipators: operational costs (AWS, Claude API), developer time, subsidised domains
- `GY` Transducer: "Construct" product — Claude API cost → MDK synthesis value

**Beer's VSM mapping:**
- S1 Operations: WASM simulation runs per domain
- S2 Coordination: MCP server routing
- S3 Control: $ resource allocation
- S3* Audit: CDKd divergence detector
- S4 Intelligence: NEAT topology search + PINN calibration
- S5 Policy: viability constraints, Pareto frontier

- [ ] Initial static BG business model JSON — forecasts at t=0 (no NEAT yet, hand-authored)
- [ ] `mdk-oracle` Lambda: ingests Stripe webhook events, GitHub API metrics, CloudWatch usage → writes to DynamoDB `OracleTimeseries`
- [ ] EventBridge Scheduler: hourly metrics ingestion, daily full BG simulation + CDKd divergence check
- [ ] CDKd loop: compare simulated forecast (t=0 model) against actual metrics; write divergence report to S3
- [ ] CloudWatch custom metrics dashboard: oracle state variables as custom metrics


### T10.2 — Cloud Platform CDK Stack `EXT`
> Priority: **medium** | Depends on: T5.6

AWS CDK stack deploying the full "Construct" cloud platform. Use `aws-cdk-lib` directly — no `@mdk/provider-aws` wrapper package.

- [ ] `packages/infra/` — CDK app with environment-parameterised stacks (dev / prod)
- [ ] **Frontend stack:** S3 bucket + CloudFront distribution (SPA hosting); Cognito User Pool with social providers (Google, GitHub)
- [ ] **API stack:** HTTP API Gateway with Cognito JWT authoriser; VTL routes for DynamoDB CRUD and S3 presigned URLs; Lambda proxy routes for compute
- [ ] **Compute stack:** Lambda functions (ARM64, 256MB) — `mdk-chat`, `mdk-simulate`, `mdk-validate`, `mdk-bom`; WASM kernel bundled as Lambda layer
- [ ] **Storage stack:** DynamoDB tables (on-demand) — `Models`, `ComponentCatalog`, `OracleTimeseries`; S3 buckets — `model-assembly` (versioned), `reports`, `oracle-snapshots`
- [ ] **Oracle stack:** EventBridge Scheduler rules; `mdk-oracle` Lambda; CloudWatch custom metrics namespace; SNS topic for divergence alerts
- [ ] **Inference:** Bedrock model access configured; Bedrock Knowledge Base for component catalog RAG
- [ ] CDK context values for dev/prod environment switching (domain, Cognito callback URLs, alert emails)
- [ ] `cdk deploy --all` deploys full platform; estimated cold-start cost < $50/month at zero traffic

---

## Phase 11 — DSEE Hardening: Tokens, Dual-ID, Socratic Loop 🔄

> Implements the three key recommendations from the architectural appraisal of `CONTEXT_ASSEMBLY.md`
> and `INFLIGHT_ASYNC_TOKENS.md`. See those docs for full design rationale.

### T11.1 — Token & Inflight Resolution System `EXT` [x]
> Priority: **high** | Depends on: T5.1 | Spec: `docs/INFLIGHT_ASYNC_TOKENS.md`

Implements an AWS CDK-style Token pattern allowing physical parameters and external IDs to be
placeholder strings during synthesis, resolved to concrete values before kernel invocation.

- [x] `packages/core/src/system/token.ts` — `Token`, `ProcurementToken`, `Lazy`, `TokenResolver`, `ResolutionContext`, `MapResolutionContext`, `InflightResolution`, `TokenResolutionError`, `collectUnresolvedTokens`
- [x] `packages/core/src/kernel/wasm-bridge.ts` — Token guard in `runKernel()`: throws `TokenResolutionError` before WASM if any string placeholder remains
- [x] `packages/core/src/system/app.ts` — `MdkSystem.resolve(context: ResolutionContext)` method runs `TokenResolver` over synth'd model
- [x] `packages/core/src/system/app.ts` — `MdkStack.exportBOM()` returns structured `BomEntry[]` for procurement, flagging pending tokens
- [x] Export `Token`, `ProcurementToken`, `Lazy`, `TokenResolver`, `TokenResolutionError`, `BomEntry` from `packages/core/src/index.ts`
- [x] `packages/core/src/__tests__/tokens.test.ts` — 26 tests: Token, ProcurementToken, Lazy, tokenKey, collectUnresolvedTokens, MapResolutionContext, TokenResolver, MdkSystem.resolve(), MdkStack.exportBOM() ✅

### T11.2 — Dual-ID Schema: externalId + metadata `EXT` [x]
> Priority: **high** | Depends on: T5.1, T11.1 | Spec: `docs/INFLIGHT_ASYNC_TOKENS.md`

Adds `externalId` (Deployment Identity) and `metadata` (commercial data) to SysML and Bond Graph
schemas so that physical components can link to real-world resources (ARNs, serials, SKUs) without
breaking internal graph connectivity which remains anchored by UUID `@id`.

- [x] `packages/core/src/schema/sysml.ts` — `externalId` and `metadata` added to `SysmlBase`; `bgMapping.parameter` now accepts `z.union([z.number(), z.string()])` for Token support
- [x] `packages/core/src/schema/bondgraph.ts` — `externalId`, `metadata` added to `BgElement`; `parameter` now accepts `z.union([z.number(), z.string()])`
- [x] `normaliseBondGraphForWasm()` in `wasm-bridge.ts` — asserts all `parameter` values are numbers (throws `TokenResolutionError` if not) before building the WASM payload
- [x] `packages/core/src/__tests__/dual-id.test.ts` — 11 tests: BgElement, BondGraphModel, SysmlPackage externalId + metadata + Token parameter round-trip ✅

### T11.3 — Socratic Loop: Structured Missing Parameters `EXT` [x]
> Priority: **medium** | Depends on: T5.6 | Spec: `docs/CONTEXT_ASSEMBLY.md` Step 1.2

Formalises the "Socratic Loop" (DSEE Step 1.2) by allowing the LLM to emit a structured
`missing_parameters` array when it cannot determine required physical values from the description.
The Context Assembler surfaces this to the user before proceeding.

- [x] `packages/mcp-server/src/tools/create-model.ts` — `SYSML_SCHEMA` extended with `missing_parameters` array; `externalId` and `metadata` fields added to element schema
- [x] `packages/mcp-server/src/tools/create-model.ts` — MANDATORY RULE #16 added to `SYSML_SYSTEM_PROMPT`: instructs LLM to use `missing_parameters` rather than guessing
- [x] `packages/mcp-server/src/tools/create-model.ts` — `createModel()` returns `missing_parameters` in JSON output alongside `model` and `stages`
- [x] `examples/chat-demo/src/gemini.ts` — `chatStream` reads `missing_parameters` from `create_model` result and yields a `{ type: 'socratic', questions: [...] }` event ✅
- [x] `examples/chat-demo/public/index.html` — UI renders Socratic questions as inline form fields before proceeding to simulation ✅
- [ ] `packages/mcp-server/src/__tests__/create-model.test.ts` — test that Socratic output round-trips correctly

### T11.4 — Rename chat-demo to dsee-demo `EXT` [x]
> Priority: **low** | Depends on: T11.3

The `examples/chat-demo` is not "a chat demo" — it is a working proof-of-concept of the full
14-step DSEE pipeline. Renaming it clarifies this for contributors and makes the architecture
evident to new developers.

- [x] Rename `examples/chat-demo/` → `examples/dsee-demo/` ✅
- [x] Update all internal references (`package.json`, `README`, Makefile targets) ✅
- [x] Update `AGENTS.md` reference to the example ✅
- [x] Add `examples/dsee-demo/README.md` explaining the 5-step pipeline implemented in `gemini.ts` ✅

### T11.5 — Procurement Integration: generate_bom tool `EXT` [x]
> Priority: **high** | Depends on: T11.1, T11.2 | Spec: `docs/INFLIGHT_ASYNC_TOKENS.md`

Connects the `MdkStack.exportBOM()` logic to the MCP server, enabling the Purchases Agent to
identify unresolved `ProcurementTokens` and fulfill them via external catalog queries.

- [x] `packages/mcp-server/src/tools/generate-bom.ts` — refactor to use `MdkStack.exportBOM()` and return structured JSON ✅
- [x] `packages/mcp-server/src/server.ts` — update tool description to "Generate a structured Bill of Materials JSON" ✅
- [x] `examples/dsee-demo/src/gemini.ts` — insert Step 6 (Bill of Materials) into the orchestration pipeline ✅
- [x] `examples/dsee-demo/public/index.html` — render BOM table with "Procure" status badges and mock buttons ✅

## Phase 12 — Evolutionary Synthesis & Advanced Kernels

Implementing the generative feedback loop where MDK evolves physical designs to match performance requirements.

### T10.1 — NEAT Topology Evolution Engine `CORE` [x]
> Priority: **high** | Depends on: T1.x (WASM Kernel)

Implementation of a mechatronic NEAT algorithm (NeuroEvolution of Augmenting Topologies).
Allows MDK to automatically discover optimal Bond Graph topologies that satisfy user-provided
time-series or frequency-domain requirements.

- [x] `packages/core/src/evolution/neat.ts` — `NeatGenome` and `InnovationTracker` implementation ✅
- [x] `packages/core/src/evolution/population.ts` — `PopulationManager` with structural mutations (add node/bond) and crossover ✅
- [x] `packages/core/src/evolution/fitness.ts` — `FitnessEvaluator` using `runKernel` and MSE error calculation ✅
- [x] `examples/evolution-demo.ts` — functional demonstration of evolving an RC circuit to match a target step response ✅


---

## Phase 12 — Evolutionary Synthesis: NEAT & Calibration 🧬

### T10.1 — NEAT Topology Evolution Engine `EXT` [ ]
> Priority: **high** | Depends on: T5.1, T5.5 | Spec: `docs/CONTEXT_ASSEMBLY.md` Step 4.4

Implements NeuroEvolution of Augmenting Topologies (NEAT) adapted for Bond Graphs. Allows the
system to "evolve" the optimal physical topology (adding J0/J1 junctions, R/C/I elements) to
satisfy behavioral requirements.

- [ ] `packages/core/src/evolution/neat.ts` — `NeatGenome` (nodes, bonds), `InnovationTracker`
- [ ] `packages/core/src/evolution/population.ts` — `PopulationManager`: selection, crossover, mutation (topological)
- [ ] `packages/core/src/evolution/fitness.ts` — `FitnessEvaluator`: runs WASM simulation and scores based on L2-norm of error vs target
- [ ] `examples/evolution-demo/` — new example evolving a passive filter circuit to match a specific frequency response
