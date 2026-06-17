import { Se, Sf, R, C, I, TF, GY, J0, J1 } from './primitives.js';
import { PowerBond } from './base.js';

/* ── L2 composites ───────────────────────────────────────────────── */

export interface DCMotorParams {
  /** Armature resistance [Ω] */
  R_a: number;
  /** Armature inductance [H] */
  L_a: number;
  /** Back-EMF / torque constant [V·s/rad = N·m/A] */
  k_t: number;
  /** Rotor inertia [kg·m²] */
  J_r: number;
  /** Viscous damping coefficient [N·m·s/rad] */
  b: number;
}

export class DCMotor {
  public readonly elements: {
    j1_elec: J1;
    r_a: R;
    l_a: I;
    gy: GY;
    j1_mech: J1;
    b_friction: R;
    j_rotor: I;
  };
  public readonly bonds: PowerBond[] = [];
  /** Electrical port (bond into J1_elec from an external Se) */
  public readonly electricalPort: J1;
  /** Mechanical shaft port (bond from J1_mech to external load) */
  public readonly mechanicalPort: J1;

  constructor(name: string, params: DCMotorParams) {
    const j1e = new J1(`${name}_J1e`, { visual: { label: 'J1 elec' } });
    const ra  = new R (`${name}_Ra`,  { parameter: params.R_a, domain: 'electrical' });
    const la  = new I (`${name}_La`,  { parameter: params.L_a, domain: 'electrical' });
    const gy  = new GY(`${name}_GY`,  { parameter: params.k_t });
    const j1m = new J1(`${name}_J1m`, { visual: { label: 'J1 mech' } });
    const bf  = new R (`${name}_B`,   { parameter: params.b, domain: 'mechanical_rotation' });
    const jr  = new I (`${name}_Jr`,  { parameter: params.J_r, domain: 'mechanical_rotation' });

    /* Electrical side: J1e bonds to Ra, La, and into GY port 0 */
    this.bonds.push(j1e.bond(ra), j1e.bond(la), j1e.bond(gy));

    /* Mechanical side: GY port 1 into J1m, J1m bonds to friction and rotor */
    this.bonds.push(gy.bond(j1m), j1m.bond(bf), j1m.bond(jr));

    this.elements = { j1_elec: j1e, r_a: ra, l_a: la, gy, j1_mech: j1m, b_friction: bf, j_rotor: jr };
    this.electricalPort  = j1e;
    this.mechanicalPort  = j1m;
  }

  allElements() {
    return Object.values(this.elements);
  }
}

export interface GearboxParams {
  ratio: number;
}

export class Gearbox {
  public readonly tf: TF;
  constructor(name: string, params: GearboxParams) {
    this.tf = new TF(`${name}_TF`, { parameter: params.ratio });
  }
}

export interface LinearSliderParams {
  mass: number;
  damping: number;
}

export class LinearSlider {
  public readonly elements: { j1: J1; m: I; b: R };
  public readonly port: J1;
  constructor(name: string, params: LinearSliderParams) {
    const j1 = new J1(`${name}_J1`);
    const m  = new I (`${name}_M`, { parameter: params.mass, domain: 'mechanical_translation' });
    const b  = new R (`${name}_B`, { parameter: params.damping, domain: 'mechanical_translation' });
    j1.bond(m); j1.bond(b);
    this.elements = { j1, m, b };
    this.port = j1;
  }
  allElements() { return Object.values(this.elements); }
}

export interface PIDControllerParams {
  /** Proportional gain */
  Kp: number;
  /** Integral gain */
  Ki: number;
  /** Derivative gain */
  Kd: number;
}

export class PIDController {
  public readonly elements: { j0: J0; r_p: R; c_i: C; i_d: I };
  public readonly port: J0;

  constructor(name: string, params: PIDControllerParams) {
    const j0  = new J0(`${name}_J0`);
    /* P term: R = 1/Kp (admittance form so effort→flow) */
    const rp  = new R (`${name}_Rp`, { parameter: 1.0 / params.Kp });
    /* I term: C = Ki (integrating effort produces flow) */
    const ci  = new C (`${name}_Ci`, { parameter: params.Ki });
    /* D term: I = Kd (differentiating flow produces effort) */
    const id_ = new I (`${name}_Id`, { parameter: params.Kd });
    j0.bond(rp); j0.bond(ci); j0.bond(id_);
    this.elements = { j0, r_p: rp, c_i: ci, i_d: id_ };
    this.port = j0;
  }
  allElements() { return Object.values(this.elements); }
}
