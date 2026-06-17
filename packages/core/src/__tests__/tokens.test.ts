import { describe, it, expect, beforeEach } from 'vitest';
import { Element, PowerBond } from '../elements/base.js';
import { Se, R, C } from '../elements/primitives.js';
import { MdkSystem, MdkStack } from '../system/app.js';
import { BondGraphModel } from '../schema/bondgraph.js';
import {
  Token,
  ProcurementToken,
  Lazy,
  TokenResolver,
  TokenResolutionError,
  MapResolutionContext,
  tokenKey,
  collectUnresolvedTokens,
} from '../system/token.js';

beforeEach(() => {
  Element.resetIds();
  PowerBond.resetIds();
});

/* ── Token.asNumber / asString ───────────────────────────────────── */

describe('Token.asNumber()', () => {
  it('produces a ${Token[...]} placeholder string', () => {
    const t = Token.asNumber('motor resistance');
    expect(typeof t).toBe('string');
    expect(t).toMatch(/^\$\{Token\[n_[0-9a-f-]+\]\}$/);
  });

  it('each call produces a unique token', () => {
    const a = Token.asNumber();
    const b = Token.asNumber();
    expect(a).not.toBe(b);
  });
});

describe('Token.asString()', () => {
  it('produces a ${Token[...]} placeholder string', () => {
    const t = Token.asString('device ARN');
    expect(typeof t).toBe('string');
    expect(t).toMatch(/^\$\{Token\[s_[0-9a-f-]+\]\}$/);
  });
});

describe('Token.isToken()', () => {
  it('returns true for a valid placeholder', () => {
    const t = Token.asNumber();
    expect(Token.isToken(t)).toBe(true);
  });

  it('returns false for a plain number', () => {
    expect(Token.isToken(42)).toBe(false);
  });

  it('returns false for a plain string', () => {
    expect(Token.isToken('hello')).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(Token.isToken(null)).toBe(false);
    expect(Token.isToken(undefined)).toBe(false);
  });
});

/* ── tokenKey() ──────────────────────────────────────────────────── */

describe('tokenKey()', () => {
  it('extracts the key from a valid placeholder', () => {
    const t = Token.asNumber();
    const key = tokenKey(t);
    expect(key).toBeTruthy();
    expect(key).toMatch(/^n_[0-9a-f-]+$/);
  });

  it('returns null for a plain string', () => {
    expect(tokenKey('hello')).toBeNull();
  });
});

/* ── ProcurementToken ────────────────────────────────────────────── */

