import { R, I, GY, J1, MdkSystem } from '@mdk/core';
import type { SimConfig } from '@mdk/core';

export interface MaxonRe40Opts {
  name?: string;
  /** Supply voltage [V] — drives the Se source above this motor */
  voltage?: number;
}

/** Maxon RE40 DC motor Bond Graph sub-system.
 *  Datasheet: https://www.maxongroup.com/medias/sys_master/8825521782814.pdf
 *
 *  Topology:  J1_elec — Ra — La — GY — J1_mech — B — Jr
 *
 *  Connect electricalPort to a voltage source (Se).
 *  Connect mechanicalPort to a load (I for inertia, R for damping). */
export class MaxonRe40 {
  public readonly j1_elec: J1;
  public readonly j1_mech: J1;

  constructor(opts: MaxonRe40Opts = {}) {
    const n = opts.name ?? 'RE40';
    this.j1_elec = new J1(`${n}_J1e`);
    this.j1_mech = new J1(`${n}_J1m`);

    const ra = new R (`${n}_Ra`, { parameter: 1.03,      domain: 'electrical' });
    const la = new I (`${n}_La`, { parameter: 0.000165,  domain: 'electrical' });
    const gy = new GY(`${n}_GY`, { parameter: 0.0302 });
    const b  = new R (`${n}_B`,  { parameter: 0.000012,  domain: 'mechanical_rotation' });
    const jr = new I (`${n}_Jr`, { parameter: 0.0000135, domain: 'mechanical_rotation' });

    this.j1_elec.bond(ra);
    this.j1_elec.bond(la);
    this.j1_elec.bond(gy);
    gy.bond(this.j1_mech);
    this.j1_mech.bond(b);
    this.j1_mech.bond(jr);

    this._elements = [this.j1_elec, ra, la, gy, this.j1_mech, b, jr];
  }

  private readonly _elements: ReturnType<typeof Array.prototype.concat>;

  allElements() { return this._elements as ReturnType<typeof Array.prototype.concat>; }

  /** Convenience: build a complete single-motor MdkSystem and synthesise. */
  static synthesise(voltage: number, config?: SimConfig) {
    const sys = new MdkSystem('MaxonRe40');
    const motor = new MaxonRe40({ voltage });
    motor.allElements().forEach((el: Parameters<typeof sys.add>[0]) => sys.add(el));
    return sys.synth(config);
  }
}
