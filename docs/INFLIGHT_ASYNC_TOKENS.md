# MDK Tokens & Inflight Resolution

## Concept

This plan implements a **Token and Inflight Resolution** system in MDK, modeled after AWS CDK and Winglang patterns. This allows model parameters (like ARNs, hardware IDs, or computed values) to remain as placeholders during synthesis and be resolved asynchronously just before simulation or deployment.

## Design Principles

### 1. Tokens for Synthesis
Currently, the MDK simulation kernel expects absolute numeric values for physical parameters. By introducing `Token` objects, we allow elements like `DCMotor`, `Se`, or `Sf` to accept values that aren't known until "deployment" (e.g., the actual resistance of a motor measured by a calibration tool, or the ARN of a cloud-connected sensor).

### 2. Inflight Resolution
While "inflight" usually refers to runtime code, in MDK it serves as the mechanism for **asynchronous resolution**. An "inflight" resolver can query external state (AWS IoT, Hydstra API) to turn a Token into a concrete value (number or string) at the moment of simulation.

### 3. The "Executable Business" Pattern
The MDK System Oracle treats the mechatronic system and the business logic as a unified graph. Using Tokens, we represent "Inflight Procurement" where a component in the model is a placeholder for a real-world purchase task.

| Concept | Description |
| :--- | :--- |
| **ProcurementToken** | A specialized Token representing a component in the "Order/Shipping" phase. The parameter (e.g., $R_a$) is unresolved until the Purchases Agent provides actual datasheet values of the unit shipped. |
| **BOM Persistence** | The system design is persisted in a `ModelAssembly` database (DynamoDB). Each version of the `.mdk.json` is linked to a Bill of Materials (BOM) with commercial metadata (lead times, SKUs). |
| **Oracle Monitoring** | The Oracle runs the `CDKd` loop, comparing the simulation (As-Designed) with CloudWatch/IoT telemetry (As-Built). |
| **Purchases Agent** | An MCP-based agent that receives "Purchasing Tasks" from the Oracle, finds the distributor via `mdk research`, and executes procurement. |

## The System Identity Model (Dual-ID)

To handle vendor-specific IDs (ARNs, stock numbers) without breaking graph connectivity, MDK uses a dual-identity approach:

| Field | Purpose | Format | Stability |
| :--- | :--- | :--- | :--- |
| **`@id`** | **Model Identity**. Used for internal wiring and union-find merges. | UUID | **Permanent** |
| **`externalId`** | **Deployment Identity**. Linked to the real world (ARN, Serial, SKU). | String / Token | **Dynamic** |
| **`metadata`** | **Commercial Data**. Used for BOMs and Purchases Agent. | Record | **Informational** |

### Example SysML JSON
```json
{
  "@type": "PartUsage",
  "@id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "PrimaryPump",
  "externalId": "${Token[PumpArn]}", 
  "bgMapping": {
    "elementType": "Sf",
    "parameter": "${Token[TargetFlowRate]}"
  },
  "metadata": {
    "stockNumber": "SKU-9921-X",
    "vendor": "Maxon"
  }
}
```

## Agentic Workflow: "Predictive Procurement"

1.  **Divergence Detection**: The Oracle observes thermal drift in Motor `M1`. Simulation predicts failure in 48 hours.
2.  **Purchasing Task**: The Oracle emits a `ProcureTask` targeting the Purchases Agent, containing the `mdk-package.json` metadata for `M1`.
3.  **Token Creation**: A new `ProcurementToken` is injected into the "Next-Gen" branch of the model.
4.  **Agent Action**: The Purchases Agent identifies the SKU, confirms budget, and places the order.
5.  **Resolution**: Once the component arrives, the "Inflight" resolver updates the Token with the specific serial number and calibrated parameters, closing the loop.

---

## Implementation Plan

### 1. Schema Hardening

> [!IMPORTANT]
> This change modifies the core `BondGraphModel` and `OdumEslModel` schemas to allow `string` values for parameters that were previously strictly `number`.

#### SysML Schema
- Add `externalId: z.string().optional()` to `SysmlBase`.
- Add `metadata: z.record(z.unknown()).optional()` to `SysmlBase`.

#### Bond Graph Schema
- Add `externalId: z.string().optional()` to `BgElement`.
- Add `metadata: z.record(z.unknown()).optional()` to `BgElement`.
- Update `parameter` to `z.union([z.number(), z.string()])`.

### 2. Core Package (@mdk/core)

#### `token.ts` [NEW]
- Implement `Token` class for creating placeholders.
- Implement `Lazy` for deferred value calculation.
- Implement `TokenResolver` to walk the model and replace tokens with values from a `ResolutionContext`.
- Add `ProcurementToken` subclass.
- Add `InflightResolution` interface for agents to "check-in" values.

#### `app.ts` [MODIFY]
- Update `Element` constructor to accept `number | Token`.
- Add `MdkSystem.resolve(context: ResolutionContext)` to produce a numeric model for the kernel.
- Add `MdkStack.exportBOM()` for machine-readable procurement lists.
- Integrate `PersistenceProvider` to save model states to SQLite/DynamoDB.

#### `wasm-bridge.ts` [MODIFY]
- Add safety check in `runKernel`: if any parameters are still strings (unresolved tokens), throw a `TokenResolutionError` to prevent the C kernel from receiving invalid data.

#### `oracle.ts` [NEW]
- Implement basic `DivergenceMonitor` that triggers events when `sim_state` and `iot_state` drift apart.

---

## Security & Audit

> [!IMPORTANT]
> **Database Security**: To enable the Oracle to send purchasing requests, the MDK environment will require access to a Secrets Manager for distributor API keys.

> [!TIP]
> **Audit Trail**: This design ensures that every physical change to the system is preceded by a "Token Resolution" event, creating a perfect digital-to-physical audit trail.

---

## Verification Plan

### Automated Tests
- `vitest packages/core/src/__tests__/tokens.test.ts`:
  - Verify `Token.asNumber()` creates a valid placeholder string.
  - Verify `MdkSystem.synth()` preserves tokens in the JSON output.
  - Verify `MdkSystem.resolve()` correctly replaces tokens with numbers.
  - Verify `runKernel` fails on unresolved tokens.

### Manual Verification
- Run `mdk synth` on an example using a token (e.g., a "ServicePort" with a tokenized ID) and verify the `.mdk.json` contains the placeholder.