describe('ProcurementToken.pending()', () => {
  it('produces a token placeholder', () => {
    const t = ProcurementToken.pending('Maxon RE-40 winding resistance', 'SKU-9921-X');
    expect(Token.isToken(t)).toBe(true);
    expect(t).toMatch(/^\$\{Token\[proc_/);
  });
});

/* ── MapResolutionContext ─────────────────────────────────────────── */

describe('MapResolutionContext', () => {
  it('resolves registered number values', () => {
    const ctx = new MapResolutionContext({ myKey: 4.7 });
    expect(ctx.resolve('myKey')).toBe(4.7);
  });

  it('resolves registered string values', () => {
    const ctx = new MapResolutionContext({ myKey: 'arn:aws:iot:us-east-1:123:thing/Motor1' });
    expect(ctx.resolve('myKey')).toBe('arn:aws:iot:us-east-1:123:thing/Motor1');
  });

  it('returns undefined for unknown keys', () => {
    const ctx = new MapResolutionContext();
    expect(ctx.resolve('unknown')).toBeUndefined();
  });

  it('.set() registers a value chainably', () => {
    const ctx = new MapResolutionContext();
    ctx.set('R1', 100);
    expect(ctx.resolve('R1')).toBe(100);
  });
});

/* ── Lazy ────────────────────────────────────────────────────────── */

describe('Lazy.numberValue()', () => {
  it('is resolved at resolution time, not creation time', () => {
    let callCount = 0;
    const t = Lazy.numberValue(() => { callCount++; return 3.14; }, 'pi approx');
    expect(callCount).toBe(0); // NOT called yet

    const key = tokenKey(t)!;
    const ctx = new MapResolutionContext();
    const resolved = ctx.resolve(key);

    expect(callCount).toBe(1);
    expect(resolved).toBe(3.14);
  });
});

/* ── collectUnresolvedTokens ─────────────────────────────────────── */

describe('collectUnresolvedTokens()', () => {
  it('finds tokens nested in a BG model object', () => {
    const t1 = Token.asNumber();
    const t2 = Token.asString();
    const model = {
      domain: 'bondgraph',
      elements: [
        { id: 0, name: 'R1', type: 'R', parameter: t1 },
        { id: 1, name: 'Se', type: 'Se', parameter: 5.0, externalId: t2 },
      ],
      bonds: [],
    };
    const keys = collectUnresolvedTokens(model);
    expect(keys).toHaveLength(2);
    expect(keys).toContain(tokenKey(t1));
    expect(keys).toContain(tokenKey(t2));
  });

  it('returns empty array when no tokens present', () => {
    const model = {
      domain: 'bondgraph',
      elements: [{ id: 0, name: 'R1', type: 'R', parameter: 100 }],
      bonds: [],
    };
    expect(collectUnresolvedTokens(model)).toHaveLength(0);
  });
});

/* ── TokenResolver ───────────────────────────────────────────────── */

describe('TokenResolver', () => {
  it('replaces a number token with a resolved number', () => {
    const t = Token.asNumber('resistance');
    const key = tokenKey(t)!;
    const ctx = new MapResolutionContext({ [key]: 47.0 });
    const resolver = new TokenResolver(ctx);

    const model = {
      domain: 'bondgraph' as const,
      elements: [{ id: 0, name: 'R1', type: 'R' as const, parameter: t }],
      bonds: [],
    };

    const resolved = resolver.resolve(model);
    expect(resolved.elements[0].parameter).toBe(47.0);
    expect(typeof resolved.elements[0].parameter).toBe('number');
  });

  it('replaces a string token with a resolved string (externalId)', () => {
    const t = Token.asString('ARN');
    const key = tokenKey(t)!;
    const ctx = new MapResolutionContext({ [key]: 'arn:aws:iot:us-east-1:123:thing/Motor1' });
    const resolver = new TokenResolver(ctx);

    const obj = { externalId: t, name: 'Motor1' };
    const resolved = resolver.resolve(obj);
    expect((resolved as typeof obj).externalId).toBe('arn:aws:iot:us-east-1:123:thing/Motor1');
  });

  it('throws TokenResolutionError for unresolved tokens', () => {
    const t = Token.asNumber('unknown param');
    const ctx = new MapResolutionContext(); // empty — cannot resolve
    const resolver = new TokenResolver(ctx);

    expect(() => resolver.resolve({ parameter: t })).toThrow(TokenResolutionError);
  });

  it('TokenResolutionError.unresolvedKeys lists the missing keys', () => {
    const t = Token.asNumber('missing value');
    const key = tokenKey(t)!;
    const ctx = new MapResolutionContext();
    const resolver = new TokenResolver(ctx);

    let caught: TokenResolutionError | null = null;
    try {
      resolver.resolve({ parameter: t });
    } catch (e) {
      caught = e as TokenResolutionError;
    }

    expect(caught).toBeInstanceOf(TokenResolutionError);
    expect(caught!.unresolvedKeys).toContain(key);
  });

  it('resolves deeply nested token in a full BG model', () => {
    const tR = Token.asNumber('winding resistance Ra');
    const keyR = tokenKey(tR)!;
    const ctx = new MapResolutionContext({ [keyR]: 4.7 });
    const resolver = new TokenResolver(ctx);

    const model = {
      schemaVersion: '1.0',
      domain: 'bondgraph' as const,
      elements: [
        { id: 0, name: 'Se', type: 'Se' as const, parameter: 12.0 },
        { id: 1, name: 'Ra', type: 'R' as const, parameter: tR },
      ],
      bonds: [{ id: 0, source: 0, target: 1 }],
    };

    const resolved = resolver.resolve(model);
    expect(resolved.elements[1].parameter).toBe(4.7);
    // Confirm it parses as valid BondGraphModel
    expect(BondGraphModel.safeParse(resolved).success).toBe(true);
  });
});

/* ── MdkSystem.resolve() ─────────────────────────────────────────── */

describe('MdkSystem.resolve()', () => {
  it('returns a numeric model ready for the kernel', () => {
    const t = Token.asNumber('capacitance C1');
    const key = tokenKey(t)!;

    const se = new Se('Vsrc', { parameter: 12.0 });
    const cap = new C('C1', { parameter: t as unknown as number });
    se.bond(cap);

    const sys = new MdkSystem('RC');
    sys.add(se, cap);

    const ctx = new MapResolutionContext({ [key]: 0.001 });
    const model = sys.resolve(ctx);

    expect(model.elements[1].parameter).toBe(0.001);
    expect(typeof model.elements[1].parameter).toBe('number');
    expect(BondGraphModel.safeParse(model).success).toBe(true);
  });

  it('throws TokenResolutionError if a token is not in the context', () => {
    const t = Token.asNumber('unknown R');

    const se = new Se('Vsrc', { parameter: 5.0 });
    const r = new R('Ra', { parameter: t as unknown as number });
    se.bond(r);

    const sys = new MdkSystem('test');
    sys.add(se, r);

    const ctx = new MapResolutionContext(); // empty
    expect(() => sys.resolve(ctx)).toThrow(TokenResolutionError);
  });
});

/* ── MdkStack.exportBOM() ────────────────────────────────────────── */

describe('MdkStack.exportBOM()', () => {
  it('marks elements with unresolved tokens as isPending:true', () => {
    const t = ProcurementToken.pending('Maxon RE-40', 'SKU-9921-X');

    const se = new Se('Vsrc', { parameter: 12.0 });
    const r  = new R('Ra', { parameter: t as unknown as number });
    se.bond(r);

    const sys = new MdkSystem('MotorDrive');
    sys.add(se, r);

    const stack = new MdkStack('DriveStack');
    stack.addSystem(sys);

    const bom = stack.exportBOM();
    expect(bom).toHaveLength(2);

    const pending = bom.find(e => e.elementName === 'Ra');
    expect(pending?.isPending).toBe(true);

    const concrete = bom.find(e => e.elementName === 'Vsrc');
    expect(concrete?.isPending).toBe(false);
    expect(concrete?.parameter).toBe(12.0);
  });

  it('returns empty array for an empty stack', () => {
    const stack = new MdkStack('Empty');
    expect(stack.exportBOM()).toEqual([]);
  });
});
