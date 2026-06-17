# AGENTS.md — MDK

## Prerequisites — Apple Container CLI

This project uses **Apple Container CLI** (`container`), not Docker or Podman.
The `container` binary is a macOS-native container runtime. All Makefile targets
that run TypeScript/WASM builds use it.

**Before running any `make` target that involves a container, start the system service:**

```bash
container system start
```

This only needs to be run once per macOS session (it starts a background service).
If you see `XPC connection error: Connection invalid`, the service is not running — run the above command and retry.

The `container` binary must be on `$PATH`. If it is not found, install Apple Container CLI from
https://github.com/apple/container.

---

## Project Overview

**MDK** is an open-source Model-Based Systems Engineering (MBSE) framework
that treats mechatronic systems as code using **Bond Graph** theory and the
**Odum ESL** (Energy Systems Language) formalism. It follows the AWS CDK
pattern: users write TypeScript constructs that synthesise down to validated
physical-system specifications, which are then simulated by a C/WebAssembly
kernel.

The core innovation is a **C/WebAssembly simulation engine** that:
1. Acts as a "linter" — catching physical paradoxes at compile time via the SCAP
   causality algorithm.
2. Runs Euler/RK4 simulations of Bond Graph and Odum ESL models.
3. Extracts linear state-space matrices (A/B/C/D) from Bond Graph topology.

---

## Repository Structure

```
mdk/
├── Containerfile               # Node 25 Alpine image for TypeScript container builds
├── Makefile                    # Unified build interface (see Build Workflow below)
├── package.json                # npm workspaces root
├── AGENTS.md                   # This file
├── docs/
│   ├── TASKS.md                # Phased implementation backlog (live)
│   └── CONOPS_AND_DESIGN.md    # Architecture and design decisions
└── packages/
    ├── sim-kernel/             # C/WASM simulation engine (@mdk/sim-kernel)
    │   ├── src/domains/
    │   │   ├── bondgraph/      # Bond Graph domain (bondgraph.c, bg_solver.c, json_io.c, wasm_bridge.c)
    │   │   └── odum-esl/       # Odum ESL domain (gssk.c, advanced.c)
    │   ├── tests/
    │   │   ├── bondgraph/      # 23 unit tests (graph, SCAP, JSON, simulation, state-space)
    │   │   └── odum-esl/       # Regression tests + kernel integration test
    │   ├── schema/
    │   │   └── mdk.schema.json # Unified JSON Schema (draft-07, oneOf discriminated union)
    │   ├── vendor/cJSON/       # Vendored cJSON (MIT)
    │   └── CMakeLists.txt
    ├── core/                   # TypeScript constructs (@mdk/core)
    │   └── src/
    │       ├── schema/         # Zod validation schemas (BondGraphModel, OdumEslModel)
    │       ├── elements/       # L1 primitives + L2 composites + base classes
    │       ├── system/         # MdkApp, MdkStack, MdkSystem (CDK containers)
    │       └── kernel/         # Node.js WASM bridge (runKernel, validateBondGraph)
    ├── cli/                    # mdk CLI tool
    │   └── src/
    │       ├── commands/       # new.ts synth.ts validate.ts firmware.ts scipy.ts simulink.ts registry.ts
    │       └── index.ts        # Commander entry point (all commands wired)
    ├── vscode-plugin/          # @mdk/ts-plugin — TypeScript Language Server plugin (T5.2)
    │   └── src/index.ts        # hover docs + cross-domain bond diagnostic
    ├── vscode/                 # mdk-vscode VSCode extension (T5.3)
    │   └── src/
    │       ├── extension.ts        # Activation, commands, status bar
    │       ├── MdkDiagnosticProvider.ts  # Validates .mdk.json on save → Problems panel
    │       └── MdkDiagramPanel.ts  # Webview hosting <mdk-dia> (T6.3 bidirectional sync)
    ├── dia/                    # @mdk/dia diagram editor web component (T6.1–T6.3)
    │   └── src/
    │       ├── mdk-editor.js   # <mdk-dia> custom element (Bond Graph + Odum ESL)
    │       ├── symbols.js      # SVG symbol libraries for both domains
    │       ├── validator.js    # Inline model validator (no external deps)
    │       └── styles.css      # Editor CSS (light + dark theme)
    └── vendor-spec/            # JSON Schema for @mdk/* vendor packages (T3.1)
        └── mdk-vendor.schema.json
```

---

## Build Workflow

**All builds go through the root `Makefile`.** Do not invoke cmake, npm, tsc, or vitest
directly — always use `make <target>` to ensure the correct build environment is used.

```
┌──────────────────────────────────────────────────────────────┐
│  Host (macOS)          Container (Apple Container CLI)       │
│  ─────────────────     ──────────────────────────────────    │
│  make cmake-*          make npm-install / build / test       │
│    └─ clang/CMake        └─ Node 20 (mdk-dev image)          │
│                                                              │
│  make wasm               make shell                          │
│    └─ emscripten/emsdk     └─ interactive bash in container  │
└──────────────────────────────────────────────────────────────┘
```

