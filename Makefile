# MDK — root Makefile
# Separates native C builds (host) from TypeScript/WASM builds (container).
#
# Native targets  (cmake-*):  run directly on the host using clang/CMake.
# Container targets (build/test/typecheck/wasm):  run inside the Apple
#   Container image — npm and emcmake are never required on the host.

# --------------------------------------------------
# Configuration
# --------------------------------------------------
CONTAINER_BIN := container
IMAGE_MDK     := mdk-dev
WORKDIR       := /app

SIM_KERNEL    := packages/sim-kernel
BUILD_NATIVE  := $(SIM_KERNEL)/build
BUILD_WASM    := $(SIM_KERNEL)/build-wasm

# Parallelism: use all logical CPUs (macOS/Linux portable)
JOBS := $(shell sysctl -n hw.logicalcpu 2>/dev/null || nproc 2>/dev/null || echo 4)

# Non-interactive batch run (build/test/typecheck) — no TTY allocation
RUN := $(CONTAINER_BIN) run --init --rm \
	-v "$(PWD):$(WORKDIR)" \
	-w $(WORKDIR) \
	$(IMAGE_MDK)

# Interactive run — allocates a pseudo-TTY (shell target only)
RUN_IT := $(CONTAINER_BIN) run -it --init --rm \
	-v "$(PWD):$(WORKDIR)" \
	-w $(WORKDIR) \
	$(IMAGE_MDK)

.PHONY: all help \
	start stop image \
	cmake-configure cmake-build cmake-test cmake-clean \
	wasm wasm-clean \
	npm-install build test typecheck \
	dia-build dia-dev \
	shell mdk mcp-server mcp-server-http demo example odum clean

# --------------------------------------------------
# Default
# --------------------------------------------------
all: cmake-test ## Default: build and test the C sim-kernel natively

# --------------------------------------------------
# Help
# --------------------------------------------------
help: ## Show available make targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  %-22s %s\n", $$1, $$2}'

# --------------------------------------------------
# Apple Container system service
# --------------------------------------------------
start: ## Start the Apple Container system service (required once per macOS session)
	$(CONTAINER_BIN) system start

# --------------------------------------------------
# Stop running containers
# --------------------------------------------------
stop: ## Stop any running MDK containers (clears port conflicts on 3000/3001/5173)
	-$(CONTAINER_BIN) list | grep $(IMAGE_MDK) | awk '{print $$1}' | xargs -r $(CONTAINER_BIN) stop

# --------------------------------------------------
# Container image
# --------------------------------------------------
image: start ## Build the MDK dev container image (Node 25)
	$(CONTAINER_BIN) build -t $(IMAGE_MDK) -f Containerfile .

# --------------------------------------------------
# C sim-kernel — native (host clang + CMake)
# --------------------------------------------------
cmake-configure: ## Configure sim-kernel for native Debug build
	cmake -S $(SIM_KERNEL) -B $(BUILD_NATIVE) \
		-DCMAKE_BUILD_TYPE=Debug \
		-DCMAKE_C_COMPILER=clang

cmake-build: cmake-configure ## Compile sim-kernel C libraries and test runners
	cmake --build $(BUILD_NATIVE) -j$(JOBS)

cmake-test: cmake-build ## Run full CTest suite (all 9 tests)
	ctest --test-dir $(BUILD_NATIVE) --output-on-failure

cmake-clean: ## Remove native build directory
	rm -rf $(BUILD_NATIVE)

# --------------------------------------------------
# WASM — Emscripten (inside the official emsdk container)
# --------------------------------------------------
dia-build: image npm-install ## Build @mdk/dia web component bundle (Vite)
	$(RUN) sh -c 'npm run build -w @mdk/dia'

dia-dev: image npm-install ## Run @mdk/dia Vite dev server
	$(CONTAINER_BIN) run -it --init --rm \
		-v "$(PWD):$(WORKDIR)" \
		-w $(WORKDIR)/packages/dia \
		-p 5173:5173 \
		$(IMAGE_MDK) sh -c 'npx vite --host'

wasm: start ## Build sim_kernel.wasm via Emscripten
	$(CONTAINER_BIN) run -i --rm \
		-v "$(PWD):$(WORKDIR)" \
		-w $(WORKDIR)/$(SIM_KERNEL) \
		emscripten/emsdk \
		sh -c 'emcmake cmake -B build-wasm -DCMAKE_BUILD_TYPE=Release \
		       && cmake --build build-wasm -j$(JOBS)'

wasm-clean: ## Remove WASM build directory
	rm -rf $(BUILD_WASM)

# --------------------------------------------------
# TypeScript — all commands run inside the MDK container
# --------------------------------------------------
npm-install: image ## Install npm workspace dependencies
	$(RUN) sh -c 'npm install'

build: image npm-install ## Build all TypeScript packages (tsc)
	$(RUN) sh -c 'NODE_OPTIONS="--max-old-space-size=4096" npm run build --workspaces --if-present'

test: image ## Run TypeScript unit tests (installs deps and pre-builds @mdk/core first)
	$(RUN) sh -c 'npm install && npm run build -w @mdk/core && NODE_OPTIONS="--max-old-space-size=4096" npm test --workspaces --if-present'

typecheck: image ## Type-check all TypeScript packages (installs deps and pre-builds @mdk/core first)
	$(RUN) sh -c 'npm install && npm run build -w @mdk/core && NODE_OPTIONS="--max-old-space-size=4096" npm run typecheck --workspaces --if-present'

# --------------------------------------------------
# Utilities
# --------------------------------------------------
shell: image ## Open a bash shell inside the MDK container
	$(RUN_IT) --entrypoint /bin/sh

mdk: build ## Run mdk CLI in the container (usage: make mdk ARGS="package validate packages/maxon-re40")
	$(RUN) sh -c 'node packages/cli/dist/index.js $(ARGS)'

mcp-server: build ## Run MDK MCP server locally via stdio (usage: make mcp-server)
	$(RUN) sh -c 'node packages/mcp-server/dist/index.js --transport stdio'

mcp-server-http: build ## Run MDK MCP server on HTTP for local testing (PORT=3001)
	$(CONTAINER_BIN) run -it --init --rm \
		-v "$(PWD):$(WORKDIR)" \
		-w $(WORKDIR) \
		-p 3001:3001 \
		$(IMAGE_MDK) sh -c 'node packages/mcp-server/dist/index.js --transport http'

demo: stop build ## Run MDK DSEE demo on http://localhost:3000 (requires GEMINI_API_KEY)
	$(CONTAINER_BIN) run --init --rm \
		-v "$(PWD):$(WORKDIR)" \
		-w $(WORKDIR) \
		-p 3000:3000 \
		-e GEMINI_API_KEY \
		-e ANTHROPIC_API_KEY \
		$(IMAGE_MDK) sh -c 'node examples/dsee-demo/dist/server.js'

example: start ## Build and run examples/demo.ts (Bond Graph RC + hydraulic pipe)
	$(RUN) sh -c 'node examples/dist/demo.js'

odum: start ## Build and run examples/odum-store.ts (Odum ESL soil water store)
	$(RUN) sh -c 'node examples/dist/odum-store.js'

clean: start cmake-clean wasm-clean ## Remove all build artefacts
	$(RUN) sh -c 'npm run clean --workspaces --if-present 2>/dev/null; \
	              find . -name "dist" -not -path "*/node_modules/*" | xargs rm -rf'
