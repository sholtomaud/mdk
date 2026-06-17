// @ts-nocheck — design sketch using the proposed @mdk/core v1 API (not yet implemented)
/**
 * Site — physical monitoring station anchor
 *
 * A Site is the construct that grounds everything else to a real location.
 * It carries metadata (lat/lon, datum, network) and owns the data source
 * references for that station (Hydstra API timeseries, local SQLite exports).
 *
 * CBOR inference rule:
 *   Any ModelConstruct or Store that is created within a Site scope
 *   defaults its timeseries output format to CBOR stored under site_id.
 *   You only need to declare an output explicitly if you want a different
 *   format or a different target store.
 *
 * Data source loading patterns:
 *
 *   1. Remote Hydstra API (live / near-realtime):
 *      const site = await Site.fromHydstraApi(scope, 'YNG-01', {
 *        endpoint: 'https://realtimedata.waternsw.com.au/cgi/webservice.exe',
 *        siteId:   '410730',
 *        variables: [{ code: '10', alias: 'rainfall' }],
 *      });
 *
 *   2. Local SQLite (Hydstra export / field laptop / offline):
 *      const site = Site.fromSQLite(scope, 'YNG-01', {
 *        dbPath: './data/hydstra_export.db',
 *        siteId: '410730',
 *      });
 *
 *   3. Inline (simulation-only, no real data):
 *      const site = new Site(scope, 'YNG-01', {
 *        site_id: 'YNG-01', latitude: -35.93, longitude: 148.48,
 *      });
 */

import { ModelConstruct } from '@mdk/core';
import type { ModelStack } from '@mdk/core';

// ── Site metadata ─────────────────────────────────────────────────

export interface SiteConfig {
  /** Unique station identifier — used as the CBOR store key. */
  site_id: string;
  /** Human-readable name, e.g. "Murrumbidgee at Mittagong". */
  name?: string;
  latitude: number;
  longitude: number;
  /** Elevation in metres above sea level. */
  elevation_m?: number;
  /** Vertical datum, e.g. "AHD71". */
  datum?: string;
  /** Originating monitoring network, e.g. "NSW_WaterNSW", "VIC_DELWP". */
  network?: string;
  /** Hydstra site number if different from site_id. */
  hydstraSiteNo?: string;
}

// ── Data source references attached to a site ─────────────────────

export interface TimeseriesVariable {
  /** Hydstra variable code, e.g. "10" = rainfall, "100" = stage, "141" = discharge. */
  code: string;
  /** Friendly alias used to refer to this series in constructs. */
  alias: string;
  /** Hydstra datasource (archive tier), e.g. "A" = telemetry, "ARCHIVE". */
  datasource?: string;
  /** Temporal aggregation interval. */
  interval?: 'year' | 'month' | 'day' | 'hour' | 'minute';
}

export interface HydstraApiOptions {
  /** Hydstra REST endpoint.
   *  WaterNSW: https://realtimedata.waternsw.com.au/cgi/webservice.exe
   *  VIC Water: https://data.water.vic.gov.au/cgi/webservice.exe
   *  Generic Kisters KiWIS: https://<host>/KiWIS/KiWIS */
  endpoint: string;
  siteId: string;
  /** Variables to fetch. Defaults to rainfall (code "10") if omitted. */
  variables?: TimeseriesVariable[];
  apiKey?: string;
  /** ISO date range for backtesting / calibration. Omit for live data. */
  fromDate?: string;
  toDate?: string;
}

export interface SQLiteOptions {
  dbPath: string;
  siteId: string;
  /** Table name if not the default "timeseries". */
  table?: string;
}

// ── Hydstra API client (internal) ─────────────────────────────────

/**
 * Thin wrapper around the Hydstra JSON web service.
 *
 * Hydstra request shape (POST body):
 * {
 *   "function": "get_ts_traces",
 *   "version": "2",
 *   "params": {
 *     "site_list":   "410730",
 *     "datasource":  "A",
 *     "var_list":    "10.00",
 *     "start_time":  "20200101000000",
 *     "end_time":    "20210101000000",
 *     "data_type":   "tot",     // total for rainfall; mean for stage
 *     "interval":    "day",
 *     "multiplier":  1
 *   }
 * }
 *
 * Response shape:
 * { "error_num": 0, "traces": [{ "site": "410730", "vname": "Rainfall",
 *   "trace": [{ "t": "20200102000000", "v": "12.4", "q": "10" }, ...] }] }
 */
