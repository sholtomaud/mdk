// @ts-nocheck — design sketch using the proposed @mdk/core v1 API (not yet implemented)
/**
 * SensorNetwork — edge-compute ModelConstruct
 *
 * Models the power dynamics of a remote sensing node:
 * a solar-charged battery driving a compute/comms load.
 *
 * This IS a physics construct (Bond Graph, electrical domain).
 * The "IoT infrastructure" meaning (MQTT, S3, cloud) belongs in
 * a @mdk/provider-edge or @mdk/provider-aws construct that wraps this
 * as a deployment unit — not here.
 *
 * Bond Graph topology:
 *
 *   Solar (Se)          ← effort source: open-circuit voltage V_oc
 *     │
 *     J1_charge ──── R_panel [series resistance]
 *     │
 *     C_battery         ← state variable: charge q [C], V = q/C
 *     │
 *     J1_load ──── R_compute [compute + comms power draw]
 *               └─ R_idle   [quiescent / sleep-mode draw]
 *
 * State variables: q_battery  (charge in battery, V = q/C)
 * Observable:      V_battery = q_battery / C_battery
 *                  I_charge  = (V_solar − V_battery) / R_panel
 *                  I_load    = V_battery / R_load
 *
 * SensorNetwork exposes a `power` port (the battery Store) so a parent
 * construct can attach additional loads or parallel sources.
 */

import { ModelConstruct, Store, Source, Sink, Flow } from '@mdk/core';
import { Se, R, C, I, J0, J1 } from '@mdk/core';
import type { ModelStack } from '@mdk/core';

export interface SensorNetworkProps {
  /** Solar panel open-circuit voltage [V] */
  solarVoltage: number;
  /** Solar panel series resistance [Ω] — limits charge current */
  panelResistance: number;
  /** Battery capacitance [F] — C = Q_capacity / V_nominal */
  batteryCapacitance: number;
  /** Initial battery charge [C] — 0 = empty, C*V_nom = full */
  initialCharge?: number;
  /** Active compute power draw [W] at nominal V */
  computePower: number;
  /** Quiescent / sleep draw [W] at nominal V */
  idlePower: number;
  /** Nominal battery voltage for resistance calculation [V] */
  nominalVoltage?: number;
}

export class SensorNetwork extends ModelConstruct {
  /**
   * Exposed ports.
   *
   * `battery` — the C element Store; attach additional loads by creating
   *             a new Flow(parent, id, { origin: sensor.ports.battery, ... })
   *             in the parent scope.
   *
   * No data/comms port here — that lives in @mdk/provider-edge.
   */
  readonly ports: {
    battery: Store;
    solarInput: Source;
  };

  constructor(
    scope: ModelConstruct | ModelStack,
    id: string,
    props: SensorNetworkProps,
  ) {
    super(scope, id);

    const vNom = props.nominalVoltage ?? 3.7;

    const solar = new Source(this, 'Solar', {
      value: props.solarVoltage,
      domain: 'electrical',
      label: 'Solar Panel V_oc',
    });

    const battery = new Store(this, 'Battery', {
      initialValue: props.initialCharge ?? 0,
      domain: 'electrical',
      label: 'Battery charge q [C]',
    });

    const computeSink = new Sink(this, 'ComputeLoad', {
      domain: 'electrical',
      label: 'Compute + Comms',
    });

    const idleSink = new Sink(this, 'IdleLoad', {
      domain: 'electrical',
      label: 'Quiescent draw',
    });

    // Solar → battery: limited by panel series resistance.
    // Flow logic 'linear': charge current = (V_solar − V_bat) / R_panel
    // Approximation: V_bat ≈ const at V_nom, so effective k = 1/R_panel
    new Flow(this, 'SolarCharge', {
      origin: solar,
      target: battery,
      logic: 'linear',
      k: 1 / props.panelResistance,
    });

    // Battery → compute load: I = V_bat / R_compute, R = V_nom² / P
    new Flow(this, 'ComputeDraw', {
      origin: battery,
      target: computeSink,
      logic: 'linear',
      k: props.computePower / (vNom * vNom * props.batteryCapacitance),
    });

    // Battery → idle / quiescent draw
    new Flow(this, 'IdleDraw', {
      origin: battery,
      target: idleSink,
      logic: 'linear',
      k: props.idlePower / (vNom * vNom * props.batteryCapacitance),
    });

    this.ports = { battery, solarInput: solar };
  }

  /** Hours of runtime at full battery (quiescent only). */
  idleHours(props: SensorNetworkProps): number {
    const vNom = props.nominalVoltage ?? 3.7;
    const energyWh = (props.initialCharge ?? 0) * vNom / 3600;
    return energyWh / props.idlePower;
  }
}
