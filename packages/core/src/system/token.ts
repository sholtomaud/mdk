/**
 * @mdk/core — Token & Inflight Resolution
 *
 * Implements the AWS CDK-style Token pattern for MDK. Allows model parameters
 * (physical values, ARNs, hardware serial numbers) to remain as string
 * placeholders during synthesis and be resolved to concrete values just before
 * simulation.
 *
 * Resolution chain:
 *   MdkSystem.synth() → preserves ${Token[...]} in JSON
 *   MdkSystem.resolve(ctx) → replaces tokens with values from ResolutionContext
 *   runKernel() → throws TokenResolutionError if any token remains
 */

import * as crypto from 'node:crypto';

/* ── Token encoding ────────────────────────────────────────────────── */

const TOKEN_MAP = new Map<string, TokenDefinition>();

interface TokenDefinition {
  key: string;
  description?: string;
  /** If set, the resolved value must be this type. */
  resolveAs: 'number' | 'string';
}

/**
 * Encodes a token key into the placeholder string format recognised by
 * TokenResolver. Format: `${Token[<key>]}`
 */
function encode(key: string): string {
  return `\${Token[${key}]}`;
}

/**
 * Returns the token key if the string is a token placeholder, or null
 * if it is a regular string.
 */
export function tokenKey(value: string): string | null {
  const m = /^\$\{Token\[([^\]]+)\]\}$/.exec(value);
  return m ? m[1] : null;
}

/* ── Token class ───────────────────────────────────────────────────── */

/**
 * A placeholder for a value that will be resolved at synthesis time.
 * Use `Token.asNumber()` for physical parameters (R, C, I values).
 * Use `Token.asString()` for external identifiers (ARNs, serials, SKUs).
 */
export class Token {
  protected constructor(
    public readonly key: string,
    public readonly resolveAs: 'number' | 'string',
    public readonly description?: string,
  ) {}

  /** Creates a Token that resolves to a number (for use as a physical parameter). */
  static asNumber(description?: string): string {
    const key = `n_${crypto.randomUUID()}`;
    TOKEN_MAP.set(key, { key, description, resolveAs: 'number' });
    return encode(key);
  }

  /** Creates a Token that resolves to a string (for use as an externalId, ARN, etc). */
  static asString(description?: string): string {
    const key = `s_${crypto.randomUUID()}`;
    TOKEN_MAP.set(key, { key, description, resolveAs: 'string' });
    return encode(key);
  }

  /** Returns the definition for a given key, if it was registered. */
  static getDefinition(key: string): TokenDefinition | undefined {
    return TOKEN_MAP.get(key);
  }

  /** Returns true if the value is an encoded token placeholder. */
  static isToken(value: unknown): value is string {
    return typeof value === 'string' && tokenKey(value) !== null;
  }
}

/* ── ProcurementToken ──────────────────────────────────────────────── */

/**
 * A specialised Token representing a physical component that is currently
 * in the "Order/Shipping" phase. Its numeric parameter (e.g. resistance R_a)
 * is unresolved until the Purchases Agent provides the calibrated datasheet
 * value of the specific unit shipped.
 *
 * Usage:
 *   const motor = new PartUsage({ parameter: ProcurementToken.pending('Maxon RE-40 R_a', 'SKU-9921-X') });
 */
export class ProcurementToken extends Token {
  /** Creates a number-resolving procurement token with BOM metadata. */
  static pending(description: string, sku?: string): string {
    const key = `proc_${crypto.randomUUID()}`;
    TOKEN_MAP.set(key, { key, description: `[PENDING DELIVERY] ${description}${sku ? ` (SKU: ${sku})` : ''}`, resolveAs: 'number' });
    return encode(key);
  }
}

/* ── Lazy ──────────────────────────────────────────────────────────── */

/**
 * A deferred value that is computed once at resolution time.
 * Use when the value is not known at model-definition time but can be
 * computed synchronously from available context (e.g. lookup a price from a
 * local catalogue, read a config value).
 */
export class Lazy {
  private constructor() {}

  static numberValue(producer: (ctx: ResolutionContext) => number, description?: string): string {
    const key = `lazy_n_${crypto.randomUUID()}`;
    LAZY_MAP.set(key, { producer: producer as (ctx: ResolutionContext) => number | string, description });
    TOKEN_MAP.set(key, { key, description, resolveAs: 'number' });
    return encode(key);
  }

  static stringValue(producer: (ctx: ResolutionContext) => string, description?: string): string {
    const key = `lazy_s_${crypto.randomUUID()}`;
    LAZY_MAP.set(key, { producer, description });
    TOKEN_MAP.set(key, { key, description, resolveAs: 'string' });
    return encode(key);
  }
}

