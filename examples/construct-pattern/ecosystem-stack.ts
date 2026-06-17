// @ts-nocheck — design sketch using the proposed @mdk/core v1 API (not yet implemented)
/**
 * EcosystemStack — full composition example
 *
 * Shows:
 *   - Site loaded from Hydstra API (live) or SQLite (offline)
 *   - Rainfall forcing driven from real Hydstra timeseries (backtesting mode)
 *   - SensorNode bound to a physical site + hardware spec
 *   - AWS CDK infra stack (Pattern A) sitting alongside the MDK sim stack
 *   - CBOR output inferred from Site attachment (not declared per-node)
 *   - Multi-site fleet driven from SQLite site registry
 *
 * Architecture (Pattern A — side-by-side stacks):
 *
 *   ┌─ App ──────────────────────────────────────────────────────┐
 *   │                                                            │
 *   │  EcosystemSimStack  (MDK ModelStack)                       │
 *   │    ├─ Site           ← Hydstra API or SQLite               │
 *   │    ├─ HydrologicalSystem                                   │
 *   │    │    └─ forcing: Site.getTimeseries('rainfall')         │
 *   │    └─ SensorNode                                           │
 *   │         ├─ site: Site                                      │
 *   │         └─ power: SensorNetwork (BG electrical model)      │
 *   │                                                            │
 *   │  EcosystemInfraStack  (CDK Stack — in sensor-node.ts)      │
 *   │    ├─ S3 Bucket (timeseries CBOR store)                    │
 *   │    └─ per sensor: IoTThing + Policy + TopicRule → S3       │
 *   │                                                            │
 *   └────────────────────────────────────────────────────────────┘
 */

import { MdkApp, ModelStack } from '@mdk/core';
import type { SimConfig } from '@mdk/core';
import { Site } from './site.js';
import type { SiteConfig } from './site.js';
import { HydrologicalSystem } from './hydrological-system.js';
import { SensorNode } from './sensor-node.js';
// import { EcosystemInfraStack } from './sensor-node.js';  // CDK stack — Pattern A

// ── Per-stack config ──────────────────────────────────────────────

export interface EcosystemSimStackConfig extends SimConfig {
  /**
   * Site metadata. If `site.hasData` is true (Hydstra or SQLite loaded),
   * HydrologicalSystem uses the real rainfall series as forcing input
   * rather than the constant k_rain value — this is backtesting mode.
   */
  site: SiteConfig;
  /** Fallback rainfall forcing [mm/day] — used when no real data is loaded. */
  k_rain: number;
  k_et: number;        // [1/day]
  k_stream: number;    // [1/day]
  initialStore?: number;
}

// ── MDK simulation stack ──────────────────────────────────────────

export class EcosystemSimStack extends ModelStack {
  readonly site: Site;
  readonly hydro: HydrologicalSystem;
  readonly sensorNode: SensorNode;