export declare class HydstraClient {
  constructor(endpoint: string, apiKey?: string);

  /** Fetch timeseries trace for one site + variable. Returns [{t, v, q}]. */
  fetchTrace(
    siteId: string,
    variable: TimeseriesVariable,
    fromDate?: string,
    toDate?: string,
  ): Promise<Array<{ t: string; v: number; q: number }>>;

  /** Fetch site metadata record from Hydstra site table. */
  fetchSiteMeta(siteId: string): Promise<Partial<SiteConfig>>;
}

// ── Site construct ────────────────────────────────────────────────

export class Site extends ModelConstruct {
  readonly config: SiteConfig;

  /**
   * The data sources registered against this site.
   * Keyed by the variable alias (e.g. 'rainfall', 'stage').
   * Used by HydrologicalSystem to drive forcing inputs from real data.
   */
  readonly dataSources: Map<string, Array<{ t: string; v: number; q: number }>>;

  constructor(
    scope: ModelConstruct | ModelStack,
    id: string,
    config: SiteConfig,
  ) {
    super(scope, id);
    this.config = config;
    this.dataSources = new Map();
  }

  /**
   * Load site metadata + timeseries from a live Hydstra REST API.
   * Async because it makes HTTP requests at construct-definition time.
   * In a real implementation, data loading would be deferred to app.synth().
   */
  static async fromHydstraApi(
    scope: ModelConstruct | ModelStack,
    id: string,
    opts: HydstraApiOptions,
  ): Promise<Site> {
    const client = new HydstraClient(opts.endpoint, opts.apiKey);

    const meta = await client.fetchSiteMeta(opts.siteId);
    const config: SiteConfig = {
      site_id:        opts.siteId,
      hydstraSiteNo:  opts.siteId,
      ...meta,
    };

    const site = new Site(scope, id, config);

    const variables = opts.variables ?? [
      { code: '10', alias: 'rainfall', datasource: 'A', interval: 'day' },
    ];

    for (const v of variables) {
      const trace = await client.fetchTrace(opts.siteId, v, opts.fromDate, opts.toDate);
      site.dataSources.set(v.alias, trace);
    }

    return site;
  }

  /**
   * Load site metadata + timeseries from a local SQLite database.
   * Use this for offline work, field laptops, or Hydstra export snapshots.
   *
   * Expected schema (Hydstra export or custom):
   *   CREATE TABLE sites (site_id TEXT, name TEXT, latitude REAL, longitude REAL, ...);
   *   CREATE TABLE timeseries (site_id TEXT, variable TEXT, t TEXT, v REAL, q INTEGER);
   */
  static fromSQLite(
    scope: ModelConstruct | ModelStack,
    id: string,
    opts: SQLiteOptions,
  ): Site {
    // Node 22+ native SQLite (no external dependency):
    //   import { DatabaseSync } from 'node:sqlite';
    //   const db = new DatabaseSync(opts.dbPath);
    //
    //   const row = db.prepare('SELECT * FROM sites WHERE site_id = ?').get(opts.siteId);
    //   const config: SiteConfig = { site_id: opts.siteId, ...row };
    //
    //   const site = new Site(scope, id, config);
    //
    //   const rows = db.prepare(
    //     'SELECT variable, t, v, q FROM timeseries WHERE site_id = ? ORDER BY t'
    //   ).all(opts.siteId);
    //   for (const row of rows) {
    //     if (!site.dataSources.has(row.variable)) site.dataSources.set(row.variable, []);
    //     site.dataSources.get(row.variable)!.push({ t: row.t, v: row.v, q: row.q });
    //   }
    //
    //   db.close();
    //   return site;

    // Placeholder until Node SQLite API is wired in:
    return new Site(scope, id, { site_id: opts.siteId, latitude: 0, longitude: 0 });
  }

  /** Retrieve a named timeseries for use as a construct forcing input. */
  getTimeseries(alias: string): Array<{ t: string; v: number; q: number }> | undefined {
    return this.dataSources.get(alias);
  }

  /** True if this site has real data attached (backtesting / calibration mode). */
  get hasData(): boolean {
    return this.dataSources.size > 0;
  }
}
