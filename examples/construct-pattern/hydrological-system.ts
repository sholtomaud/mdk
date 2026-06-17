// @ts-nocheck — design sketch using the proposed @mdk/core v1 API (not yet implemented)
/**
 * HydrologicalSystem — pure-physics Odum ESL ModelConstruct
 *
 * A soil-water balance model: rainfall charges a storage tank,
 * which drains via evapotranspiration and streamflow.
 *
 * Topology (Odum ESL):
 *
 *   Rain (Source)
 *     │  k_rain  [constant — mm/day forcing]
 *     ▼
 *   SoilWater (Store)  ← state variable Q [mm]
 *     │                │
 *     │ k_et           │ k_stream
 *     ▼                ▼
 *    ET (Sink)      Stream (Sink)
 *
 * State equation:
 *   dQ/dt = k_rain − k_et·Q − k_stream·Q = k_rain − (k_et + k_stream)·Q
 *
 * Steady state:  Q* = k_rain / (k_et + k_stream)
 * Time constant: τ  = 1 / (k_et + k_stream)
 *
 * This construct is self-contained and domain-agnostic at the scope level.
 * It exposes named ports so a parent Stack or Construct can wire into it
 * without knowing its internal structure.
 */

import { ModelConstruct, Store, Source, Sink, Flow } from '@mdk/core';
import type { ModelStack } from '@mdk/core';

export interface HydrologicalSystemProps {
  /** mm of water in storage at t=0 */
  initialStore?: number;
  /** Rainfall forcing [mm/day] */
  k_rain: number;
  /** Evapotranspiration drain coefficient [1/day]  — maps to BG R = 1/k_et */
  k_et: number;
  /** Stream baseflow drain coefficient [1/day] — maps to BG R = 1/k_stream */
  k_stream: number;
}

export class HydrologicalSystem extends ModelConstruct {
  /**
   * Named ports — the only surface a parent construct/stack touches.
   * Internal topology is not part of the public contract.
   */
  readonly ports: {
    rainfall: Source;
    soilWater: Store;
    evapotranspiration: Sink;
    streamflow: Sink;
  };

  constructor(
    scope: ModelConstruct | ModelStack,
    id: string,
    props: HydrologicalSystemProps,
  ) {
    super(scope, id);

    const rainfall = new Source(this, 'Rain', {
      value: props.k_rain,
      domain: 'hydraulic',
      label: 'Rainfall',
    });

    const soilWater = new Store(this, 'SoilWater', {
      initialValue: props.initialStore ?? 0,
      domain: 'hydraulic',
      label: 'Soil Water Q [mm]',
    });

    const et = new Sink(this, 'ET', {
      domain: 'hydraulic',
      label: 'Evapotranspiration',
    });

    const stream = new Sink(this, 'Stream', {
      domain: 'hydraulic',
      label: 'Streamflow',
    });

    // Rainfall charges the store at a constant rate (source-independent forcing).
    new Flow(this, 'RainInflow', {
      origin: rainfall,
      target: soilWater,
      logic: 'constant',
      k: props.k_rain,
    });

    // ET drains the store proportionally — first-order linear (k = 1/RC).
    new Flow(this, 'ETDrain', {
      origin: soilWater,
      target: et,
      logic: 'linear',
      k: props.k_et,
    });

    // Stream baseflow — same first-order linear form.
    new Flow(this, 'StreamDrain', {
      origin: soilWater,
      target: stream,
      logic: 'linear',
      k: props.k_stream,
    });

    this.ports = { rainfall, soilWater, evapotranspiration: et, streamflow: stream };
  }

  /** Convenience: theoretical steady-state store level. */
  steadyStateQ(props: HydrologicalSystemProps): number {
    return props.k_rain / (props.k_et + props.k_stream);
  }

  /** Convenience: time constant of the system. */
  timeConstant(props: HydrologicalSystemProps): number {
    return 1 / (props.k_et + props.k_stream);
  }
}