  constructor(app: MdkApp, id: string, config: EcosystemSimStackConfig) {
    super(app, id, {
      t_start: 0,
      t_end:   config.t_end,
      dt:      config.dt,
      t_units: config.t_units ?? 'days',
      method:  config.method  ?? 'rk4',
      domain:  'odum-esl',
    });

    // ── Site — grounds every construct to a physical location ─────
    //
    // Inline (simulation-only, no real data):
    this.site = new Site(this, 'Site', config.site);
    //
    // OR — load from remote Hydstra API:
    //   this.site = await Site.fromHydstraApi(this, 'Site', {
    //     endpoint:  'https://realtimedata.waternsw.com.au/cgi/webservice.exe',
    //     siteId:    config.site.site_id,
    //     variables: [{ code: '10', alias: 'rainfall', datasource: 'A', interval: 'day' }],
    //     fromDate:  '2023-01-01',
    //     toDate:    '2024-01-01',
    //   });
    //
    // OR — load from local SQLite (field laptop / offline):
    //   this.site = Site.fromSQLite(this, 'Site', {
    //     dbPath: './data/hydstra_export.db',
    //     siteId: config.site.site_id,
    //   });

    // ── HydrologicalSystem — pure Odum ESL physics ───────────────
    //
    // When site.hasData, the rainfall series drives the forcing input
    // (backtesting / calibration mode) instead of constant k_rain.
    // CBOR timeseries output is inferred because this construct lives
    // under a Site scope — no explicit output() declaration needed.
    this.hydro = new HydrologicalSystem(this, 'Hydro', {
      initialStore:    config.initialStore,
      k_rain:          config.k_rain,
      k_et:            config.k_et,
      k_stream:        config.k_stream,
      forcingData:     this.site.getTimeseries('rainfall'),  // undefined → constant forcing
    });
    // BUT, what if the HydrologicaSystem is a System with many sites. Remember that a site is a node in a network. 



    // ── SensorNode — hardware at the site ────────────────────────
    //
    // Site binding answers: where is this sensor?
    // Hardware spec answers: what are its physical characteristics?
    // IoT topic is derived from site_id — no manual MQTT configuration.
    this.sensorNode = new SensorNode(this, 'Sensor', {
      site: this.site,
      hardware: {
        solarVoltage:       5.5,     // V   — panel open-circuit
        panelResistance:    10,      // Ω   — limits charge current
        batteryCapacitance: 270,     // F   ≈ 1 Ah @ 3.7 V
        initialCharge:      270 * 3.7 * 0.8,   // 80% SoC
        computePower:       1.5,     // W   — Pi 4B active
        idlePower:          0.15,    // W   — sleep between samples
        nominalVoltage:     3.7,
      },
    });

    //// This looks about right, but 'computePower:       1.5,     // W   — Pi 4B active' is wrong. The RasPi would be a compute construct

    // ── CBOR output — inferred, not declared ─────────────────────
    //
    // Because Site is an ancestor scope of both HydrologicalSystem and
    // SensorNode, the runtime infers:
    //   • all Store timeseries → CBOR files keyed by site_id + variable
    //   • stored to the timeseries-store registered in the App
    //
    // Explicit output() is only needed if you want a different format:
    //
    //   this.output('SoilWaterCSV', this.hydro.ports.soilWater, {
    //     format: 'csv',
    //     target: 'reporting-store',
    //   });
  }
}

// ── App entry point ───────────────────────────────────────────────

const app = new MdkApp();

// ── Single site, inline config (simulation-only) ─────────────────


// I think that we should be able to put the Hydrographic Site Network in here right? thats what a systems simulation is interested in.
const simStack = new SimulationModel(app, 'Yarrangobilly-01', {
  // So it should be somethign like
  nodes: site,
  
  // site: {
  //   site_id:       'YNG-01',
  //   name:          'Yarrangobilly River at Yarrangobilly',
  //   latitude:      -35.93,
  //   longitude:     148.48,
  //   elevation_m:   910,
  //   datum:         'AHD71',
  //   network:       'NSW_WaterNSW',
  //   hydstraSiteNo: '410730',
  // },
  t_end:        120,
  dt:           0.5,
  t_units:      'days',
  k_rain:       10,    // mm/day (used only if site has no real rainfall series)
  k_et:         0.05,  // 1/day
  k_stream:     0.10,  // 1/day
  initialStore: 0, // <- no. that would either default to zero for all sites/nodes, or would need to get the current value from the API or db.
});

// ── AWS CDK infra stack alongside the sim stack (Pattern A) ───────
//
// Uncomment when aws-cdk-lib is installed.
// This synthesises to a CloudFormation template, not a simulation model.
//
// const infraStack = new EcosystemInfraStack(app, 'EcosystemInfra', {
//   simNodes: [simStack.sensorNode],
//   region:   'ap-southeast-2',
// });

// ── Multi-site fleet — data-driven, not 100 stack files ──────────
//
// import { SiteRegistry } from '@mdk/core';
//
// const sites = SiteRegistry.load('./data/sites.db');
//
// const simStacks = sites.map(site =>
//   new EcosystemSimStack(app, site.site_id, {
//     site,
//     t_end: 365, dt: 0.5, t_units: 'days',
//     k_rain:   site.mean_rainfall_mm_day,
//     k_et:     site.k_et,
//     k_stream: site.k_stream,
//   })
// );
//
// const infraStack = new EcosystemInfraStack(app, 'FleetInfra', {
//   simNodes: simStacks.map(s => s.sensorNode),
//   region:   'ap-southeast-2',
// });

app.synth();
