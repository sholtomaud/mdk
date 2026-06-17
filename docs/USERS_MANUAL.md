# MDK Simulation Engine: A Technical User Manual

**Audience:** Engineers, scientists, and developers who want to understand what is happening inside the MDK simulation engine. No prior knowledge of Bond Graph theory, Odum Energy Systems Language, or differential calculus is assumed. All technical terms are defined on first use.

---

## MDK Pipeline — Canonical Workflow

SysML is the **lingua franca** of MDK. Every model begins as SysML and is transpiled to Bond Graph for causal validation and simulation. Odum ESL is a *visualisation target* and *emergy analysis layer*, not a modelling input.

### Step 0 — CONOPS (streaming, conversational)

The LLM interprets the user's intent in plain English — what system is being modelled, what the key phenomena are, what outputs are needed. It streams the interpretation back and asks for confirmation before proceeding. If the user says no, the LLM asks follow-up questions and refines. No JSON, no schemas yet — just dialogue.

### Step 0.5 — Functional Decomposition (plain English)

The LLM produces a structured decomposition in plain English: subsystems, ports between subsystems, physical domains, source/sink/storage roles, key parameters, and any domain-specific constraints (e.g. financial trial balance, ecological mass balance). This is the requirements layer.

### Step 0.7 — High-Level SysML (named blocks only, no definitions)

The LLM returns a top-level `SysmlPackage` JSON containing `PartDefinition` blocks with names and port declarations but no `bgMapping` or parameter values yet. This is the architecture skeleton. The number of blocks at this level determines the number of passes needed in Step 1.

### Step 1 — Per-subsystem SysML generation (looping, SQLite state)

For each block from Step 0.7, the LLM generates a complete `PartUsage` subtree with:
- All `PortUsage` elements annotated with `bgMapping.junctionType` (J0 or J1)
- All `PartUsage` elements annotated with `bgMapping.elementType` (Se, Sf, R, C, I, TF, GY) and `bgMapping.parameter`
- All `FlowConnectionUsage` elements connecting ports between sub-blocks

**Critical:** the LLM must populate `bgMapping` annotations or the transpiler cannot produce a valid BG. The Gemini system prompt must require this explicitly.

Each block is stored in SQLite (via `create_block` / `refine_block`). `assemble_model` merges all blocks into a single flat `SysmlPackage`.

### Step 2 — SysML schema validation (Zod)

The assembled `SysmlPackage` is validated against the MDK Zod SysML schema (`SysmlPackage`, `PartUsage`, `PortUsage`, `FlowConnectionUsage`). Failures report the exact element and field that failed. No partial models proceed.

### Step 3 — SysML → Bond Graph transpilation

`sysmlToBondGraph()` + `flattenBondGraph()` convert the validated SysML package to a single flat `BondGraphModel`. Port connections become union-find merged junctions. The result is a topology-only BG — causality has not been assigned yet.

### Step 4 — SCAP causal validation (WASM)

The WASM SCAP (System Causal Assignment Program) assigns causality to every bond and checks the following. **This is the primary validity gate:**

| Check | What SCAP enforces |
|---|---|
| Causal completeness | Every bond has exactly one effort-cause and one flow-cause |
| No uncaused causes | Every source variable is driven by exactly one element |
| Junction conservation | J0: common effort, all flows sum to zero; J1: common flow, all efforts sum to zero |
| No orphan elements | Every element is bonded into the graph |
| No unterminated bonds | Every bond connects two elements |
| Power balance | Junction laws enforce power-in = power-out for lossless elements |

**On trial balance:** the J0/J1 junction conservation laws are mathematically identical to double-entry bookkeeping in the financial domain. In a financial BG, J0 enforces assets = liabilities + equity (flows sum to zero at a common-effort node). SCAP validates this universally across all domains including accounting — you get the trial balance for free from the physics.

**On the 3-turn error correction loop:** if SCAP returns causality failures, the LLM is given the SCAP error diagnostics, the current model JSON, the original system prompt, and the SysML schema, and asked to correct the model. This loop runs at most 3 times. On the third failure the pipeline halts and reports all diagnostics. The LLM must not add any prose explanation during correction passes — schema-constrained JSON only, to minimise token cost.

### Step 4.1 — Emergy analysis (optional, Odum ESL domain only)

Emergy is **post-hoc analysis**, not causal validation. It answers: "what is the solar energy genealogy of each flow in this system?" This question is meaningful for ecological, economic, and resource systems. It has no physical referent for a motor controller or an RC filter.

Emergy analysis runs automatically when the system description contains ecological/economic semantics (rainfall, biomass, soil, nutrient, economic flows). It is skipped for purely physical BG models (electrical, mechanical, thermal, hydraulic).

Emergy is NOT a validation gate — a model can be causally valid and have meaningless or zero emergy values. The `compute_emergy` MCP tool is available for explicit invocation.

### Step 5 — IDC simulation (WASM + TypeScript log-Euler)

IDC (Incipient Differential Calculus, Giannantoni 2006) is the primary integrator for all MDK simulations. It is domain-agnostic — it applies to any positive-valued ODE system from physics, ecology, or finance alike. Key properties:

- Exact for pure exponential systems (`dx/dt = ax`)
- Unconditionally positive — no state variable can go negative
- Preserves the "persistence of form" property across ordinal levels (Matrioska hierarchy)

TDC (traditional RK4) runs in parallel as a reference. The two trajectories are compared to quantify IDC "drift" in nonlinear or driven systems.

### Step 6 — Output generation

- Time-series simulation data (TDC and IDC trajectories)
- Statistical summary: steady-state values, dominant time constants, convergence rate
- Emergy table (if applicable): transformity hierarchy, empower, renewable fraction

### Step 7 — Diagram compilation

SysML defines 9 standard diagram types. The MDK-relevant subset:

| # | Diagram type | MDK use |
|---|---|---|
| 1 | Block Definition Diagram (BDD) | Block hierarchy and type definitions |
| 2 | Internal Block Diagram (IBD) | Internal port connections within a block |
| 3 | Parametric Diagram (PAR) | Constraint equations and BG parameter bindings |
| 4 | Activity Diagram (ACT) | Operational flows and scenarios |
| 5 | Sequence Diagram (SEQ) | Time-ordered interactions between subsystems |
| +1 | Odum ESL Energy Circuit | General Systems Ecology view of flows and storages |

Total: **5 SysML diagrams + 1 ESL energy circuit diagram = 6 views per model.**

The Bond Graph topology diagram is generated from the transpiled BG and overlaid with causal stroke assignments from SCAP.

---

### Architecture decisions and known bugs

**Why `odum-esl` was returned for "soil water" prompts:** the `detectDomain()` heuristic in `gemini.ts` classified ecology keywords as `odum-esl` and called `create_model(domain='odum-esl')`. This bypassed the SysML path entirely. This is a bug. The fix is to remove `detectDomain()` — ALL models go through SysML generation → BG transpilation. Odum ESL is a post-hoc visualisation of the energy flows, not a model generation target.

**Why `solar_insolation` was an orphan:** it was generated by the Odum ESL path as a bare `source` node with no edge connecting it to any other node — the LLM hallucinated it from domain knowledge without wiring it up. SCAP would have caught this as an orphan element; it was never run because the pipeline stopped at Odum ESL.

**What still needs implementing to complete the pipeline:**

| Item | Status |
|---|---|
| SysML as primary generation target (Step 1) | ❌ `create_model` has no `domain:'sysml'` path |
| Gemini SysML system prompt with `bgMapping` requirement | ❌ not written |
| 3-turn SCAP error correction loop | ❌ not in `gemini.ts` |
| Multiple diagram generation (BDD, IBD, PAR, SEQ, ESL) | ❌ only one topology diagram today |
| Remove `detectDomain()` | ❌ still in `gemini.ts` |
| SysML Zod schema | ✅ built |
| `sysmlToBondGraph()` + `flattenBondGraph()` | ✅ built |
| `transpile_sysml` MCP tool | ✅ wired |
| `solveIDC()` + `run_simulation(calculus='idc')` | ✅ wired |
| `compute_emergy` MCP tool | ✅ wired |
| SQLite multi-pass (create_project / refine_block / assemble_model) | ✅ wired |
| WASM SCAP + RK4 | ✅ built |

---

### The Matrioska connection

The 2023 paper's hierarchical structure — protein → amino acids → peptides — is exactly the MDK hierarchy: Business → Department → Process → Resource. Giannantoni calls this "Meta-Ordinal Generativity." IDC is natively suited to this because ordinal relationships describe how each level generates the level above. IDC is the correct calculus for the executable enterprise vision across all domains, not only emergy.

---

## Contents

