# System Specification: Deterministic Systems Engineering Engine (DSEE)

## Executive Summary & System Overview

The Deterministic Systems Engineering Engine (DSEE) is a hybrid, recursive software architecture designed to automate the generation of mathematically rigorous, **Executable Enterprise** models. By integrating SysML 2.0, Bond Graph dynamic simulation, and Howard T. Odum’s Energy Systems Language (ESL), the DSEE bridges the gap between unstructured human intent and fully traceable, time-series simulatable system specifications.

Unlike standard AI wrappers that rely on Large Language Models to generate entire codebases or architectures in a single pass—which inevitably leads to context collapse and mathematical hallucinations—the DSEE operates as a **strict, deterministic state-machine**. Implemented via a Context Assembler (Node.js) and WebAssembly (WASM), the DSEE acts as the ultimate gatekeeper. It manages the hierarchical decomposition of subsystems, enforces graph-theory traceability (SysML Allocation Matrices), and applies the laws of physics (Sequential Causality Assignment Procedure for Bond Graphs). The DSEE ensures that no system design proceeds to the next phase without mathematical and logical proof of validity.

### The Role of the Oracle (LLM)

Within the DSEE architecture, the Large Language Model (LLM) is deliberately constrained to the role of **the Oracle**. 

The Oracle is a highly specialized, stateless subroutine invoked by the DSEE exclusively for semantic translation, heuristic reasoning, and conceptual synthesis. It does not calculate math, nor does it manage the global state or memory of the system. Instead, the Oracle is queried by the DSEE's Context Assembler with highly specific, tightly scoped prompts to perform tasks that require human-like linguistic interpretation.

**The Oracle's primary responsibilities are to**:
*   Translate unstructured stakeholder prompts into formal SysML 2.0 textual syntax.
*   Synthesize macro-thermodynamic topologies using Odum ESL diagrams.
*   Propose the structural components (Nouns) and behavioral logic (Verbs) required to satisfy system requirements.
*   Interrogate the user via the Socratic method to extract missing boundary conditions and operational constraints.

> [!TIP]
> **In short**: The Oracle proposes the architecture, but the DSEE proves the physics. The Oracle provides the creative and semantic leaps necessary for system design, while the deterministic WASM engine acts as the "building inspector," verifying the Oracle's outputs against the immutable laws of logic and thermodynamics before accepting them into the Enterprise Model.

### The Universal Runtime: Node.js & WASM

The DSEE is designed for **universal portability**. By splitting responsibilities between a high-level orchestrator and a low-level compute engine, the system runs identically in a local terminal, a VSCode extension, or a purely static website.

| Component | Technology | Responsibility |
| :--- | :--- | :--- |
| **Context Assembler** | **Node.js / TypeScript** | State management, recursive flow control, Oracle (LLM) orchestration, and system-level I/O. |
| **Physics & Logic Kernel** | **C (compiled to WASM)** | Compute-heavy deterministic operations: SCAP causality algorithm, Matrix multiplication, ODE solvers, and Bond Graph topology synthesis. |

This architecture ensures that the **same mathematical proof** validates a model regardless of the environment. It enables "No-Install" onboarding via a browser-based demo while providing the performance needed for complex local enterprise simulations.

---

## Overview

**System Purpose**: A hybrid recursive engine that processes unstructured intent into a mathematically verifiable, executable SysML 2.0 and Bond Graph enterprise model.

**Architecture**: A hybrid stack where **Node.js** orchestrates the recursive state machine and **C (compiled to WASM)** executes high-performance deterministic algorithms. This ensures a consistent, verifiable runtime across local CLI, VSCode, and Browser environments.

---

## Phase 1: Elicitation & Macro-Definition

**Objective**: Establish the thermodynamic, operational, and logical boundaries of the current System of Interest (SOI).

### Step 1.1: Context & Actor Extraction
Parses unstructured input to identify external actors, the system boundary, and primary use cases. It acts as the semantic entry point for the SOI.

- **Engine**: `[LLM]`
- **Dependencies**: 
    - *If L0 (Enterprise)*: Unstructured User Prompt.
    - *If L1+ (Subsystem)*: Parent Subsystem Constraints & Allocated Interfaces.
- **Outputs**:
    - SysML Use Case Diagram (Textual Syntax).
    - Socratic JSON (`Missing_Parameters` array).

### Step 1.2: The Socratic Loop (Boundary Resolution)
A deterministic gate that halts execution if parameters are missing. It prompts the user (or queries the parent database) to resolve ambiguities before allowing structural design to begin.

- **Engine**: `[Node.js / UI]`
- **Dependencies**: Socratic JSON (from Step 1.1).
- **Outputs**: Validated Boundary Conditions JSON.

### Step 1.3: Requirement Flow-Down
Generates atomic, uniquely identified requirements based on the resolved context and boundaries. Establishes the criteria for system validation.

- **Engine**: `[LLM]`
- **Dependencies**:
    - Use Case Diagram (from Step 1.1).
    - Validated Boundary Conditions (from Step 1.2).
- **Outputs**:
    - SysML Requirement Diagram.
    - Socratic JSON (if further clarification is needed).

### Step 1.4: Macro-Thermodynamic Mapping (Odum ESL)
Maps the macro-energy and material flows using Howard T. Odum's Energy Systems Language. Establishes thermodynamic boundaries, storages, and cybernetic control multipliers.

- **Engine**: `[LLM]`
- **Dependencies**:
    - Requirement Diagram (from Step 1.3).
    - Validated Boundary Conditions (from Step 1.2).
- **Outputs**:
    - SysML Odum ESL Diagram (via Custom SysML Profile).
    - Odum Node-Edge JSON.

---

## Phase 2: Structural Synthesis

