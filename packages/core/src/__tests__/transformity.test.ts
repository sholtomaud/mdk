/**
 * Emergy / transformity analysis tests.
 *
 * Academic basis:
 *   Odum, H.T. (1988). Self-organization, transformity and information.
 *   Science 242, 1132–1139.
 *
 * Emergy (Em)  = Transformity (τ) × Exergy (Ex)   [sej]
 * Transformity = quality of energy [sej/J]
 * Solar radiation: τ = 1 sej/J  (reference baseline)
 *
 * For a linear pathway:
 *   τ_out = Σ(τ_in_i × flow_in_i) / flow_out
 * → transformity amplifies up the trophic hierarchy.
 */

import { describe, it, expect } from 'vitest';
import { computeEmergy, emergyBalance } from '../emergy/transformity.js';
import type { TransformityInit } from '../emergy/transformity.js';
import type { OdumEslModel } from '../schema/odum-esl.js';

/* ── Fixture: linear food chain ──────────────────────────────────── */
/*
 *  Sun(source, τ=1) ──k=0.1──► Plant(storage, Q=100)
 *                               │
 *                           k=0.1
 *                               ▼
 *                          Herbivore(storage, Q=10)
 *                               │
 *                           k=0.1
 *                               ▼
 *                           Sink(sink)
 *
 * Steady-state flows:
 *   Sun→Plant:  flow = 0.1 × Q_sun = 0.1 × 1000 = 100  [J/time]  (source value=1000)
 *   Plant→Herb: flow = 0.1 × Q_plant = 0.1 × 100 = 10   [J/time]
 *   Herb→Sink:  flow = 0.1 × Q_herb  = 0.1 × 10  = 1    [J/time]
 *
 * Transformities (Odum donor-controlled):
 *   τ_plant = τ_sun × 100 / 100 = 1 × 1 = 1 sej/J   ← input equals throughput
 *   Actually τ_plant = τ_sun × Sun_flow / Plant_flow = 1 × 100/10 = 10 sej/J
 *   τ_herb  = τ_plant × Plant_flow / Herb_flow = 10 × 10/1 = 100 sej/J
 */
function foodChainModel(): OdumEslModel {
  return {
    domain: 'odum-esl',
    nodes: [
      { id: 'sun',  type: 'source',  value: 1000 },
      { id: 'plant', type: 'storage', value: 100 },
      { id: 'herb',  type: 'storage', value: 10 },
      { id: 'sink',  type: 'sink',    value: 0 },
    ],
    edges: [
      { id: 'e1', origin: 'sun',   target: 'plant', logic: 'linear', params: { k: 0.1 } },
      { id: 'e2', origin: 'plant', target: 'herb',  logic: 'linear', params: { k: 0.1 } },
      { id: 'e3', origin: 'herb',  target: 'sink',  logic: 'linear', params: { k: 0.1 } },
    ],
  };
}

const sunTransformity: TransformityInit[] = [
  { nodeId: 'sun', transformity: 1.0 },
];

/* ── Fixture: two-source co-production ───────────────────────────── */
/*
 * Rain(source, τ=18000) ──┐
 *                         ├──► Forest(storage, Q=500)
 * Sun(source,  τ=1)    ──┘
 *
 * Co-production rule (Odum): both inputs are needed; each output
 * carries the SUM of all input emergy flows. τ_forest = Σ Em_in / Q_forest
 */
function coProductionModel(): OdumEslModel {
  return {
    domain: 'odum-esl',
    nodes: [
      { id: 'sun',    type: 'source',  value: 1e6 },
      { id: 'rain',   type: 'source',  value: 200 },
      { id: 'forest', type: 'storage', value: 500 },
      { id: 'waste',  type: 'sink',    value: 0 },
    ],
    edges: [
      { id: 'e1', origin: 'sun',    target: 'forest', logic: 'linear', params: { k: 0.001 } },
      { id: 'e2', origin: 'rain',   target: 'forest', logic: 'linear', params: { k: 0.5 } },
      { id: 'e3', origin: 'forest', target: 'waste',  logic: 'linear', params: { k: 0.01 } },
    ],
  };
}

const coProductionSources: TransformityInit[] = [
  { nodeId: 'sun',  transformity: 1.0 },
  { nodeId: 'rain', transformity: 18000 },
];

/* ── Tests ───────────────────────────────────────────────────────── */