### Quick reference

| Target | What it does | Where it runs |
|--------|-------------|---------------|
| `make` / `make all` | Build + test C sim-kernel | Host (clang) |
| `make cmake-configure` | `cmake -S … -B …` | Host |
| `make cmake-build` | Compile all C targets | Host |
| `make cmake-test` | Run full CTest suite (9 tests) | Host |
| `make cmake-clean` | Remove `packages/sim-kernel/build/` | Host |
| `make wasm` | Build `sim_kernel.wasm` via Emscripten | `emscripten/emsdk` container |
| `make wasm-clean` | Remove `packages/sim-kernel/build-wasm/` | Host |
| `container system start` | Start Apple Container system service (once per session) | Host |
| `make system-start` | Same as above via Make | Host |
| `make image` | Build `mdk-dev` container image (node:25-alpine) | Host |
| `make npm-install` | `npm install` across all workspaces | `mdk-dev` container |
| `make build` | `tsc -b` all TypeScript packages | `mdk-dev` container |
| `make test` | Run Vitest unit tests | `mdk-dev` container |
| `make typecheck` | TypeScript type-check (no emit) | `mdk-dev` container |
| `make dia-build` | Build `@mdk/dia` Vite bundle → `packages/dia/dist/` | `mdk-dev` container |
| `make dia-dev` | Run Vite dev server for `@mdk/dia` (port 5173) | `mdk-dev` container |
| `make shell` | Interactive shell inside container | `mdk-dev` container |
| `make clean` | Remove all build artefacts | Host + container |

### Start the container system service first

```bash
container system start   # start background service (once per macOS session)
make image               # build the mdk-dev image from Containerfile (Node 25)
```

`container system start` is idempotent — safe to run even if already running.
`make image` only needs to be re-run when the Containerfile changes.

### Typical dev cycle

```bash
# C sim-kernel (runs natively — no container needed)
make cmake-test          # configure + build + run all 9 CTests

# TypeScript packages (runs in container)
make npm-install         # first time only, or after adding a dependency
make build               # tsc all packages
make test                # vitest
make typecheck           # tsc --noEmit (no build output)

# WASM (Emscripten — separate pull of emscripten/emsdk image)
make wasm                # produces packages/sim-kernel/build-wasm/sim_kernel.js + .wasm
```

---

## Critical Conventions

### Bond Graph Terminology

- **Elements:** `Se` (Effort Source), `Sf` (Flow Source), `R`, `C`, `I`,
  `TF` (Transformer), `GY` (Gyrator), `J0` (0-junction), `J1` (1-junction)
- **Bonds:** Power connections (Effort × Flow); each end is `EFFORT_OUT` or `FLOW_OUT`
- **SCAP:** Sequential Causality Assignment Procedure — assigns causality deterministically
- **State variables:** `C` stores charge `q`; `I` stores momentum `p`
- **State-space:** `ẋ = Ax + Bu, y = Cx + Du` extracted by probe-column method in `bg_solver.c`

### Odum ESL Terminology

- **Node types:** `storage`, `source`, `sink`, `constant`
- **Edge logic types:** `constant`, `linear`, `interaction`, `limit`, `threshold`
- GSSK (General Systems Simulation Kernel) is the retired standalone repo; its engine now lives in `packages/sim-kernel/src/domains/odum-esl/`

### JSON Schema

The unified schema is at `packages/sim-kernel/schema/mdk.schema.json` (JSON Schema draft-07).
Both domains share the same top-level object via `oneOf` discriminated on the `domain` field.

```jsonc
// Bond Graph model
{ "schemaVersion": "1.0", "domain": "bondgraph", "elements": [...], "bonds": [...] }

// Odum ESL model (domain optional for legacy GSSK backward compat)
{ "domain": "odum-esl", "nodes": [...], "edges": [...] }
```

TypeScript counterparts (Zod) live in `packages/core/src/schema/`.

### C Engine Rules

- **Standard:** C11 (`-std=c11`)
- **Flags:** Always `-Wall -Wextra -Werror -pedantic`. No exceptions.
- **Memory:** Every `create_graph()` must have a matching `destroy_graph()`.
- **JSON I/O:** Uses vendored cJSON (MIT). WASM bridge accepts/returns JSON strings only.
- **State-space:** `bg_compute_state_space()` temporarily mutates Se/Sf `parameter_value`;
  caller must not use the graph concurrently (single-threaded only).
- **Public headers:** Do NOT change `bondgraph.h` or `bg_solver.h` API signatures without
  explicit approval — the TypeScript layer depends on the ABI.

### TypeScript Rules