const LAZY_MAP = new Map<string, { producer: (ctx: ResolutionContext) => number | string; description?: string }>();

/* ── ResolutionContext ──────────────────────────────────────────────── */

/**
 * Provides resolved values for tokens. Passed to MdkSystem.resolve() and to
 * Lazy producers.
 *
 * Keys are token keys (the content inside `${Token[<key>]}`).
 */
export interface ResolutionContext {
  /** Resolve a token key to its concrete value. Returns undefined if unknown. */
  resolve(key: string): number | string | undefined;
}

/**
 * A simple in-memory ResolutionContext backed by a plain Record.
 */
export class MapResolutionContext implements ResolutionContext {
  private readonly values: Map<string, number | string>;

  constructor(values: Record<string, number | string> = {}) {
    this.values = new Map(Object.entries(values));
  }

  resolve(key: string): number | string | undefined {
    // Check lazy producers first
    const lazy = LAZY_MAP.get(key);
    if (lazy) return lazy.producer(this);
    return this.values.get(key);
  }

  /** Register a resolved value for a token key. */
  set(key: string, value: number | string): this {
    this.values.set(key, value);
    return this;
  }
}

/* ── InflightResolution ─────────────────────────────────────────────── */

/**
 * Interface implemented by Purchases Agent and other external agents to
 * "check-in" resolved values for ProcurementTokens.
 *
 * When a component is delivered, the agent calls:
 *   inflight.checkIn(tokenKey, { serialNumber: 'SN-123', parameter: 4.7 })
 */
export interface InflightResolution {
  /** The token key that this resolution satisfies. */
  tokenKey: string;
  /** The resolved numeric value (e.g. measured resistance after calibration). */
  parameter?: number;
  /** The physical serial number or ARN of the deployed component. */
  externalId?: string;
  /** The distributor order ID for audit trail. */
  orderId?: string;
  /** ISO-8601 timestamp when the component was checked in. */
  resolvedAt: string;
}

/* ── TokenResolutionError ───────────────────────────────────────────── */

/**
 * Thrown by runKernel() if any element parameter is still an unresolved
 * token placeholder. The C kernel cannot accept string values.
 */
export class TokenResolutionError extends Error {
  constructor(public readonly unresolvedKeys: string[]) {
    super(
      `TokenResolutionError: ${unresolvedKeys.length} token(s) unresolved before kernel invocation.\n` +
      `Unresolved keys:\n${unresolvedKeys.map(k => `  - ${k} (${TOKEN_MAP.get(k)?.description ?? 'no description'})`).join('\n')}\n` +
      `Call MdkSystem.resolve(context) before runKernel().`,
    );
    this.name = 'TokenResolutionError';
  }
}

/* ── TokenResolver ──────────────────────────────────────────────────── */

/**
 * Walks a model JSON object and replaces all token placeholder strings
 * with their resolved values from the ResolutionContext.
 *
 * For number-typed tokens, the resolved value is coerced to a number.
 * For string-typed tokens, the resolved value is kept as a string.
 *
 * Throws TokenResolutionError if any token is still unresolved after the walk.
 */
export class TokenResolver {
  private readonly unresolved: string[] = [];

  constructor(private readonly ctx: ResolutionContext) {}

  resolve<T>(model: T): T {
    const result = this.walk(model);
    if (this.unresolved.length > 0) {
      throw new TokenResolutionError(this.unresolved);
    }
    return result as T;
  }

  private walk(value: unknown): unknown {
    if (typeof value === 'string') {
      const key = tokenKey(value);
      if (key === null) return value;

      const resolved = this.ctx.resolve(key);
      if (resolved === undefined) {
        this.unresolved.push(key);
        return value; // leave placeholder, will throw after full walk
      }

      const def = TOKEN_MAP.get(key);
      if (def?.resolveAs === 'number') {
        const n = Number(resolved);
        if (Number.isNaN(n)) {
          this.unresolved.push(key);
          return value;
        }
        return n;
      }
      return String(resolved);
    }

    if (Array.isArray(value)) return value.map(v => this.walk(v));

    if (value !== null && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = this.walk(v);
      }
      return out;
    }

    return value;
  }
}

/* ── collectUnresolvedTokens ────────────────────────────────────────── */

/**
 * Scans a model JSON for any remaining token placeholders without resolving
 * them. Used by runKernel() to produce a clean error before touching WASM.
 */
export function collectUnresolvedTokens(model: unknown): string[] {
  const keys: string[] = [];

  function walk(v: unknown): void {
    if (typeof v === 'string') {
      const k = tokenKey(v);
      if (k !== null) keys.push(k);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v !== null && typeof v === 'object') {
      Object.values(v as Record<string, unknown>).forEach(walk);
    }
  }

  walk(model);
  return keys;
}