describe('computeEmergy()', () => {

  describe('return shape', () => {
    it('has nodeEmergy, nodeTransformity, flowEmergy, empower', () => {
      const r = computeEmergy(foodChainModel(), {}, sunTransformity);
      expect(r).toHaveProperty('nodeEmergy');
      expect(r).toHaveProperty('nodeTransformity');
      expect(r).toHaveProperty('flowEmergy');
      expect(r).toHaveProperty('empower');
    });

    it('has an entry for every node', () => {
      const r = computeEmergy(foodChainModel(), {}, sunTransformity);
      for (const id of ['sun', 'plant', 'herb', 'sink']) {
        expect(r.nodeTransformity).toHaveProperty(id);
      }
    });
  });

  describe('source transformity initialisation', () => {
    it('solar τ = 1 sej/J as provided', () => {
      const r = computeEmergy(foodChainModel(), {}, sunTransformity);
      expect(r.nodeTransformity.sun).toBe(1.0);
    });

    it('co-production: both source transformities set correctly', () => {
      const r = computeEmergy(coProductionModel(), {}, coProductionSources);
      expect(r.nodeTransformity.sun).toBe(1.0);
      expect(r.nodeTransformity.rain).toBe(18000);
    });
  });

  describe('transformity hierarchy (food chain)', () => {
    it('plant transformity > sun transformity', () => {
      const r = computeEmergy(foodChainModel(), {}, sunTransformity);
      expect(r.nodeTransformity.plant).toBeGreaterThan(r.nodeTransformity.sun);
    });

    it('herbivore transformity > plant transformity', () => {
      const r = computeEmergy(foodChainModel(), {}, sunTransformity);
      expect(r.nodeTransformity.herb).toBeGreaterThan(r.nodeTransformity.plant);
    });

    it('plant τ ≈ 10 sej/J (sun flow 100/plant flow 10)', () => {
      const r = computeEmergy(foodChainModel(), {}, sunTransformity);
      expect(r.nodeTransformity.plant).toBeCloseTo(10.0, 0);
    });

    it('herbivore τ ≈ 100 sej/J', () => {
      const r = computeEmergy(foodChainModel(), {}, sunTransformity);
      expect(r.nodeTransformity.herb).toBeCloseTo(100.0, 0);
    });
  });

  describe('flow emergy', () => {
    it('edge e1 emergy = τ_sun × flow_sun→plant', () => {
      const r = computeEmergy(foodChainModel(), {}, sunTransformity);
      // flow = k × Q_origin = 0.1 × 1000 = 100;  τ_sun = 1
      expect(r.flowEmergy['e1']).toBeCloseTo(100.0, 1);
    });

    it('edge e2 emergy = τ_plant × flow_plant→herb', () => {
      const r = computeEmergy(foodChainModel(), {}, sunTransformity);
      // flow = 0.1 × 100 = 10;  τ_plant ≈ 10
      expect(r.flowEmergy['e2']).toBeCloseTo(100.0, 0);
    });
  });

  describe('co-production: dominant input sets transformity', () => {
    it('rain dominates forest transformity (high τ × high flow)', () => {
      const r = computeEmergy(coProductionModel(), {}, coProductionSources);
      // Em_sun_flow  = 1 × 0.001 × 1e6 = 1000 sej/time
      // Em_rain_flow = 18000 × 0.5 × 200 = 1,800,000 sej/time
      // τ_forest = total_em_flow / forest_outflow = (1000+1800000) / (0.01×500) = huge
      expect(r.nodeTransformity.forest).toBeGreaterThan(18000);
    });
  });

  describe('state override', () => {
    it('respects provided currentState instead of model node values', () => {
      const state = { sun: 500, plant: 50, herb: 5, sink: 0 };
      const r = computeEmergy(foodChainModel(), state, sunTransformity);
      // flows scale with state; hierarchy should still hold
      expect(r.nodeTransformity.herb).toBeGreaterThan(r.nodeTransformity.plant);
    });
  });
});

describe('emergyBalance()', () => {
  it('returns total empower (sej/time)', () => {
    const bal = emergyBalance(foodChainModel(), {}, sunTransformity);
    expect(bal.totalEmpower).toBeGreaterThan(0);
  });

  it('source empower ≥ sink empower (losses inside)', () => {
    const bal = emergyBalance(foodChainModel(), {}, sunTransformity);
    expect(bal.sourceEmpower).toBeGreaterThanOrEqual(bal.sinkEmpower);
  });

  it('returns renewable fraction between 0 and 1', () => {
    const bal = emergyBalance(foodChainModel(), {}, sunTransformity);
    expect(bal.renewableFraction).toBeGreaterThanOrEqual(0);
    expect(bal.renewableFraction).toBeLessThanOrEqual(1);
  });
});