**Objective**: Define the physical and logical "Nouns" of the system and how they connect, strictly bounded by Phase 1 thermodynamics.

### Step 2.1: Namespace & Organization
Deterministically creates the hierarchical folder and package structure for the current SOI to maintain strict SysML 2.0 namespace compliance.

- **Engine**: `[Node.js]`
- **Dependencies**: System Name / SOI Identifier.
- **Outputs**: SysML Package Diagram.

### Step 2.2: Component Definition (BDD)
Translates Odum nodes into physical/logical blocks. Crucially, it assigns complexity tags to determine if a block is a primitive component or a complex subsystem requiring future recursion.

- **Engine**: `[LLM]`
- **Dependencies**:
    - Odum Node-Edge JSON (from Step 1.4).
    - Requirement Diagram (from Step 1.3).
- **Outputs**:
    - SysML Block Definition Diagram (BDD).
    - Complexity Tags JSON (Primitive or Subsystem).

### Step 2.3: Interface Routing (IBD)
Defines ports on the BDD blocks and connects them with ItemFlows representing the energy/data exchanges derived from the Odum diagram.

- **Engine**: `[LLM]`
- **Dependencies**:
    - BDD Blocks (from Step 2.2).
    - Odum Node-Edge JSON (from Step 1.4).
- **Outputs**:
    - SysML Internal Block Diagram (IBD).
    - Port Definitions JSON.

---

## Phase 3: Behavioral Synthesis

**Objective**: Define the operational "Verbs" of the system, detailing how the structural blocks interact over time to satisfy the Use Cases.

### Step 3.1: Functional Flow (Activity)
Maps the step-by-step actions and control flows the system executes to fulfill its primary functions.

- **Engine**: `[LLM]`
- **Dependencies**:
    - Use Case Diagram (from Step 1.1).
    - BDD Blocks (from Step 2.2).
- **Outputs**: SysML Activity Diagram.

### Step 3.2: Operational Modes (State Machine)
Defines the operational states (e.g., Off, Spooling, Nominal, Fault) and the triggers/guards that cause transitions between them.

- **Engine**: `[LLM]`
- **Dependencies**:
    - Activity Diagram (from Step 3.1).
    - Validated Boundary Conditions (from Step 1.2).
- **Outputs**: SysML State Machine Diagram.

### Step 3.3: Cybernetic Interaction (Sequence)
Maps the chronological message-passing and energy transfers between specific blocks across the lifelines of specific Use Cases.

- **Engine**: `[LLM]`
- **Dependencies**:
    - Use Case Diagram (from Step 1.1).
    - BDD Blocks (from Step 2.2).
    - State Machine Diagram (from Step 3.2).
- **Outputs**: SysML Sequence Diagram.

---

## Phase 4: Physical Synthesis & Validation

**Objective**: Enforce the laws of physics and logic. This phase is entirely deterministic, acting as the ultimate gatekeeper for the Executable Enterprise.

### Step 4.1: Traceability Audit (Graph-Theory Check)
Performs matrix multiplication to ensure all requirements are satisfied by structural blocks and verified by behavioral diagrams. Flags orphans and gold-plating.

- **Engine**: `[WASM]`
- **Dependencies**:
    - Requirement Diagram (from Step 1.3).
    - BDD (from Step 2.2).
    - Behavioral Diagrams (from Steps 3.1, 3.2, 3.3).
- **Outputs**:
    - Validated Allocation Matrix.
    - Gap Report JSON (If gaps exist, the engine triggers an LLM rework loop).

### Step 4.2: Bond Graph Synthesis & Causality (SCAP)
Translates IBD ports and Odum multipliers into a formal Bond Graph topology. Applies the Sequential Causality Assignment Procedure (SCAP) to ensure mathematical computability (no derivative causality or algebraic loops).

- **Engine**: `[WASM]`
- **Dependencies**:
    - IBD Port Definitions (from Step 2.3).
    - Odum Node-Edge JSON (from Step 1.4).
- **Outputs**: Causal Bond Graph Topology JSON.

### Step 4.3: Equation Mapping (Parametrics)
Algebraically derives State-Space equations ($\dot{x} = Ax + Bu$) from the causal Bond Graph and binds them to BDD properties via Constraint Blocks.

- **Engine**: `[WASM]`
- **Dependencies**:
    - Causal Bond Graph Topology JSON (from Step 4.2).
    - BDD Blocks (from Step 2.2).
- **Outputs**:
    - SysML Parametric Diagram.
    - Executable ODE Script (Python/Modelica/Rust).

### Step 4.4: The Recursion Gate
The control-flow engine for the entire architecture. Scans the Complexity Tags. If any block is tagged as a 'Subsystem', it packages that block's allocated requirements and interfaces, spawning a new Phase 1 instance for that specific block.

- **Engine**: `[Node.js]`
- **Dependencies**:
    - Complexity Tags JSON (from Step 2.2).
    - Validated Allocation Matrix (from Step 4.1).
    - IBD Port Definitions (from Step 2.3).
- **Outputs**:
    - **Condition A**: Spawns new Phase 1 instances for Subsystems.
    - **Condition B**: If all blocks are 'Primitive', proceeds to final Time-Series Simulation.

---

## Summary for Developers

This specification defines a 14-step pipeline for model synthesis. 

> [!NOTE]
> The balance is exactly 50/50: **7 LLM-driven semantic steps** and **7 deterministic steps** (3 Node.js orchestration steps + 4 WASM compute steps). 

### How to Use This Blueprint
1.  **API Endpoints**: Implement 14 distinct handlers corresponding to the steps above.
2.  **State Management**: Use the *Dependencies* list to define the necessary data payload for each transition.
3.  **Recursive Logic**: Step 4.4 is the global controller; it determines whether the engine descends deeper into the hierarchy or finishes the model.