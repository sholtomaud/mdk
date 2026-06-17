# MDK V-Model — Deterministic Systems Engineering




The **MDK V-Model** maps the classical Systems Engineering "V" onto the agentic and deterministic tools provided by the framework. It bridges the gap between high-level requirements (SysML) and low-level physical realization (Bond Graphs), ensuring bidirectional traceability and automated verification.

```mermaid
graph TD
    subgraph "Decomposition (Left Side)"
        REQ["User Requirements<br/>(Natural Language)"]
        SYS["System Architecture<br/>(SysML v2)"]
        LOG["Logical Design<br/>(Refined Blocks)"]
    end

    subgraph "Realization (Bottom)"
        PHY["Physical Implementation<br/>(Bond Graphs / Odum ESL)"]
    end

    subgraph "Integration & Verification (Right Side)"
        UNIT["Component Validation<br/>(SCAP Causality)"]
        SUBS["Sub-system Simulation<br/>(TDC / IDC)"]
        VERI["System Verification<br/>(Emergy / AHP / LCC)"]
    end

    %% Downward Flow
    REQ -->|create-project| SYS
    SYS -->|create-block| LOG
    LOG -->|refine-block| PHY

    %% Bottom Loop
    PHY <-->|NEAT Evolution| PHY

    %% Upward Flow
    PHY -->|validate-model| UNIT
    UNIT -->|run-simulation| SUBS
    SUBS -->|compute-emergy| VERI

    %% Traceability Links
    REQ -.->|Validation| VERI
    SYS -.->|Verification| SUBS
    LOG -.->|Consistency| UNIT
```

## 1. Requirements & System Architecture (The Top Left)
- **Tool**: `create_project`, `create_block`
- **Representation**: SysML v2 (Structural subset)
- **Action**: The LLM (Gemini) translates the user's intent into a formal decomposition of Parts and Ports. This defines the *Logical Architecture*.

## 2. Logical Design & Refinement
- **Tool**: `refine_block`
- **Action**: Each SysML block is mapped to a Bond Graph topology. This is where physical parameters (Mass, Stiffness, Resistance) are first assigned.

## 3. Physical Implementation (The Vertex)
- **Tool**: `transpile_sysml`
- **Representation**: Bond Graph Model (JSON)
- **Innovation**: The **NEAT Evolutionary Engine** (T10.1) can be used here to automatically discover optimal topologies that satisfy the performance requirements defined at the higher levels.

## 4. Component Validation (Unit Testing)
- **Tool**: `validate_model` (SCAP Algorithm)
- **Check**: Verifies physical consistency. If a model has causality conflicts (e.g., two flow sources fighting for the same junction), the "linter" catches it here before simulation.

## 5. Sub-system Simulation (Integration Testing)
- **Tool**: `run_simulation` (TDC/IDC)
- **Check**: Solves the state-space equations. We verify that the time-domain behavior (settling time, overshoot) matches the constraints derived from the System Architecture.

## 6. System Verification (The Top Right)
- **Tool**: `compute_emergy`, `generate_bom`
- **Check**: Final verification of non-functional requirements.
    - **Procurement**: Does the BOM match the budget?
    - **Sustainability**: Does the Emergy/Transformity analysis satisfy environmental constraints?
    - **Decision Support**: Does the final design satisfy the user's initial requirements?