1. [What Is a Simulation Engine?](#1-what-is-a-simulation-engine)
2. [Ordinary Differential Equations — The Language of Change](#2-ordinary-differential-equations--the-language-of-change)
3. [The GSSK Approach: Odum Energy Systems Language](#3-the-gssk-approach-odum-energy-systems-language)
4. [The Bond Graph Approach](#4-the-bond-graph-approach)
5. [The Critical Difference: Stateless vs. Causal Computation](#5-the-critical-difference-stateless-vs-causal-computation)
6. [The Shared Solver: Euler and Runge-Kutta](#6-the-shared-solver-euler-and-runge-kutta)
7. [Traditional vs. Incipient Differential Calculus](#7-traditional-vs-incipient-differential-calculus)
8. [Fractional-Order Derivatives and Memory Effects](#8-fractional-order-derivatives-and-memory-effects)
9. [How MDK Runs All Three Approaches Together](#9-how-mdk-runs-all-three-approaches-together)

---

## 1. What Is a Simulation Engine?

A **simulation engine** is a program that predicts how a system changes over time. You give it:

- A description of the system (what parts it has, how they are connected, what their current state is)
- A set of rules describing how each part behaves
- A starting condition (the state of the system at time zero)

The engine then repeatedly asks: *"If this is the state of the system right now, what will it be a tiny moment later?"* By repeating this question many thousands of times, it builds up a trajectory — a record of how every variable in the system evolves over time.

MDK's simulation engine is called **`@mdk/sim-kernel`**. It is written in C and compiled to **WebAssembly (WASM)** — a binary format that runs inside a web browser or Node.js process without requiring a separate C installation on the user's machine. This means a user can run a simulation by simply including the `@mdk/core` npm package, with no other dependencies.

The engine supports two distinct **modelling languages** — two different ways of describing a physical system:

1. **Odum Energy Systems Language (Odum ESL)** — the approach used by the GSSK simulation kernel
2. **Bond Graph theory** — a domain-neutral engineering language for modelling energy flow in physical systems

These two languages have different mathematical foundations. Understanding the differences between them is essential to understanding why merging them into a single kernel requires careful engineering.

---

## 2. Ordinary Differential Equations — The Language of Change

Before examining either modelling language, it is necessary to understand **ordinary differential equations (ODEs)**, because both languages ultimately produce them.

### 2.1 What is a derivative?

A **derivative** measures how quickly something changes. If `x(t)` is the position of a car at time `t`, then `dx/dt` (read: "the derivative of x with respect to t") is the car's velocity — how fast its position is changing at that instant. The notation `dx/dt` was introduced by Gottfried Wilhelm Leibniz in the 17th century.

A **second derivative** `d²x/dt²` measures how quickly the velocity is changing, which is acceleration.

### 2.2 What is an ordinary differential equation?

An **ordinary differential equation (ODE)** is an equation that contains both a variable (such as position `x`) and one or more of its derivatives (such as velocity `dx/dt` or acceleration `d²x/dt²`).

**Example:** Newton's second law for a mass `m` attached to a spring with stiffness `k`:

```
m * d²x/dt²  =  -k * x
```

This says: the force on the mass (left side: mass times acceleration) equals the restoring force of the spring (right side: stiffness times displacement, pointing back toward centre). This ODE has a known analytic solution: `x(t) = A cos(√(k/m) · t) + B sin(√(k/m) · t)`.

### 2.3 The state of a system

The **state** of a system is the minimum set of variables you need to know at any given instant in order to predict all future behaviour. For the spring-mass system above, the state is `{position x, velocity dx/dt}`. Knowing both at time `t₀` allows you to compute the entire future trajectory.

For a general ODE system, the state is written as a vector `x = [x₁, x₂, ..., xₙ]`. The ODE is then written as:

```
dx/dt = f(x, t)
```

This says: the rate of change of the entire state equals some function `f` of the current state and time. The job of the simulation engine is to compute `f(x, t)` at each time step and use it to advance `x` forward in time.

The function `f(x, t)` is called **`compute_derivatives()`** in MDK's source code. It is the heart of the simulation engine, and it is computed differently by the two modelling languages. Understanding this difference is the central theme of this manual.

---

## 3. The GSSK Approach: Odum Energy Systems Language

### 3.1 Background

Howard T. Odum (1924–2002) was an American ecologist who developed a general graphical language for modelling energy flow in any kind of system — ecological food webs, economic supply chains, electrical circuits, or water treatment plants. He called this the **Energy Systems Language (ESL)**, sometimes also called **Emergy Analysis**.

Odum's key insight was that all systems — biological, physical, economic — can be described in terms of energy (or more precisely, **emergy**: accumulated energy required to produce something, measured in solar equivalent joules). By using a common "energy currency", he could model radically different systems using the same notation and the same mathematical rules.

**GSSK (General Systems Simulation Kernel)** is a C/WASM implementation of Odum ESL. It was the predecessor to MDK's simulation kernel and is now incorporated into `@mdk/sim-kernel` as the **Odum ESL domain**.

### 3.2 Nodes and edges

In Odum ESL, a system is described as a **network of nodes connected by edges**.

- A **node** represents a system component. Each node has a **value** — the amount of energy (or emergy) currently stored in or flowing through it.
- An **edge** represents a transfer of energy or material between nodes.

GSSK defines five **node types**:

| Node type | Meaning |
|-----------|---------|
| `source` | Provides energy to the system (e.g. sunlight, fuel) |
| `storage` | Accumulates and releases energy (e.g. a tank, a population) |
| `sink` | Absorbs energy without returning it (e.g. heat loss) |
| `constant` | Maintains a fixed value regardless of flows |
| `boundary` | Represents the system boundary |

And five **flow logic types** that describe what mathematical rule governs each edge:

| Logic type | Formula | Physical meaning |
|------------|---------|-----------------|
| `Constant` | `f = k` | A fixed flow, independent of node values |
| `Linear` | `f = k * (origin.value - target.value)` | Flow proportional to the difference in values — like Ohm's law for electrical resistance |
| `Interaction` | `f = k * origin.value * target.value` | Flow proportional to the product of two values — models predator-prey or chemical reactions |
| `Limit` (Monod) | `f = k * x / (h + x)` | Flow that saturates at a maximum — models enzyme kinetics or resource limitation |
| `Threshold` | `f = k * x` if `x > threshold`, else `0` | Flow that is zero below a threshold — models switching behaviour |

### 3.3 How GSSK computes derivatives

For GSSK, computing `dx/dt` for any storage node is straightforward:

1. Look at all edges **incoming** to the node. Compute the flow on each edge using the edge's logic type.
2. Look at all edges **outgoing** from the node. Compute the flow on each edge.
3. The derivative is: `dx_i/dt = sum(inflows) - sum(outflows)`

**Example:** A storage node `i` with one Linear inflow from node `j` and one Constant outflow:

```
dx_i/dt = k_in * (x_j - x_i)  -  k_out
```

This is all the information GSSK needs:
- The current values of `x_i` and `x_j` (the node values)
- The edge parameters `k_in` and `k_out`

Notice what GSSK does **not** need:
- Any knowledge of the global system structure beyond the immediate neighbours
- Any prior analysis of which nodes "drive" which other nodes
- Any information about the direction of causality (which variable causes which)

This computation is **local**, **flat**, and **stateless**. Every node's derivative can be computed independently from every other node's derivative. The only shared information is the current state vector `x`.

In software terms, GSSK's `compute_derivatives()` looks like this (simplified):

```c
for each storage_node i:
    derivative[i] = 0
    for each incoming_edge e to node i:
        derivative[i] += compute_flow(e, x)
    for each outgoing_edge e from node i:
        derivative[i] -= compute_flow(e, x)
```

This is a simple nested loop. No graph traversal, no prerequisite computation, no ordering constraints.

---

## 4. The Bond Graph Approach

### 4.1 Background

Bond Graph theory was developed by Henry Paynter at MIT in the 1960s and further systematised by Dean Karnopp, Donald Margolis, and Ronald Rosenberg. It is a domain-neutral graphical language for modelling energy flow in physical systems, with the distinguishing feature that **all physical domains use the same two variables**: effort and flow.

| Physical domain | Effort variable | Flow variable | Power = effort × flow |
|----------------|-----------------|---------------|----------------------|
| Electrical | Voltage (V) | Current (A) | Watts (W) |
| Mechanical (translational) | Force (N) | Velocity (m/s) | Watts (W) |
| Mechanical (rotational) | Torque (N·m) | Angular velocity (rad/s) | Watts (W) |
| Hydraulic | Pressure (Pa) | Volume flow rate (m³/s) | Watts (W) |
| Thermal | Temperature (K) | Entropy flow rate (W/K) | Watts (W) |

**Effort** is the variable that drives flow — it is the "pressure" across a component. **Flow** is what moves through the component as a result of that driving effort. The product of effort and flow is always **power** in watts.

By unifying all physical domains under a single pair of variables, Bond Graphs allow you to model a system that spans multiple physical domains (e.g. a DC motor, which converts electrical energy into mechanical rotation) using a single consistent diagram and a single mathematical framework.

### 4.2 Bond Graph elements

A Bond Graph consists of **elements** connected by **bonds** (directed lines representing power flow). Each bond carries both an effort and a flow simultaneously; the direction of the arrow on the bond indicates which way positive power flows.

The standard Bond Graph elements are:

| Symbol | Name | Role |
|--------|------|------|
| `Se` | Effort Source | Imposes a fixed effort (e.g. a battery voltage, gravity) |
| `Sf` | Flow Source | Imposes a fixed flow (e.g. a hydraulic pump at constant rate) |
| `R` | Resistance | Dissipates energy — relates effort to flow via a resistance law (e.g. electrical resistor, friction) |
| `C` | Compliance (Capacitance) | Stores energy in a displacement — relates effort to accumulated flow (e.g. a spring, a capacitor) |
| `I` | Inertia (Inductance) | Stores energy in momentum — relates flow to accumulated effort (e.g. a mass, an inductor) |
| `TF` | Transformer | Transforms effort and flow between two ports at a fixed ratio while conserving power (e.g. a gear, a transformer) |
| `GY` | Gyrator | Converts between effort and flow domains while conserving power (e.g. a DC motor converting voltage to torque) |
| `J0` | 0-Junction (Common Effort) | All connected bonds share the same effort; flows sum to zero (like a parallel electrical connection) |
| `J1` | 1-Junction (Common Flow) | All connected bonds share the same flow; efforts sum to zero (like a series electrical connection) |

**State variables** in a Bond Graph are stored in the `C` and `I` elements:
- The state variable of a `C` element is `q` (displacement or charge): `dq/dt = f` (flow into C)
- The state variable of an `I` element is `p` (momentum): `dp/dt = e` (effort driving I)

### 4.3 What is causality?

**Causality** in Bond Graph theory answers the question: *for any given element, which variable is the input and which is the output?*

For every element, one of effort or flow is the **input** (imposed by the rest of the system) and the other is the **output** (computed from the element's constitutive relation). This is called the **causal assignment** of the bond, and it is shown graphically by a short perpendicular stroke (a **causal stroke**) at one end of the bond:

- **Causal stroke at the tail:** effort is the input to the element at that end
- **Causal stroke at the head:** flow is the input to the element at that end

Some elements have fixed causality:
- `Se` always imposes effort — its causal stroke is always away from the element
- `Sf` always imposes flow — its causal stroke is always away from the element

Other elements have preferred or constrained causality:
- `C` prefers flow input (integral causality): `e = (1/C) * q`, where `q = ∫f dt`
- `I` prefers effort input (integral causality): `f = (1/I) * p`, where `p = ∫e dt`
- `R` can accept either
- Junctions have rules: on a `J0`, exactly one bond provides the effort; on a `J1`, exactly one bond provides the flow

Causality is not arbitrary — it defines the mathematical structure of the ODEs. The wrong causal assignment produces an **algebraic loop** (a circular dependency with no solution) or a **causality conflict** (a physical paradox, like two voltage sources connected in parallel, each trying to impose a different voltage).

### 4.4 SCAP: The Sequential Causality Assignment Procedure

**SCAP** (Sequential Causality Assignment Procedure) is the algorithm that determines the correct causal assignment for every bond in a Bond Graph. It was developed by Karnopp and Rosenberg and is described in detail in the standard Bond Graph textbooks.

SCAP works as follows:

1. **Step 1 — Fixed causality:** Assign causality to all `Se` and `Sf` elements first. Their causality is fixed and not negotiable.
2. **Step 2 — Propagate through junctions:** The causal rules of `J0` and `J1` junctions constrain the causality of connected bonds. Propagate these constraints through the graph.
3. **Step 3 — Storage elements:** Assign integral causality to `C` and `I` elements wherever possible (preferred). If a `C` or `I` element is forced into derivative causality by the structure of the graph, this indicates a **differential algebraic equation (DAE)** — a more complex mathematical structure.
4. **Step 4 — Remaining elements:** Assign causality to `R` elements and `TF`/`GY` elements as constrained by the previous steps.
5. **Conflict detection:** If any element is forced into contradictory causality (e.g. both ends of a bond trying to impose effort), SCAP reports a **causality conflict** — this is a physical error in the system description.

SCAP produces a **causal graph**: a directed computational graph where the direction of each arrow tells you which variable is computed from which. This graph determines the order in which the simulation must evaluate equations.

**SCAP is the MDK "linter".** Before any simulation can run, SCAP must succeed. A causality conflict at the SCAP stage means the system as described is physically impossible and cannot be simulated.

### 4.5 How Bond Graphs compute derivatives

Now we can describe `compute_derivatives()` for Bond Graphs. This is where the critical difference from GSSK appears.

For a Bond Graph, computing `dx/dt` for a storage element (e.g. a `C` element) requires knowing the **flow into that element at the current instant**. But that flow is not a simple local edge value — it is computed by propagating through the entire causal chain in the graph.

**Example: An RC electrical circuit**

Consider a simple series RC circuit: a voltage source `Se` connected through a resistor `R` to a capacitor `C`.

```
Se --- (bond 1) --- R --- (bond 2) --- C
```

SCAP assigns causality:
- `Se` imposes effort `e₁` = voltage of the source (input to the system)
- The effort at `R`'s left bond is `e₁` (from `Se`)
- `R`'s constitutive relation: `f₁ = e₁ / R` (flow = voltage / resistance)
- Since it's a series connection (`J1` junction): `f₂ = f₁` (same flow throughout)
- `C`'s state variable is charge `q`; its derivative is `dq/dt = f₂`
- The voltage across `C` is: `e_C = q / C`

To compute `dq/dt`, the simulation must:
1. Evaluate `e₁` (the source effort — known)
2. Compute `f₁ = e₁ / R` (using R's constitutive relation and the effort at R)
3. Propagate: `f₂ = f₁` (junction rule)
4. Assign: `dq/dt = f₂`

This is a **sequential, ordered computation**. Step 4 depends on Step 3, which depends on Step 2, which depends on Step 1. The order is determined by the causal graph output from SCAP. You cannot compute Step 4 before Step 1 is done.

In software, Bond Graph `compute_derivatives()` looks like this (simplified):

```c
// SCAP has already run and stored the causal order in a sorted list
for each element in causal_order:
    if element is Se or Sf:
        assign effort or flow from source value
    if element is R:
        compute the output variable from the input variable
        using R's constitutive relation
    if element is J0 or J1:
        apply junction sum rule to compute the one
        unknown variable from all known variables
    if element is C or I:
        read the input variable (flow for C, effort for I)
        and assign it as the state derivative
```

This is **not** a simple loop over nodes. It requires:
- A pre-computed causal order (from SCAP)
- Sequential traversal following that order
- Each step reading values computed by previous steps

The computation is **global** (it touches the whole graph), **ordered** (steps must happen in sequence), and **stateful** (it depends on the causal structure computed by SCAP).

---

## 5. The Critical Difference: Stateless vs. Causal Computation

This section summarises the key architectural difference between GSSK and Bond Graph `compute_derivatives()`. This difference is the primary reason why integrating Bond Graph simulation into `@mdk/sim-kernel` requires new engineering work rather than a simple code port.

| Property | GSSK (Odum ESL) | Bond Graph |
|----------|-----------------|------------|
| **Computation structure** | Flat loop over all nodes | Sequential traversal of causal graph |
| **Global system structure required?** | No — only local edge information | Yes — full causal graph from SCAP |
| **Order-dependent?** | No — any node can be computed in any order | Yes — strict causal order must be followed |
| **Pre-computation required?** | None | SCAP must run first to produce causal order |
| **Nonlinear support** | Yes — Interaction, Limit, Threshold logic types | Yes — via nonlinear constitutive relations |
| **What is a "derivative"?** | Net flow in/out of a storage node | Rate of change of a storage element's state variable, computed by following the causal chain |

The specific integration risk noted in the MDK task list is:

> *GSSK's `compute_derivatives()` computes net flows by summing edges — a flat, stateless operation. Bond Graph derivatives are structurally different: they require propagating efforts and flows through junctions using the pre-computed causal structure from SCAP. The Bond Graph `compute_derivatives()` must read the causality assignments from the SCAP pass before it can evaluate state derivatives. This is not a drop-in replacement. Treat this as new implementation work, not a port.*

In practical terms: **the function signature and calling convention of GSSK's `compute_derivatives()` can be reused, but the body of that function must be written from scratch for the Bond Graph domain.** The shared Euler/RK4 solver calls `compute_derivatives()` without knowing which domain it is in — that is the clean abstraction boundary. But what happens inside `compute_derivatives()` is entirely different for the two domains.

### 5.1 Validation rules: how Bond Graph audits map to Odum ESL

Although the two domains use different computation structures, their **structural validity rules** are equivalent. The same underlying conservation laws appear in both — they are just expressed in different notation.

This is the theoretical basis for MDK's unified validation engine: the engine runs the same graph audit regardless of domain, parameterised by which rule dialect to apply. Bond Graph rules are the canonical form. The Odum ESL dialect inherits all Bond Graph rules and adds its own.

| Bond Graph structural rule | Odum ESL equivalent | What it catches |
|---|---|---|
| Power conservation at J0 (equal effort, ΣFlow = 0) | Storage node mass/energy balance: Σ(inflows) = Σ(outflows) + dQ/dt | Flows that disappear or appear from nowhere |
| Power conservation at J1 (equal flow, ΣEffort = 0) | Flow pathway carries the same flow through each component in series | Discontinuities or splits in a single pathway |
| Causality assignment: every element has a determined causal role | Every Source has at least one outbound flow; every Store has at least one inbound or outbound flow | Isolated nodes; sources with nowhere to send energy |
| No algebraic loop without a storage element | No circular flow dependency without an intervening Store | Circular chains that would require simultaneous solution at t=0 |
| Causality conflict (two effort sources on one J0) | Two Sources both driving the same Store with no shared pathway | Physical contradictions: two forcing functions imposed on one state |
| Domain compatibility: cross-domain bond requires TF or GY | Unit consistency: flow units on a connected edge must match | Mixing incompatible flow types (e.g. volumetric flow into a biomass store) |
| Se / Sf impose fixed effort / flow — cannot be overridden | Source node value is not modified by downstream flows | A source that responds to back-pressure (should be a Store, not a Source) |
| C and I elements carry state — derivative causality is a warning | A Store that behaves algebraically (zero time constant) should be a constant, not a Store | Stores used incorrectly as algebraic relays |
| Emergy sign: transformity ≥ 1 at every transformation | (Odum-specific, no BG equivalent) | Energy quality downgrade without transformation cost |
| Storage non-negativity: Q ≥ 0 for physical quantities | (Odum-specific, no BG equivalent) | Negative biomass, negative tank level |

**How this is used in MDK:** The validator is a rule engine that runs these checks as a graph traversal over the JSON model spec. Each domain registers a `ValidationRuleSet`:

```typescript
const odumRules: ValidationRuleSet = {
  id: 'odum-esl',
  inherits: 'bondgraph',            // gets all ten BG rules above
  additional: [
    checkEmergySigns,               // transformity ≥ 1 at every transformation
    checkStorageNonNegative,        // Q ≥ 0 for physical storage quantities
  ],
};
```

TypeScript construct class inheritance (`OdumConstruct extends ModelConstruct`) handles the *structural composition* of constructs. The `ValidationRuleSet` registry handles the *rule composition* of validation. These are two orthogonal extension axes: a new domain can add new construct types without touching validation, and can add new validation rules without adding new construct types.

---

## 6. The Shared Solver: Euler and Runge-Kutta

Both GSSK and Bond Graph domains produce, at each time step, a vector of derivatives `dx/dt = f(x, t)`. The **shared solver** takes this vector and advances the state `x` forward by one time step `Δt`.

MDK provides two shared solver methods.

### 6.1 Euler's Method

The simplest possible approach:

```
x(t + Δt) ≈ x(t) + Δt * f(x(t), t)
```

**How it works:** The state at the next time step is estimated by taking the current state and adding the current rate of change multiplied by the time step. This is equivalent to assuming the derivative is constant over the interval `[t, t + Δt]`.

**Accuracy:** First-order accurate — the error per time step is proportional to `Δt²`. For a fixed total simulation time `T`, the total error is proportional to `Δt`. To halve the error, you must halve the time step (doubling the computation time).

**When to use:** Simple systems, large time steps acceptable, when speed is more important than accuracy.

**Limitation:** Euler's method can become **numerically unstable** — errors can grow exponentially — if the time step is too large relative to the fastest dynamics in the system. For electrical circuits with small capacitors and resistors, the required time step can be very small.

### 6.2 Runge-Kutta 4th Order (RK4)

The standard workhorse of numerical ODE solvers:

```
k₁ = f(x(t),           t)
k₂ = f(x(t) + Δt/2·k₁, t + Δt/2)
k₃ = f(x(t) + Δt/2·k₂, t + Δt/2)
k₄ = f(x(t) + Δt·k₃,   t + Δt)

x(t + Δt) = x(t) + (Δt/6) * (k₁ + 2k₂ + 2k₃ + k₄)
```

**How it works:** RK4 evaluates `f(x, t)` four times per time step at different points within the interval, then combines them as a weighted average. This approximates the integral of the derivative over the interval much more accurately than Euler.

**Accuracy:** Fourth-order accurate — the error per time step is proportional to `Δt⁵`. To halve the error, you only need to reduce the time step by a factor of `2^(1/4) ≈ 1.19`. This makes RK4 far more efficient than Euler for a given accuracy requirement.

**When to use:** The default choice for most physical systems. Accurate enough for the majority of mechatronic and ecological simulation tasks at reasonable time step sizes.

**Note:** RK4 calls `compute_derivatives()` four times per time step (once for each `k`). For Bond Graph models, this means the causal chain is traversed four times per step.

### 6.3 Stiff systems

A system is called **stiff** if it contains dynamics at very different time scales — for example, an electrical circuit where one capacitor has a time constant of 1 millisecond and another has a time constant of 10 seconds. Standard Euler and RK4 are forced to use a time step small enough to resolve the fast dynamics, even when you only care about the slow dynamics. This can make simulation impractically slow.

Stiff systems require specialised **implicit solvers** (such as backward Euler or the Gear/BDF methods) that are more expensive per step but allow much larger time steps. MDK's initial release uses Euler and RK4 only; stiff solver support is planned for a later phase.

---

## 7. Traditional vs. Incipient Differential Calculus

### 7.1 Traditional Differential Calculus (TDC)

**Traditional Differential Calculus (TDC)** is the standard calculus developed by Newton and Leibniz in the 17th century, which is the foundation of all conventional physics, engineering, and the Euler and RK4 methods described above.

The fundamental definition of the derivative in TDC is:

```
dx/dt = lim_{Δt→0} [ x(t + Δt) - x(t) ] / Δt
```

This reads: "compute the ratio of change in x to change in t, then take the limit as the time interval shrinks to zero." The result is the instantaneous rate of change of `x` at time `t`.

TDC has proven extraordinarily successful for describing physical systems. Newton's laws, Maxwell's equations for electromagnetism, the equations of fluid dynamics, and the Bond Graph constitutive relations discussed in Section 4 are all expressed in TDC.

**What TDC assumes:** The derivative is defined by looking backwards (comparing the current value to a slightly earlier value) and then taking a limit. This is consistent with **efficient causality** — the idea that the current state of a system is completely determined by its immediately preceding state.

### 7.2 Incipient Differential Calculus (IDC)

**Incipient Differential Calculus (IDC)** is a novel mathematical framework developed by Corrado Giannantoni (Italian nuclear engineer and mathematician, Ente Nazionale per le Energie Alternative, Rome) beginning in the early 2000s. It was developed originally to provide a rigorous mathematical foundation for Odum's Maximum Em-Power Principle — the theoretical basis of Odum ESL.

The word **incipient** means "beginning to happen" or "in its earliest stages." Giannantoni uses it to describe a derivative that captures the tendency of a process at its point of origin, rather than measuring what has already happened.

**The key mathematical difference:**

In TDC, you compute `[x(t + Δt) - x(t)] / Δt` and then let `Δt → 0`. The difference operation comes first; the limit comes second.

In IDC, Giannantoni reverses the priority. The **incipient derivative** `d̃x/dt` is defined by starting with the **generative structure** of the process — the function that generates `x(t)` — and deriving the rate of change from that generator directly.

For exponential functions, this produces a striking result. Consider `x(t) = e^{φ(t)}` where `φ(t)` is some function of time. Under TDC:

```
dx/dt = φ'(t) · e^{φ(t)}
```

Under IDC:

```
d̃x/dt = φ̃'(t) · e^{φ(t)}
```

Where `φ̃'(t)` is the incipient derivative of `φ`. The exponential function keeps its form under IDC — this property is called **persistence of form**. For TDC, the exponential also keeps its form when `φ(t) = λt` (a constant rate), but not in general for variable `φ(t)`.

**Why this matters:** Many nonlinear ODEs that have no known closed-form solution in TDC become tractable in IDC. Specifically:

- **The Riccati equation** (`dx/dt = a(t)x² + b(t)x + c(t)`) — important in control theory and ecological modelling — has explicit IDC solutions expressed as **binary functions** (two distinct solution branches unified as a single mathematical object).
- **Abel's equations** — a more general class of nonlinear ODEs — have explicit IDC solutions as **n-et functions**.
- **Linear ODEs with variable coefficients up to order 4** — which generally have no closed-form TDC solution — always have explicit IDC solutions.

In TDC, all of these require numerical methods (Euler, RK4, etc.). In IDC, they can sometimes be computed analytically.

### 7.3 The "drift" phenomenon

Giannantoni shows that for some ODE systems, TDC and IDC solutions produce **different trajectories over time**. He calls this divergence **drift**.

- For **linear ODEs with constant coefficients** (e.g. the RC circuit), TDC and IDC solutions agree exactly. There is no drift.
- For **nonlinear ODEs** or **linear ODEs with variable coefficients**, TDC and IDC solutions can diverge. The rate of divergence depends on the degree of nonlinearity.

Giannantoni's position is that for **self-organising systems** — systems that spontaneously develop structure over time, such as living organisms, ecosystems, or economic systems — the IDC solution is more physically correct because it captures **generative causality** (the capacity of a system to produce outcomes exceeding the sum of its inputs) rather than **efficient causality** (the mechanistic cause-and-effect chain assumed by TDC).

This is a genuinely novel and contested claim. It is not widely accepted in mainstream physics or control engineering, which are built entirely on TDC. MDK does not take a position on which is more "correct" — instead, it runs **both solvers on the same model** and exposes the results together, so that users can observe drift empirically and draw their own conclusions.

### 7.4 What IDC is NOT

IDC is not a numerical method in the same sense as Euler or RK4. Euler and RK4 are algorithms for numerically approximating the solution to an ODE. IDC is a different mathematical framework for defining derivatives and expressing ODEs.

To use IDC to obtain explicit solutions, you need to:
1. Express the ODE in terms of incipient derivatives
2. Solve the resulting IDC equation analytically (finding the binary/n-et functions)

Step 2 requires **symbolic algebraic manipulation** — the kind of computation done by computer algebra systems (CAS) such as Mathematica, Maple, or SymPy. It is not a numerical operation. You cannot simply replace `dx/dt` with `d̃x/dt` and expect a standard numerical solver to handle it.

For the **specific ODE classes** that have known explicit IDC solutions (Riccati, linear variable-coefficient ODEs), MDK implements those closed-form solutions directly in C. For other ODE classes, MDK falls back to TDC with RK4. This means IDC is available in MDK for a useful but limited subset of models.

---

## 8. Fractional-Order Derivatives and Memory Effects

### 8.1 What "integer-order" means

All the derivatives discussed so far have been **integer-order**: first-order (`dx/dt`), second-order (`d²x/dt²`), and so on. The order of a derivative is always a whole number.

Standard Bond Graph theory — and standard physics and engineering generally — uses only integer-order constitutive relations:

- `C` element: `dq/dt = f` — first-order
- `I` element: `dp/dt = e` — first-order
- `R` element: `e = R·f` — zero-order (algebraic)

This is mathematically clean and covers the vast majority of engineering systems.

### 8.2 The limitation: systems with memory

However, some real physical systems exhibit behaviour that cannot be correctly represented by integer-order constitutive relations. The defining characteristic of these systems is **memory** — the current state depends not only on the current input but on the entire history of inputs.

**Example 1: Viscoelastic materials**

A **viscoelastic material** (rubber, biological soft tissue, certain polymers) behaves partly like a spring and partly like a viscous fluid. A pure spring stores energy and returns it instantly; a pure viscous damper dissipates energy proportional to the current velocity. A viscoelastic material does both simultaneously, but neither completely.

If you stretch a viscoelastic material and hold it at a fixed length, the stress (force per unit area) does not immediately settle to a steady value — it relaxes over time, because the material's internal structure is still rearranging. This is called **creep**. Standard integer-order Bond Graph C and R elements cannot reproduce this behaviour correctly. A **fractional-order C element** (with derivative order `0 < α < 1`) can.

**Example 2: Electrochemical impedance — the Warburg element**

In electrochemical systems (batteries, fuel cells, supercapacitors), the diffusion of ions through the electrolyte produces an impedance that is proportional to `1/√(jω)` — equivalently, `s^{-1/2}` in the Laplace domain. This is a **half-order** element: neither purely capacitive (order 1) nor purely resistive (order 0). It is called the **Warburg element** in electrochemistry and is routinely observed in experimental impedance spectroscopy.

Engineers currently approximate the Warburg element using a ladder network of many RC elements, which is accurate only over a limited frequency range. A true half-order `R` element in the Bond Graph would be exact.

**Example 3: Anomalous diffusion**

In some physical systems (diffusion through porous media, diffusion in biological cells, certain polymer solutions), diffusion does not follow Fick's law (`∂c/∂t = D ∇²c`, which is first-order in time). Instead, the mean squared displacement of particles grows as `t^α` with `0 < α < 1` (subdiffusion) or `1 < α < 2` (superdiffusion). This requires a fractional-order time derivative.

### 8.3 Fractional derivatives defined

A **fractional derivative** of order `α` (where `α` is any positive real number, not necessarily an integer) is a generalization of the ordinary derivative to non-integer orders.

There are several mathematically equivalent (in most practical cases) definitions. MDK uses the **Grünwald-Letnikov (GL)** definition because it is the most tractable for numerical implementation in C.

The Grünwald-Letnikov fractional derivative of order `α` is defined as:

```
D^α x(t) = lim_{Δt→0} (1/Δt^α) * Σ_{k=0}^{N} (-1)^k * C(α,k) * x(t - k·Δt)
```

Where:
- `α` is the derivative order (e.g. `0.5` for the Warburg element)
- `Δt` is the time step
- `N` is the number of past time steps included (the **memory window**)
- `C(α, k)` are the **Grünwald-Letnikov coefficients**, defined by the generalised binomial formula:

```
C(α, 0) = 1
C(α, k) = C(α, k-1) * (α - k + 1) / k    for k ≥ 1
```

**In plain English:** the fractional derivative of order `α` at time `t` is a weighted sum of all past values of `x`, going back `N` time steps. Values in the more distant past receive smaller weights (the GL coefficients decay for large `k`). The further back you look, the less influence the distant past has — but it never becomes exactly zero. This is the mathematical expression of memory.

### 8.4 Implementation in MDK

In C, the GL fractional derivative is implemented as:

1. A **ring buffer** of the last `N` values of `x` (fixed-size array, overwritten in a circular manner)
2. A **precomputed array** of GL coefficients `C(α, k)` for `k = 0, 1, ..., N`
3. At each time step: a **dot product** of the ring buffer and the GL coefficients, scaled by `1/Δt^α`

This is computationally modest: `O(N)` multiplications and additions per fractional element per time step. The memory cost is `O(N)` floats per element.

**Memory window length `N`:** The GL sum should in principle extend to `N = ∞` (all of history). In practice, the GL coefficients decay quickly enough that truncating to a finite `N` introduces only a small error. The appropriate `N` depends on `α` and the time scale of the dynamics. MDK exposes `N` as a configurable parameter per element, defaulting to a value that provides less than 1% relative error for typical applications.

**Fractional elements in MDK:**

| Element | Symbol | Order `α` | Physical examples |
|---------|--------|-----------|-------------------|
| Fractional compliance | `FC(α)` | `0 < α < 1` | Viscoelastic spring, polymer creep |
| Fractional resistance | `FR(α)` | `0 < α < 1` | Warburg diffusion impedance, anomalous diffusion |
| Half-order Warburg | `FR(0.5)` | `0.5` | Battery electrolyte, fuel cell membrane |

Fractional elements integrate into the Bond Graph framework in the same way as standard elements: they participate in SCAP, receive a causal assignment, and contribute a state derivative to `compute_derivatives()`. The only difference is that their constitutive relation involves the GL fractional derivative rather than an integer-order derivative.

---

## 9. How MDK Runs All Three Approaches Together

`@mdk/sim-kernel` integrates all of the above into a single compiled WASM binary. The domain and solver are selected via the JSON model file:

```json
{
  "schemaVersion": "1.0",
  "domain": "bondgraph",
  "solver": {
    "method": "rk4",
    "dt": 0.001,
    "t_end": 10.0,
    "idc_mode": "parallel"
  },
  "nodes": [ ... ],
  "edges": [ ... ]
}
```

### `"domain"` field

| Value | Meaning |
|-------|---------|
| `"bondgraph"` | Use Bond Graph domain: SCAP runs first, then causal `compute_derivatives()` |
| `"odum-esl"` | Use Odum ESL domain: flat net-flow `compute_derivatives()` (GSSK behaviour) |

### `"solver.method"` field

| Value | Meaning |
|-------|---------|
| `"euler"` | Euler's method (fast, less accurate) |
| `"rk4"` | Runge-Kutta 4th order (default) |

### `"solver.idc_mode"` field

| Value | Meaning |
|-------|---------|
| `"off"` | Run TDC solver only (default) |
| `"parallel"` | Run both TDC (RK4) and IDC solvers; return both trajectories and drift metric |
| `"idc_only"` | Run IDC solver only (available only for supported ODE classes) |

### Output format

```json
{
  "tdc": {
    "time": [0.0, 0.001, 0.002, ...],
    "state": [[x1, x2, ...], [x1, x2, ...], ...]
  },
  "idc": {
    "time": [0.0, 0.001, 0.002, ...],
    "state": [[x1, x2, ...], [x1, x2, ...], ...]
  },
  "drift": {
    "max": 0.0031,
    "rms": 0.0012,
    "first_divergence_t": 4.23
  },
  "causality_report": {
    "valid": true,
    "conflicts": []
  }
}
```

The `"drift"` fields are only present when `"idc_mode": "parallel"`. The `"causality_report"` is always present for the Bond Graph domain.

### Processing order inside the kernel

For a Bond Graph model with parallel TDC/IDC:

1. Parse JSON model; validate against schema
2. Build internal graph data structures
3. Run SCAP → produce causal order and detect conflicts
4. If SCAP reports conflicts: return error immediately; do not simulate
5. Initialise state vector from initial conditions in JSON
6. For each time step:
   a. Call Bond Graph `compute_derivatives()` following causal order → produces `dx/dt`
   b. Advance TDC state: apply RK4 to `dx/dt` → new TDC state
   c. Advance IDC state: apply IDC closed-form update (where available) or RK4 as fallback → new IDC state
   d. Compute drift between TDC and IDC states
   e. Check safety envelopes (if any declared)
   f. Append to output trajectory
7. Return output JSON

---

---

## 10. The MDK Software Architecture

Understanding how the MDK packages relate to each other helps you know where to look when something goes wrong and what each piece is responsible for.

### 10.1 The packages

MDK is structured as a **monorepo** — a single code repository containing multiple interdependent packages, each published separately to npm. The packages and their responsibilities are:

| Package | Language | Role |
|---------|----------|------|
| `@mdk/sim-kernel` | C, compiled to WASM | The simulation engine: runs SCAP, computes derivatives, integrates ODEs, returns results |
| `@mdk/core` | TypeScript | The CDK constructs: TypeScript classes for L1 elements, L2 composites, and the `synth()` pipeline |
| `@mdk/dia` | JavaScript (Web Components) | The diagram editor: drag-and-drop visual model builder, runs in a browser or VSCode Webview |
| `mdk-vscode` | TypeScript | The VSCode extension: hosts real-time linting and the `@mdk/dia` Webview panel |
| `@mdk/runtime` | TypeScript | The digital twin runtime: connects a live device to a running simulation |
| `@mdk/aws-constructs` | TypeScript | Cloud constructs: AWS Lambda, DynamoDB, IoT Core as MDK model elements |

### 10.2 The data flow

All data in MDK flows through a central representation: the **JSON model file**. This file is the single source of truth for a system description. Every tool that MDK provides either reads from or writes to this format.

```
TypeScript code           @mdk/dia diagram editor
(written by the user)     (drag-and-drop in VSCode)
         │                          │
         │  mdk synth()             │  @mdk/dia → JSON
         ▼                          ▼
    ┌─────────────────────────────────────┐
    │         JSON model file             │  ← version-controlled in Git
    │   (the single source of truth)      │
    └─────────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
    @mdk/sim-kernel   mdk firmware  mdk scipy
    (simulation)      (C code for   (Python
                       MCU)          script)
```

The JSON model file contains:
- The system topology (which elements exist and how they are connected)
- The parameter values (resistance values, mass, stiffness, etc.)
- The initial conditions (starting state at `t = 0`)
- Visual layout information (for the diagram editor)
- Solver configuration (time step, simulation duration, domain, solver method)

### 10.3 The WASM boundary

The most important architectural boundary in MDK is between the TypeScript layer and the C/WASM layer. This boundary exists because:

- The C engine (`@mdk/sim-kernel`) must run fast. Simulation is computationally intensive. C with compiler optimisations is orders of magnitude faster than interpreted JavaScript.
- The C engine must be portable. By compiling to WASM, the same binary runs in Node.js (for the CLI), in a browser (for the GitHub Pages demo and the `mdk dashboard`), and inside VSCode's extension host.
- The TypeScript layer handles the user-facing API (constructs, CLI commands, schema validation). It is flexible and easy to extend.

The boundary is crossed by passing a JSON string from TypeScript to WASM, and receiving a JSON string back. The TypeScript layer validates the JSON against a **Zod schema** before it is sent, ensuring the C engine never receives malformed input. The Zod schema is the machine-readable definition of what a valid MDK model looks like.

---

## 11. Writing Models in TypeScript: The CDK Pattern

MDK's TypeScript API is inspired by **AWS Cloud Development Kit (CDK)** — a framework that allows engineers to describe cloud infrastructure (servers, databases, queues) as TypeScript code, rather than in static configuration files. MDK applies the same principle to physical systems.

### 11.1 What is a construct?

A **construct** is a TypeScript class that represents a system component. Constructs are composable: you can nest them inside each other to build up larger systems from smaller parts.

MDK defines three levels of construct, borrowing CDK's terminology:

| Level | Name | Description | Examples |
|-------|------|-------------|---------|
| L1 | **Primitive** | A single Bond Graph element — the lowest level of abstraction | `Se`, `Sf`, `R`, `C`, `I`, `TF`, `GY`, `J0`, `J1` |
| L2 | **Composite** | A group of L1 elements that together form a recognisable subsystem | `DCMotor`, `Gearbox`, `HydraulicActuator`, `PIDController` |
| L3 | **Vendor** | A specific real-world product, parameterised with its datasheet values | `@mdk/maxon-re40`, `@mdk/arduino-uno` |

A user working at the L2/L3 level does not need to know the internal Bond Graph topology of a `DCMotor`. The L2 construct handles that. A user building a new L2 construct works at the L1 level, assembling primitives.

### 11.2 A complete example: the RC circuit

The simplest possible electrical system is an **RC circuit**: a voltage source, a resistor, and a capacitor connected in series. The capacitor charges up toward the source voltage, with a time constant `τ = R × C`.

**The model in TypeScript:**

```typescript
import { MdkSystem, Se, R, C, J1 } from '@mdk/core';

// Create a new system container
const sys = new MdkSystem('rc-circuit');

// Create the Bond Graph elements
const battery  = new Se(sys, 'battery',  { effort: 12.0 });   // 12V voltage source
const resistor = new R(sys,  'resistor', { resistance: 1000 }); // 1kΩ resistor
const cap      = new C(sys,  'cap',      { compliance: 1e-3, initialCharge: 0 }); // 1mF capacitor

// Connect them at a 1-junction (series connection: common flow)
const j1 = new J1(sys, 'series');
j1.connect(battery.port);
j1.connect(resistor.port1);
resistor.port2.connect(cap.port);

// Run SCAP and simulate
const result = sys.synth({
  solver: { method: 'rk4', dt: 0.001, t_end: 5.0 }
});

console.log(result.tdc.state);  // Voltage across capacitor over time
```

**What `synth()` does:**

1. Walks the TypeScript object graph (all the `Se`, `R`, `C`, `J1` instances and their connections)
2. Serialises it to a JSON model file: `rc-circuit.mdk.json`
3. Validates the JSON against the Zod schema
4. Calls `sim_kernel_run(json)` on the WASM binary
5. Inside the WASM: SCAP runs, then the RK4 solver runs
6. Returns the simulation result object

If there is a causality conflict (e.g. you connected two voltage sources in parallel), step 5 returns a causality error instead of a simulation result. In that case, `synth()` throws a `CausalityConflictError` in TypeScript with a description of which element and which bond caused the conflict.

### 11.3 A more complex example: the DC motor

A **DC motor** is a transducer: it converts electrical energy (voltage, current) into mechanical energy (torque, angular velocity). In Bond Graph terms, this is a **GY** (gyrator) element.

A complete DC motor model includes:
- An electrical domain: the coil resistance `R_e`, the coil inductance `I_e`, and a voltage source `Se`
- A mechanical domain: the rotor inertia `I_m`, the bearing friction `R_m`
- A transducer: the `GY` element coupling the two domains

Using an L2 construct:

```typescript
import { MdkSystem, Se } from '@mdk/core';
import { DCMotor } from '@mdk/core/composites';

const sys = new MdkSystem('motor-drive');

const supply = new Se(sys, 'supply', { effort: 24.0 }); // 24V supply
const motor  = new DCMotor(sys, 'motor', {
  coilResistance:   2.5,    // Ohms
  coilInductance:   0.005,  // Henries
  torqueConstant:   0.08,   // Nm/A  (also the back-EMF constant in V·s/rad)
  rotorInertia:     0.002,  // kg·m²
  bearingFriction:  0.001,  // N·m·s/rad
  initialVelocity:  0.0     // rad/s
});

supply.electricalPort.connect(motor.electricalPort);

const result = sys.synth({
  solver: { method: 'rk4', dt: 0.0001, t_end: 2.0 }
});
```

The `DCMotor` L2 construct internally creates the Bond Graph topology (the L1 elements and their connections) and presents a clean interface to the user. The user only needs to supply the physical parameters they would find on a motor datasheet.

### 11.4 Using vendor packages

If you are using a real motor — for example, the Maxon RE-40 — you can install its vendor package instead of specifying parameters manually:

```bash
mdk add @mdk/maxon-re40
```

```typescript
import { MdkSystem, Se } from '@mdk/core';
import { MaxonRE40 } from '@mdk/maxon-re40';

const sys = new MdkSystem('robot-arm-joint');
const supply = new Se(sys, 'supply', { effort: 24.0 });
const motor  = new MaxonRE40(sys, 'joint-motor');

supply.electricalPort.connect(motor.electricalPort);

const result = sys.synth({ solver: { method: 'rk4', dt: 0.0001, t_end: 2.0 } });
```

The `@mdk/maxon-re40` package contains the verified datasheet parameters for that specific motor. You are guaranteed that the simulation reflects the real physical device.

---

## 12. Understanding Causality Conflicts

A **causality conflict** is the Bond Graph equivalent of a type error in TypeScript, or a short circuit in electronics. It means the system as described is physically impossible — not just difficult to solve, but self-contradictory.

### 12.1 Why causality conflicts occur

Recall from Section 4.3 that causality determines which variable is an input and which is an output for each element. A conflict occurs when the causal rules of two or more elements demand contradictory assignments on the same bond.

**The most common cause: two effort sources connected in parallel**

Imagine connecting two batteries of different voltages in parallel without any resistance between them:

```typescript
const battery1 = new Se(sys, 'bat1', { effort: 12.0 }); // 12V
const battery2 = new Se(sys, 'bat2', { effort: 9.0 });  // 9V
const j0 = new J0(sys, 'parallel');
j0.connect(battery1.port);
j0.connect(battery2.port);
```

A `J0` junction enforces that all connected bonds share the same effort. But `battery1` insists the effort is 12V, and `battery2` insists it is 9V. These demands cannot both be true simultaneously. In a real circuit, the result would be a large current flowing between the batteries, limited only by their internal resistance. In the idealised Bond Graph model, where sources are ideal (zero internal resistance), this is a true contradiction.

SCAP detects this during the causality assignment step and reports:

```
CausalityConflictError: Conflict at J0 'parallel'
  Se 'bat1' imposes effort = 12.0
  Se 'bat2' imposes effort = 9.0
  A 0-junction cannot have two effort inputs.
  
Possible fixes:
  - Add a resistance element between the sources (models internal resistance)
  - Use a single source with combined voltage
```

**The second common cause: two flow sources connected in series**

The dual situation: two `Sf` elements on the same `J1` junction. A `J1` junction enforces a common flow, but two flow sources each trying to impose a different flow is equally contradictory.

### 12.2 Causality conflicts are physics errors, not software errors

This distinction is important. A causality conflict does not mean you have written incorrect TypeScript. It means you have described a physical system that violates the laws of physics as expressed in Bond Graph theory. The correct response is to revisit the physical design, not to work around the error in code.

Common legitimate reasons for a causality conflict in a real system:
- **Missing damping:** An idealised `I` (inertia) or `C` (compliance) element with no associated `R` (resistance) can create derivative causality, which indicates the model needs a physical dissipation mechanism.
- **Topology error:** You have connected elements in a way that does not reflect the physical layout (e.g. two motors mechanically rigidly coupled but electrically independent — the coupling introduces a constraint).
- **Missing transducer:** Connecting two elements from different physical domains (e.g. an electrical `Se` directly to a mechanical `J1`) without a `TF` or `GY` in between.

### 12.3 Real-time conflict detection in VSCode

When you have the MDK VSCode extension installed, SCAP runs in the background every time you save a TypeScript model file. Causality conflicts appear as red squiggly underlines on the offending connection, with a hover tooltip explaining the conflict.

This means you catch physics errors at the same moment you make them — before you run a simulation, generate firmware, or order hardware. The cost of a causality error at design time (fixing TypeScript code) is orders of magnitude lower than the cost at hardware commissioning time (replacing a component or redesigning a PCB).

---

## 13. Understanding Simulation Results

### 13.1 State variables and their units

The simulation output contains a time series for each **state variable** in the system. Recall from Section 4.2 that state variables are the stored quantities in `C` and `I` elements:

| Element | State variable | Symbol | Units (example: electrical) |
|---------|----------------|--------|----------------------------|
| `C` (Compliance/Capacitance) | Displacement / Charge | `q` | Coulombs (electrical), metres (mechanical) |
| `I` (Inertia/Inductance) | Momentum / Flux linkage | `p` | kg·m/s (mechanical), Webers (electrical) |

The output values are raw state variables, not the effort and flow variables you may be more familiar with. To obtain effort and flow, you apply the element's constitutive relation:

| Element | Constitutive relation | Example |
|---------|----------------------|---------|
| `C` | `e = q / C` | Capacitor voltage = charge / capacitance |
| `I` | `f = p / I` | Mass velocity = momentum / mass |

`@mdk/core` provides helper methods on the result object to compute these directly:

```typescript
const result = sys.synth({ ... });

// Raw state variable (charge in coulombs)
const charge = result.getState('cap');

// Derived quantity (voltage in volts)
const voltage = result.getEffort('cap');

// Time vector
const time = result.tdc.time;
```

### 13.2 The causality report

Every Bond Graph simulation result includes a **causality report**:

```json
{
  "causality_report": {
    "valid": true,
    "conflicts": [],
    "derivative_causality_elements": [],
    "algebraic_loops": []
  }
}
```

| Field | Meaning |
|-------|---------|
| `valid` | `true` if SCAP succeeded with no conflicts |
| `conflicts` | List of elements with contradictory causal assignments |
| `derivative_causality_elements` | List of storage elements (`C` or `I`) that were forced into derivative causality (indicates a DAE, which may require a specialised solver) |
| `algebraic_loops` | Groups of elements that form a circular dependency (the simulation can still run in some cases, but results may be unreliable) |

A simulation can only proceed if `valid` is `true`. If it is `false`, the `state` arrays in the output will be empty.

### 13.3 Interpreting drift (TDC vs IDC)

When you run in `idc_mode: "parallel"`, the output contains both a TDC trajectory and an IDC trajectory, along with a drift summary:

```json
{
  "drift": {
    "max": 0.0031,
    "rms": 0.0012,
    "first_divergence_t": 4.23
  }
}
```

| Field | Meaning |
|-------|---------|
| `max` | The maximum absolute difference between TDC and IDC state values, across all state variables and all time steps |
| `rms` | The root mean square difference (a measure of average drift, less sensitive to outliers than `max`) |
| `first_divergence_t` | The time at which the TDC and IDC trajectories first differ by more than a threshold (default: 1% of the initial value) |

**Interpreting the numbers:**
- `drift.max ≈ 0` (less than numerical precision): The system is linear with constant coefficients. TDC and IDC agree exactly. The IDC solution is providing no additional information.
- `drift.max` growing slowly over time: The system has mild nonlinearity. Both solutions are plausible; the drift represents genuine mathematical uncertainty about which framework better describes the physics.
- `drift.max` growing rapidly: The system is strongly nonlinear. This is the regime where Giannantoni argues IDC is most valuable. The two trajectories should be treated as two hypotheses about system behaviour, not as a single answer.

For engineering applications where you need a result that agrees with Simulink, MATLAB, or SciPy, use the TDC trajectory. For research into self-organising systems, use the IDC trajectory and report the drift alongside your results.

---

## 14. Choosing Between Odum ESL and Bond Graph

Both domains are available in `@mdk/sim-kernel`. The choice between them is a modelling decision, not a software preference.

### Use Bond Graphs when:

- You are modelling **engineering systems**: motors, gearboxes, hydraulic actuators, electrical circuits, mechanical linkages
- You need to **validate physical feasibility** at design time — SCAP gives you causality checking
- Your system spans **multiple physical domains** (electrical + mechanical + hydraulic) — Bond Graphs handle domain coupling through `TF` and `GY` elements naturally
- You need to generate **firmware code** (`mdk firmware`) or **state-space matrices** for a control system
- You care about **energy conservation** — Bond Graphs track power flow explicitly and always conserve energy by construction

### Use Odum ESL when:

- You are modelling **ecological or economic systems**: food webs, nutrient cycles, supply chains, energy economies
- Your system involves **saturation effects** (Monod kinetics), **threshold switching**, or **multiplicative interaction** between components — GSSK's five flow logic types handle these naturally
- You want to apply the **Maximum Em-Power Principle** or **Emergy analysis** to optimise system structure
- You are studying **self-organising behaviour** — the emergence of structure from energy flows, which is Odum ESL's native domain
- You want to compare TDC and IDC results (the drift between them is most meaningful in Odum ESL models, where IDC has its theoretical home)

### When the choice is ambiguous:

Some systems genuinely span both domains. A robotic system harvesting energy from a solar panel, storing it in a battery, and using it to drive motors in a landscape that exhibits ecological dynamics (food sources, terrain) would involve Bond Graphs for the mechanical and electrical subsystems and Odum ESL for the ecological context.

MDK's `InformationBond` (planned for a future phase) will provide a clean way to connect the two domains: Bond Graph subsystems can expose effort/flow signals to Odum ESL subsystems via directed signal bonds, without power conservation applying across the boundary.

---

## 15. Glossary

This glossary defines all technical terms used in this manual. Terms are listed alphabetically.

**Abel's equation** — A class of nonlinear first-order ODE of the form `dx/dt = f₃(t)x³ + f₂(t)x² + f₁(t)x + f₀(t)`. Giannantoni's IDC provides explicit solutions expressed as *n-et functions*.

**Algebraic loop** — A circular dependency in the causal graph where element A's output feeds element B, whose output feeds back to element A, with no storage element (C or I) breaking the loop. Algebraic loops indicate that the system equations include implicit algebraic constraints that may have no unique solution or require iterative resolution.

**Bond** — A directed line in a Bond Graph diagram representing the exchange of power between two elements. A bond simultaneously carries both an effort and a flow variable. The half-arrow direction indicates the positive power flow direction.

**Bond Graph** — A domain-neutral graphical modelling language for physical systems, based on the universal variables of effort and flow. Developed by Henry Paynter at MIT in the 1960s. All physical domains (electrical, mechanical, hydraulic, thermal) are described using the same element types and mathematical framework.

**C element (Compliance/Capacitance)** — A Bond Graph storage element that accumulates energy in a displacement variable (charge `q` for electrical, position for mechanical). Constitutive relation: `e = q / C`, state equation: `dq/dt = f`. The electrical analogy is a capacitor; the mechanical analogy is a spring.

**Causal stroke** — A short perpendicular line drawn at one end of a Bond Graph bond to indicate the direction of causality: which end imposes effort (stroke at tail means effort input; stroke at head means flow input).

**Causality** — The assignment, for each Bond Graph element and each bond, of which variable (effort or flow) is the input and which is the output. Causality determines the mathematical structure of the simulation equations.

**Causality conflict** — A condition detected by SCAP in which two or more elements impose contradictory causal requirements on the same bond. Equivalent to a physical paradox (e.g. two ideal voltage sources in parallel with different voltages). MDK refuses to simulate a model with a causality conflict.

**CDK pattern** — A software architecture pattern borrowed from AWS Cloud Development Kit, in which complex system descriptions are built from composable TypeScript classes called *constructs*. MDK applies this pattern to physical systems.

**Compliance** — In Bond Graph theory, the C element — a storage element relating effort to accumulated flow (displacement). Called *compliance* in the general case, *capacitance* in the electrical domain.

**Compute_derivatives()** — The central function of any ODE simulation engine. Given the current system state vector `x` and time `t`, it returns `dx/dt` — the rate of change of every state variable. The two domains in `@mdk/sim-kernel` implement this function very differently (see Section 5).

**Construct** — A TypeScript class in `@mdk/core` that represents a system component. Constructs are composable (nestable) and exist at three abstraction levels: L1 (primitives), L2 (composites), L3 (vendor products).

**Creep** — The gradual deformation of a viscoelastic material under sustained stress. Creep cannot be accurately modelled by standard integer-order Bond Graph elements; it requires fractional-order compliance elements.

**Derivative causality** — A causal assignment in which a `C` or `I` element is forced to have its integrated variable as an *input* rather than its derivative. This produces a more complex mathematical structure (a DAE) and indicates a model topology that cannot be expressed as a simple set of ODEs.

**Differential Algebraic Equation (DAE)** — A system of equations containing both differential equations (involving derivatives) and algebraic constraints (no derivatives). More difficult to solve numerically than pure ODEs. Indicated in Bond Graphs by derivative causality.

**Domain** — In `@mdk/sim-kernel`, one of two modelling frameworks: `"bondgraph"` or `"odum-esl"`. Selects which `compute_derivatives()` implementation is used.

**Drift** — In MDK, the divergence over time between the TDC (RK4) and IDC solutions to the same ODE model. Drift is zero for linear constant-coefficient systems and non-zero for nonlinear or variable-coefficient systems.

**Effort** — One of the two universal power variables in Bond Graph theory. Effort is the variable that drives flow — voltage in electrical systems, force in translational mechanical systems, torque in rotational systems, pressure in hydraulic systems, temperature in thermal systems.

**Emergy** — A quantity introduced by H.T. Odum, defined as the total amount of energy (measured in solar equivalent joules) required to produce a given product or service. Emergy accounts for the cumulative energy transformations through the entire production chain, not just the energy content at the point of use.

**Energy Systems Language (ESL)** — H.T. Odum's graphical notation for modelling energy and material flows in any system type — ecological, economic, physical, or social. The basis for the Odum ESL domain in `@mdk/sim-kernel`.

**Euler's method** — The simplest numerical ODE solver: `x(t+Δt) = x(t) + Δt · f(x,t)`. First-order accurate; prone to instability at large time steps.

**Flow** — One of the two universal power variables in Bond Graph theory. Flow is what moves through an element as a result of an effort driving it — current in electrical systems, velocity in translational mechanical systems, angular velocity in rotational systems, volume flow rate in hydraulic systems.

**Fractional derivative** — A generalisation of the ordinary derivative to non-integer orders `α`. The α-th order derivative of a function captures the memory of the function's history. Used in MDK to model viscoelastic materials, electrochemical diffusion impedance, and anomalous diffusion.

**GY element (Gyrator)** — A Bond Graph element that couples two domains by converting effort on one port to flow on the other port (and vice versa), while conserving power. The electrical-to-mechanical coupling in a DC motor is a gyrator. The gyrator constant `k` relates torque and current: `e₂ = k·f₁`, `f₂ = k·e₁`.

**Grünwald-Letnikov (GL) definition** — A definition of the fractional derivative as a weighted sum of past values: `D^α x(t) ≈ (1/Δt^α) Σ C(α,k) x(t − kΔt)`. The most tractable for numerical implementation in C. Used in MDK's fractional element implementation.

**I element (Inertia/Inductance)** — A Bond Graph storage element that accumulates energy in a momentum variable (mechanical momentum `p = mv`, magnetic flux linkage for inductors). Constitutive relation: `f = p / I`, state equation: `dp/dt = e`. The electrical analogy is an inductor; the mechanical analogy is a mass.

**IDC (Incipient Differential Calculus)** — A novel mathematical framework developed by Corrado Giannantoni that defines derivatives by prioritising the generative structure of a process rather than the retrospective difference quotient of TDC. IDC yields explicit closed-form solutions for certain ODE classes that require numerical methods in TDC.

**Integral causality** — The preferred causal assignment for `C` and `I` elements in which the state variable evolves through integration of an input. `C` with integral causality: flow is input, charge `q = ∫f dt` is output. `I` with integral causality: effort is input, momentum `p = ∫e dt` is output. Integral causality produces well-conditioned ODEs.

**J0 junction (0-junction, Common Effort junction)** — A Bond Graph junction at which all connected bonds share the same effort. The sum of all signed flows at the junction is zero. Analogous to a parallel electrical connection.

**J1 junction (1-junction, Common Flow junction)** — A Bond Graph junction at which all connected bonds share the same flow. The sum of all signed efforts at the junction is zero. Analogous to a series electrical connection.

**JSON model file** — The central data format in MDK, with file extension `.mdk.json`. Contains the complete system description: topology, parameters, initial conditions, visual layout, and solver configuration. The canonical source of truth from which all other representations (TypeScript code, simulation results, firmware) are derived.

**Linter** — In software, a tool that checks code for errors without running it. MDK's SCAP algorithm acts as a "physics linter": it checks a Bond Graph model for physical validity (causality conflicts, algebraic loops) before simulation. The MDK VSCode extension runs SCAP in real time as the user types.

**Maximum Em-Power Principle (MEmPP)** — H.T. Odum's proposed Fourth Thermodynamic Principle: *all self-organising systems tend to organise their internal structure to maximise the flow of processed emergy*. The mathematical formalisation of this principle led Giannantoni to develop IDC.

**Maximum Ordinality Principle (MOP)** — Giannantoni's generalisation of the Maximum Em-Power Principle, expressed using IDC. The MOP extends the principle to arbitrary self-organising systems using *ordinal relationships* rather than functional relationships.

**Memory window (N)** — In MDK's Grünwald-Letnikov fractional derivative implementation, the number of past time steps included in the weighted sum. A larger `N` gives more accurate results at the cost of more memory and computation.

**Monorepo** — A single code repository containing multiple packages. MDK uses a monorepo structure with npm workspaces, allowing all packages to be developed, tested, and versioned together.

**Odum ESL** — See *Energy Systems Language*.

**ODE (Ordinary Differential Equation)** — An equation containing a function and one or more of its derivatives. The term *ordinary* distinguishes it from a partial differential equation (PDE), which involves derivatives with respect to multiple independent variables. ODE simulation is MDK's primary computational task.

**Power bond** — In Bond Graph theory, a bond that simultaneously carries effort and flow, representing a power exchange between two elements. Distinct from an *information bond*, which carries only a signal without power.

**R element (Resistance)** — A Bond Graph dissipative element that converts power to heat through a resistance relationship between effort and flow: `e = R·f` (linear case). The electrical analogy is a resistor; the mechanical analogy is a damper or friction element.

**Ring buffer** — A fixed-size array used in a circular manner: when the array is full, new values overwrite the oldest. Used in MDK's GL fractional derivative implementation to store the history of past values.

**RK4 (Runge-Kutta 4th order)** — A standard numerical ODE solver that evaluates `compute_derivatives()` four times per time step to achieve fourth-order accuracy. The default solver in `@mdk/sim-kernel`.

**SCAP (Sequential Causality Assignment Procedure)** — The algorithm that determines the correct causal assignment for every bond in a Bond Graph. Developed by Karnopp and Rosenberg. SCAP is run before every simulation in the Bond Graph domain; a causality conflict detected by SCAP prevents simulation from proceeding.

**Se element (Effort Source)** — A Bond Graph element that imposes a fixed (or time-varying) effort on the system, regardless of the resulting flow. The electrical analogy is an ideal voltage source; the mechanical analogy is gravity. `Se` has fixed causality: it always imposes effort.

**Sf element (Flow Source)** — A Bond Graph element that imposes a fixed (or time-varying) flow on the system, regardless of the resulting effort. The electrical analogy is an ideal current source; the mechanical analogy is a constant-velocity actuator. `Sf` has fixed causality: it always imposes flow.

**State space** — A mathematical representation of a dynamic system as a set of first-order ODEs: `ẋ = Ax + Bu`, `y = Cx + Du`. The matrices A (state), B (input), C (output), D (feedthrough) completely characterise the linear system's dynamics and are used in control system design.

**State variable** — One of the minimum set of variables required to predict all future behaviour of a system. In Bond Graphs, state variables are the stored quantities in `C` elements (displacement/charge) and `I` elements (momentum/flux linkage).

**Stiff system** — An ODE system containing dynamics at widely separated time scales (e.g. one component with a 1-millisecond time constant and another with a 10-second time constant). Stiff systems require small time steps in standard solvers (Euler, RK4), making simulation slow. Specialised implicit solvers handle stiff systems more efficiently.

**TDC (Traditional Differential Calculus)** — The standard calculus of Newton and Leibniz, defining the derivative as a limit of a difference quotient. The foundation of all conventional physics and engineering mathematics, and of the Euler and RK4 numerical methods.

**TF element (Transformer)** — A Bond Graph element that scales effort and flow between two ports by a fixed ratio `n`, while conserving power: `e₂ = n·e₁`, `f₁ = n·f₂`. The electrical analogy is an ideal transformer; the mechanical analogy is a gear pair.

**Time constant (τ)** — For an RC circuit, `τ = R × C`. The time required for the capacitor voltage to reach approximately 63.2% of its final value after a step change in the source voltage. A useful measure of how quickly a first-order system responds.

**Transducer** — Any device that converts energy from one physical domain to another while conserving power. In Bond Graph terms, transducers are modelled as `TF` (if effort and flow scale proportionally) or `GY` (if effort on one port maps to flow on the other). DC motors, piezoelectric actuators, and thermoelectric generators are gyrators.

**Viscoelastic** — Describing a material that exhibits both elastic (spring-like) and viscous (damper-like) behaviour simultaneously. The mechanical response of a viscoelastic material depends on its entire strain history, making it a *memory system*. Requires fractional-order Bond Graph elements for accurate modelling.

**Warburg element** — An electrochemical impedance element arising from the diffusion of ions in an electrolyte. Impedance proportional to `s^{-1/2}` in the Laplace domain — a half-order element. Modelled in MDK as a fractional resistance `FR(0.5)`.

**WASM (WebAssembly)** — A binary instruction format that runs in web browsers and Node.js at near-native speed. MDK's simulation kernel is compiled from C to WASM so that it runs without requiring a C compiler or any native dependencies on the user's machine.

**Zod** — A TypeScript-first schema validation library. MDK uses Zod to validate JSON model files before they are passed to the WASM kernel, ensuring the C engine never receives malformed input.

---

*This manual will be updated as the MDK simulation engine evolves. For questions, open an issue at the MDK repository.*