- All TypeScript runs **inside the container** via `make build / test / typecheck`.
  Do not run `npm` or `tsc` directly on the host.
- `@mdk/core` Zod schemas are the single source of truth for validation on the
  TypeScript side; they must stay in sync with `mdk.schema.json`.
- `MdkSystem.synth()` re-maps element IDs to sequential integers before Zod parsing.
  Never assume object graph IDs equal JSON ids.
- `Element.resetIds()` and `PowerBond.resetIds()` must be called in `beforeEach` in
  every test that constructs elements.

---

## Key Files

| File | Purpose |
|------|---------|
| `docs/TASKS.md` | Phased backlog — check this before starting any task |
| `packages/sim-kernel/schema/mdk.schema.json` | Unified JSON Schema for both domains |
| `packages/sim-kernel/src/domains/bondgraph/bondgraph.h` | Core C API (the contract) |
| `packages/sim-kernel/src/domains/bondgraph/bg_solver.h` | Solver + state-space API |
| `packages/sim-kernel/src/domains/bondgraph/json_io.h` | JSON serialisation API |
| `packages/sim-kernel/src/domains/bondgraph/wasm_bridge.c` | WASM entry points (`sim_kernel_run`, `validate_bondgraph`) |
| `packages/sim-kernel/src/domains/odum-esl/gssk.h` | GSSK Odum ESL public API |
| `packages/core/src/schema/bondgraph.ts` | Zod schema — Bond Graph |
| `packages/core/src/schema/odum-esl.ts` | Zod schema — Odum ESL |
| `packages/core/src/elements/primitives.ts` | L1 TypeScript element classes |
| `packages/core/src/system/app.ts` | MdkApp / MdkStack / MdkSystem |
| `packages/core/src/kernel/wasm-bridge.ts` | Node.js WASM loader + `runKernel()` |
| `packages/cli/src/index.ts` | Commander entry point — all CLI commands wired |
| `packages/cli/src/commands/firmware.ts` | `mdk firmware` — C state-space code generator |
| `packages/cli/src/commands/scipy.ts` | `mdk scipy` — Python/SciPy script generator |
| `packages/cli/src/commands/simulink.ts` | `mdk simulink` — MATLAB/Simulink script generator |
| `packages/cli/src/commands/registry.ts` | `mdk search/add/remove/list/package` |
| `packages/vscode-plugin/src/index.ts` | TS language server plugin (hover docs + diagnostics) |
| `packages/vscode/src/extension.ts` | VSCode extension activation + commands |
| `packages/vscode/src/MdkDiagramPanel.ts` | Webview panel (bidirectional sync with *.mdk.json) |
| `packages/dia/src/mdk-editor.js` | `<mdk-dia>` web component (Bond Graph + Odum ESL) |
| `packages/vendor-spec/mdk-vendor.schema.json` | JSON Schema for @mdk/* vendor packages |
| `Makefile` | All build targets (see Build Workflow above) |

---

## Dependency Policy

**Do not add third-party runtime dependencies** unless the package is published and maintained by Google, Microsoft, or Amazon/AWS. Use Node.js built-in modules instead.

| Allowed | Rationale |
|---|---|
| `aws-cdk-lib`, `@aws-sdk/*` | AWS — first-party |
| `@google-cloud/*`, `firebase-*` | Google — first-party |
| `@azure/*` | Microsoft — first-party |
| Node.js builtins (`http`, `https`, `fs`, `path`, `crypto`, …) | No dependency at all |

| Not allowed (use native alternative) | Replace with |
|---|---|
| `express`, `fastify`, `hapi` | `node:http` / `node:https` |
| `axios`, `node-fetch`, `got` | `node:https.request` |
| `@anthropic-ai/sdk` | `node:https` POST to `api.anthropic.com` |
| `lodash`, `ramda` | native JS/TS |
| `moment`, `date-fns` | `Intl`, native `Date` |

**Dev-only tools** (compilers, test runners, type checkers) are exempt — `typescript`, `esbuild`, `vitest`, `vite` etc. are fine as `devDependencies`.

**Protocol/schema SDKs** that have no native equivalent (e.g. `@modelcontextprotocol/sdk`, `zod`) are acceptable when there is no reasonable built-in substitute.

---

## What NOT to Do

- Do not use `docker` or `podman` — this project uses Apple Container CLI (`container`)
- Do not run `cmake`, `npm`, `tsc`, or `vitest` directly on the host — use `make`
- Always run `container system start` before any `make` target that uses a container
- Do not add third-party runtime deps — see Dependency Policy above
- Do not add external C dependencies without vendoring them into `vendor/`
- Do not modify `bondgraph.h` or `bg_solver.h` API without approval
- Do not use floating-point equality in C tests — always use epsilon comparisons
- Do not commit `build/`, `build-wasm/`, `dist/`, or `node_modules/`
- Do not add `console.log` debug output to library code (`@mdk/core`) — CLI only
