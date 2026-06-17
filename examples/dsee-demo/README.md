# MDK DSEE Demo

This is a full implementation of the **Deterministic Systems Engineering Engine (DSEE)** orchestration pipeline.
It demonstrates the 14-step process defined in `docs/CONTEXT_ASSEMBLY.md`, specifically focused on the **Socratic Loop** and **WASM-accelerated simulation**.

## Features

- **Socratic Loop**: If physical parameters are missing from the user's description, the system halts and asks the user for the values before proceeding.
- **SysML → Bond Graph**: Automatic transpilation of high-level SysML structural models to physical Bond Graphs.
- **Parallel Simulation**: Runs both TDC (RK4) and IDC (log-Euler) simulations in parallel in the WASM kernel.
- **Diagram Generation**: Renders Mermaid diagrams of the resulting models.
- **Emergy Analysis**: Performs ecological/economic quality analysis for relevant systems.

## Running Locally

```bash
make demo GEMINI_API_KEY=your_key_here
```

Then visit `http://localhost:3000`.
