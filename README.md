# MDK — Model-Based Systems Engineering Framework

MDK is an open-source MBSE (Model-Based Systems Engineering) framework that treats mechatronic systems as code. It uses **Bond Graph** theory and **Odum ESL** (Energy Systems Language) to describe physical systems in TypeScript constructs that synthesise down to validated specifications, which are then simulated by a C/WebAssembly kernel.

The design follows the AWS CDK pattern: write high-level constructs in TypeScript, synthesise to a validated model, simulate with a C engine.

---

## Key Features

- **Physical linting** — the SCAP (Sequential Causality Assignment Procedure) algorithm catches physical paradoxes at compile time, not runtime
- **Dual-domain simulation** — Bond Graph (mechanical, electrical, hydraulic, thermal) and Odum ESL (ecological energy flows) in a single unified kernel
- **State-space extraction** — automatically derives A/B/C/D matrices from Bond Graph topology for control design
- **Euler/RK4 simulation** — time-domain simulation of Bond Graph and Odum ESL models
- **Cross-platform output** — export to C firmware, Python/SciPy scripts, or MATLAB/Simulink
- **CDK-style constructs** — compose systems from reusable TypeScript components

---

## Architecture

```
TypeScript constructs  →  JSON Schema (mdk.schema.json)  →  C/WASM kernel
   (@mdk/core)               (validated by Zod)             (sim-kernel)
```

### Packages

| Package | Description |
|---|---|
| `packages/sim-kernel` | C/WebAssembly simulation engine (Bond Graph + Odum ESL) |
| `packages/core` | TypeScript constructs, Zod schemas, WASM bridge |
| `packages/cli` | `mdk` CLI — synth, validate, firmware, scipy, simulink, registry |
| `packages/dia` | `<mdk-dia>` web component — drag-and-drop Bond Graph / Odum ESL editor |
| `packages/vscode-plugin` | TypeScript Language Server plugin (hover docs + diagnostics) |
| `packages/vscode` | VSCode extension with diagram panel and Problems integration |
| `packages/provider-aws` | AWS CDK provider for MDK stacks |
| `packages/vendor-spec` | JSON Schema for `@mdk/*` vendor packages |

---

## Prerequisites

### Apple Container CLI

This project uses [Apple Container CLI](https://github.com/apple/container) (`container`), not Docker or Podman. It must be on your `$PATH`.

All TypeScript/WASM builds run inside the container. Native C builds run directly on the host using clang/CMake.

### Host tools required

- macOS with Apple Container CLI installed
- clang + CMake (for native C sim-kernel builds)
- GNU Make

---

## Getting Started

```bash
# 1. Start the Apple Container system service (once per macOS session)
container system start

# 2. Build the MDK dev container image
make image

# 3. Install npm workspace dependencies
make npm-install

# 4. Build and test the C sim-kernel (runs natively on host)
make cmake-test

# 5. Build all TypeScript packages
make build

# 6. Run TypeScript unit tests
make test
```

---

## Make Targets

| Target | What it does | Where |
|---|---|---|
| `make` / `make all` | Build + test C sim-kernel | Host (clang) |
| `make cmake-test` | Run full CTest suite | Host |
| `make wasm` | Build `sim_kernel.wasm` via Emscripten | emsdk container |
| `make image` | Build `mdk-dev` container image (Node 25) | Host |
| `make npm-install` | Install all workspace dependencies | Container |
| `make build` | Compile all TypeScript packages | Container |
| `make test` | Run Vitest unit tests | Container |
| `make typecheck` | TypeScript type-check (no emit) | Container |
| `make dia-build` | Build `@mdk/dia` Vite bundle | Container |
| `make dia-dev` | Run Vite dev server for `@mdk/dia` on port 5173 | Container |
| `make demo` | Run DSEE demo server on http://localhost:3000 | Container |
| `make mcp-server-http` | Run MDK MCP server on port 3001 | Container |
| `make shell` | Interactive bash shell inside container | Container |
| `make stop` | Stop any running MDK containers | Host |
| `make clean` | Remove all build artefacts | Host + Container |

---

## Bond Graph Basics

Bond Graphs model power flow through a system. Each **bond** carries an effort–flow pair (e.g. voltage–current, force–velocity, pressure–flow rate).

**Elements:**

| Symbol | Name | Stores |
|---|---|---|
| `R` | Resistor (dissipator) | — |
| `C` | Capacitor | charge `q` |
| `I` | Inertia | momentum `p` |
| `Se` | Effort source | — |
| `Sf` | Flow source | — |
| `TF` | Transformer | — |
| `GY` | Gyrator | — |
| `J0` | 0-junction (equal effort) | — |
| `J1` | 1-junction (equal flow) | — |

SCAP assigns causality deterministically; the kernel reports a causality error if the model is physically inconsistent.

---

## Odum ESL Basics

Odum's Energy Systems Language models ecological and energy flows. Nodes are `storage`, `source`, `sink`, or `constant`; edges carry flows with logic types: `constant`, `linear`, `interaction`, `limit`, `threshold`.

---

## JSON Schema

Both domains share a unified schema at `packages/sim-kernel/schema/mdk.schema.json` (JSON Schema draft-07), discriminated by the `domain` field:

```jsonc
// Bond Graph
{ "schemaVersion": "1.0", "domain": "bondgraph", "elements": [...], "bonds": [...] }

// Odum ESL
{ "schemaVersion": "1.0", "domain": "odum-esl", "nodes": [...], "edges": [...] }
```

---

## CLI

```bash
# Validate a model file
mdk validate model.mdk.json

# Synthesise a TypeScript construct to JSON
mdk synth MySystem

# Generate C firmware from a Bond Graph state-space
mdk firmware model.mdk.json

# Generate a Python/SciPy simulation script
mdk scipy model.mdk.json

# Generate a MATLAB/Simulink script
mdk simulink model.mdk.json

# Package registry
mdk search <query>
mdk add <package>
```

---

## License

Apache-2.0
