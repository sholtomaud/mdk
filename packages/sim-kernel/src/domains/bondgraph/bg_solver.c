/* bg_solver.c — Bond Graph numerical solver (Euler / RK4)
 *
 * Algorithm overview
 * ──────────────────
 * After SCAP assigns causality, the system dynamics reduce to a standard
 * ODE: dstate/dt = f(state), where state = [q₁ … qₙ, p₁ … pₙ] (charges
 * on C elements, momenta on I elements).
 *
 * compute_bg_derivatives() evaluates f(state) in three phases:
 *
 *   1. Seed: set efforts/flows that are immediately known from sources
 *      (Se, Sf) and from the state (C outputs e = q/C; I outputs f = p/I).
 *
 *   2. Propagate: fixed-point loop over junctions (J0, J1) and passive
 *      elements (R, TF, GY) until all bond efforts and flows are resolved.
 *      Junction laws:
 *        J0 (common effort) — effort broadcast; KCL for unknown flow
 *        J1 (common flow)   — effort balance (KVL) for unknown effort;
 *                             flow broadcast once any flow is known
 *
 *   3. Harvest: for each C, dq/dt = ±f on its bond;
 *               for each I, dp/dt = ±e on its bond.
 *      Sign convention: if the C/I element is the TARGET of the bond
 *      (power flows in), the sign is +1; SOURCE of bond → sign is -1.
 */

#include "bg_solver.h"
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stdio.h>

/* ── Bond workspace ──────────────────────────────────────────────── */

typedef struct {
    double *e;   /* effort[bond_id]       */
    double *f;   /* flow[bond_id]         */
    bool   *ek;  /* effort_known[bond_id] */
    bool   *fk;  /* flow_known[bond_id]   */
    int     n;
} BW;

static BW *bw_alloc(int n) {
    BW *bw = calloc(1, sizeof(BW));
    if (!bw) return NULL;
    bw->n  = n;
    bw->e  = calloc((size_t)n, sizeof(double));
    bw->f  = calloc((size_t)n, sizeof(double));
    bw->ek = calloc((size_t)n, sizeof(bool));
    bw->fk = calloc((size_t)n, sizeof(bool));
    if (!bw->e || !bw->f || !bw->ek || !bw->fk) {
        free(bw->e); free(bw->f); free(bw->ek); free(bw->fk); free(bw);
        return NULL;
    }
    return bw;
}

static void bw_reset(BW *bw) {
    memset(bw->e,  0, (size_t)bw->n * sizeof(double));
    memset(bw->f,  0, (size_t)bw->n * sizeof(double));
    memset(bw->ek, 0, (size_t)bw->n * sizeof(bool));
    memset(bw->fk, 0, (size_t)bw->n * sizeof(bool));
}

static void bw_free(BW *bw) {
    if (!bw) return;
    free(bw->e); free(bw->f); free(bw->ek); free(bw->fk); free(bw);
}

/* ── Helpers ─────────────────────────────────────────────────────── */

/* Causality of element e at bond b */
static Causality elem_caus(const Bond *b, const Element *e) {
    return (b->source == e) ? b->source_causality : b->target_causality;
}

/*
 * Junction sign rule:
 *   If junction is the TARGET of bond b: sign = +1  (power enters junction)
 *   If junction is the SOURCE of bond b: sign = -1  (power leaves junction)
 *
 * Used for both J0 KCL (flow balance) and J1 KVL (effort balance).
 */
static int junction_sign(const Bond *b, const Element *j) {
    return (b->target == j) ? +1 : -1;
}

/* ── Per-element propagation ─────────────────────────────────────── */

static int prop_R(const Element *r, BW *bw) {
    if (r->bond_count < 1) return 0;
    Bond *b = r->connected_bonds[0];
    Causality c = elem_caus(b, r);
    int changed = 0;

    if (c == FLOW_OUT && bw->ek[b->id] && !bw->fk[b->id]) {
        bw->f[b->id] = (r->parameter_value != 0.0)
                        ? bw->e[b->id] / r->parameter_value : 0.0;
        bw->fk[b->id] = true;
        changed = 1;
    } else if (c == EFFORT_OUT && bw->fk[b->id] && !bw->ek[b->id]) {
        bw->e[b->id] = r->parameter_value * bw->f[b->id];
        bw->ek[b->id] = true;
        changed = 1;
    }
    return changed;
}

/*
 * J0: common effort junction.
 *   (a) Broadcast known effort to all bonds.
 *   (b) KCL: if all-but-one flows are known, solve for the last.
 */
static int prop_J0(const Element *j, BW *bw) {
    int changed = 0;

    /* (a) broadcast effort */
    double e_common = 0.0;
    bool found_e = false;
    for (int i = 0; i < j->bond_count; i++) {
        Bond *b = j->connected_bonds[i];
        if (bw->ek[b->id]) { e_common = bw->e[b->id]; found_e = true; break; }
    }
    if (found_e) {
        for (int i = 0; i < j->bond_count; i++) {
            Bond *b = j->connected_bonds[i];
            if (!bw->ek[b->id]) {
                bw->e[b->id] = e_common;
                bw->ek[b->id] = true;
                changed = 1;
            }
        }
    }

    /* (b) KCL flow balance: Σ (sign * f) = 0 */
    int unk = 0, unk_i = -1;
    double sum = 0.0;
    for (int i = 0; i < j->bond_count; i++) {
        Bond *b = j->connected_bonds[i];
        if (bw->fk[b->id]) {
            sum += junction_sign(b, j) * bw->f[b->id];
        } else {
            unk++; unk_i = i;
        }
    }
    if (unk == 1) {
        Bond *ub = j->connected_bonds[unk_i];
        int s = junction_sign(ub, j);
        bw->f[ub->id] = -sum / s;
        bw->fk[ub->id] = true;
        changed = 1;
    }
    return changed;
}

/*
 * J1: common flow junction.
 *   (a) KVL: if all-but-one efforts are known, solve for the last.
 *   (b) Broadcast known flow to all bonds.
 */
static int prop_J1(const Element *j, BW *bw) {
    int changed = 0;

    /* (a) KVL effort balance: Σ (sign * e) = 0 */
    int unk = 0, unk_i = -1;
    double sum = 0.0;
    for (int i = 0; i < j->bond_count; i++) {
        Bond *b = j->connected_bonds[i];
        if (bw->ek[b->id]) {
            sum += junction_sign(b, j) * bw->e[b->id];
        } else {
            unk++; unk_i = i;
        }
    }
    if (unk == 1) {
        Bond *ub = j->connected_bonds[unk_i];
        int s = junction_sign(ub, j);
        bw->e[ub->id] = -sum / s;
        bw->ek[ub->id] = true;
        changed = 1;
    }

    /* (b) broadcast flow */
    double f_common = 0.0;
    bool found_f = false;
    for (int i = 0; i < j->bond_count; i++) {
        Bond *b = j->connected_bonds[i];
        if (bw->fk[b->id]) { f_common = bw->f[b->id]; found_f = true; break; }
    }
    if (found_f) {
        for (int i = 0; i < j->bond_count; i++) {
            Bond *b = j->connected_bonds[i];
            if (!bw->fk[b->id]) {
                bw->f[b->id] = f_common;
                bw->fk[b->id] = true;
                changed = 1;
            }
        }
    }
    return changed;
}

/*
 * TF (transformer, modulus r):
 *   e₁ = r·e₂   f₂ = r·f₁
 *
 * Causality at TF's end determines which quantity TF sets:
 *   EFFORT_OUT on bond k → TF sets e[k]
 *   FLOW_OUT   on bond k → TF sets f[k]
 */
static int prop_TF(const Element *tf, BW *bw) {
    if (tf->bond_count != 2) return 0;
    Bond *b0 = tf->connected_bonds[0];
    Bond *b1 = tf->connected_bonds[1];
    double r = tf->parameter_value;
    if (r == 0.0) return 0;

    Causality c0 = elem_caus(b0, tf);
    Causality c1 = elem_caus(b1, tf);
    int changed = 0;

    if (c0 == EFFORT_OUT && !bw->ek[b0->id] && bw->ek[b1->id]) {
        bw->e[b0->id] = r * bw->e[b1->id]; bw->ek[b0->id] = true; changed = 1;
    }
    if (c1 == EFFORT_OUT && !bw->ek[b1->id] && bw->ek[b0->id]) {
        bw->e[b1->id] = bw->e[b0->id] / r; bw->ek[b1->id] = true; changed = 1;
    }
    if (c0 == FLOW_OUT && !bw->fk[b0->id] && bw->fk[b1->id]) {
        bw->f[b0->id] = bw->f[b1->id] / r; bw->fk[b0->id] = true; changed = 1;
    }
    if (c1 == FLOW_OUT && !bw->fk[b1->id] && bw->fk[b0->id]) {
        bw->f[b1->id] = r * bw->f[b0->id]; bw->fk[b1->id] = true; changed = 1;
    }
    return changed;
}

/*
 * GY (gyrator, modulus r):
 *   e₁ = r·f₂   e₂ = r·f₁
 *
 * SCAP assigns the SAME causality type on both bonds (both EFFORT_OUT
 * or both FLOW_OUT at the gyrator's ends).
 *   Both EFFORT_OUT: GY sets e₀ from f₁, and e₁ from f₀
 *   Both FLOW_OUT:   GY sets f₀ from e₁, and f₁ from e₀
 */
static int prop_GY(const Element *gy, BW *bw) {
    if (gy->bond_count != 2) return 0;
    Bond *b0 = gy->connected_bonds[0];
    Bond *b1 = gy->connected_bonds[1];
    double r = gy->parameter_value;
    if (r == 0.0) return 0;

    Causality c0 = elem_caus(b0, gy);
    int changed = 0;

    if (c0 == EFFORT_OUT) {
        if (!bw->ek[b0->id] && bw->fk[b1->id]) {
            bw->e[b0->id] = r * bw->f[b1->id]; bw->ek[b0->id] = true; changed = 1;
        }
        if (!bw->ek[b1->id] && bw->fk[b0->id]) {
            bw->e[b1->id] = r * bw->f[b0->id]; bw->ek[b1->id] = true; changed = 1;
        }
    } else { /* FLOW_OUT */
        if (!bw->fk[b0->id] && bw->ek[b1->id]) {
            bw->f[b0->id] = bw->e[b1->id] / r; bw->fk[b0->id] = true; changed = 1;
        }
        if (!bw->fk[b1->id] && bw->ek[b0->id]) {
            bw->f[b1->id] = bw->e[b0->id] / r; bw->fk[b1->id] = true; changed = 1;
        }
    }
    return changed;
}

/* ── Public: compute_bg_derivatives ─────────────────────────────── */

void bg_compute_derivatives(const SystemGraph *g,
                             const int *state_map,
                             int state_count,
                             const double *state,
                             double *dstate)
{
    (void)state_count;

    BW *bw = bw_alloc(g->bond_count);
    if (!bw) return;
    bw_reset(bw);

    /* ── Phase 1: Seed known quantities ─────────────────────────── */
    for (int i = 0; i < g->element_count; i++) {
        Element *el = g->elements[i];

        switch (el->type) {
        case ELEM_SE:
            for (int j = 0; j < el->bond_count; j++) {
                Bond *b = el->connected_bonds[j];
                bw->e[b->id]  = el->parameter_value;
                bw->ek[b->id] = true;
            }
            break;

        case ELEM_SF:
            for (int j = 0; j < el->bond_count; j++) {
                Bond *b = el->connected_bonds[j];
                bw->f[b->id]  = el->parameter_value;
                bw->fk[b->id] = true;
            }
            break;

        case ELEM_C: {
            int si = (el->id < g->element_count) ? state_map[el->id] : -1;
            if (si < 0 || el->parameter_value == 0.0) break;
            double q = state[si];
            for (int j = 0; j < el->bond_count; j++) {
                Bond *b = el->connected_bonds[j];
                if (elem_caus(b, el) == EFFORT_OUT) {
                    bw->e[b->id]  = q / el->parameter_value;
                    bw->ek[b->id] = true;
                }
            }
            break;
        }

        case ELEM_I: {
            int si = (el->id < g->element_count) ? state_map[el->id] : -1;
            if (si < 0 || el->parameter_value == 0.0) break;
            double p = state[si];
            for (int j = 0; j < el->bond_count; j++) {
                Bond *b = el->connected_bonds[j];
                if (elem_caus(b, el) == FLOW_OUT) {
                    bw->f[b->id]  = p / el->parameter_value;
                    bw->fk[b->id] = true;
                }
            }
            break;
        }

        default: break;
        }
    }

    /* ── Phase 2: Fixed-point propagation ───────────────────────── */
    int max_iter = (g->element_count + 1) * (g->bond_count + 1);
    for (int iter = 0; iter < max_iter; iter++) {
        int any = 0;
        for (int i = 0; i < g->element_count; i++) {
            Element *el = g->elements[i];
            switch (el->type) {
            case ELEM_R:  any |= prop_R(el, bw);  break;
            case ELEM_J0: any |= prop_J0(el, bw); break;
            case ELEM_J1: any |= prop_J1(el, bw); break;
            case ELEM_TF: any |= prop_TF(el, bw); break;
            case ELEM_GY: any |= prop_GY(el, bw); break;
            default: break;
            }
        }
        if (!any) break;
    }

    /* ── Phase 3: Harvest derivatives ───────────────────────────── */
    for (int i = 0; i < g->element_count; i++) {
        Element *el = g->elements[i];
        int si = state_map[el->id];
        if (si < 0) continue;

        if (el->bond_count < 1) { dstate[si] = 0.0; continue; }
        Bond *b = el->connected_bonds[0];
        int sign = (b->target == el) ? +1 : -1;

        if (el->type == ELEM_C)
            dstate[si] = sign * bw->f[b->id];
        else if (el->type == ELEM_I)
            dstate[si] = sign * bw->e[b->id];
    }

    bw_free(bw);
}

/* ── Public: bg_compute_state_space ─────────────────────────────── */

static char *dup_name(const char *s) {
    size_t len = strnlen(s, 64);
    char *d = malloc(len + 1);
    if (!d) return NULL;
    memcpy(d, s, len);
    d[len] = '\0';
    return d;
}

BG_StateSpace *bg_compute_state_space(SystemGraph *g) {
    if (!g) return NULL;

    int n = g->element_count;

    /* Build state_map */
    int *sm = malloc((size_t)n * sizeof(int));
    if (!sm) return NULL;
    for (int i = 0; i < n; i++) sm[i] = -1;

    int sc = 0;
    for (int i = 0; i < n; i++) {
        Element *el = g->elements[i];
        if (el->type == ELEM_C || el->type == ELEM_I)
            sm[el->id] = sc++;
    }
    if (sc == 0) { free(sm); return NULL; }

    /* Collect input element ids (Se, Sf) */
    int mc = 0;
    for (int i = 0; i < n; i++) {
        Element *el = g->elements[i];
        if (el->type == ELEM_SE || el->type == ELEM_SF) mc++;
    }
    int *inp = calloc((size_t)(mc > 0 ? mc : 1), sizeof(int));
    if (!inp) { free(sm); return NULL; }
    {
        int k = 0;
        for (int i = 0; i < n; i++) {
            Element *el = g->elements[i];
            if (el->type == ELEM_SE || el->type == ELEM_SF)
                inp[k++] = el->id;
        }
    }

    BG_StateSpace *ss = calloc(1, sizeof(BG_StateSpace));
    if (!ss) { free(sm); free(inp); return NULL; }
    ss->state_count = sc;
    ss->input_count = mc;

    ss->A             = calloc((size_t)(sc * sc),             sizeof(double));
    ss->B             = calloc((size_t)(sc * (mc > 0 ? mc : 1)), sizeof(double));
    ss->C_mat         = calloc((size_t)(sc * sc),             sizeof(double));
    ss->D             = calloc((size_t)(sc * (mc > 0 ? mc : 1)), sizeof(double));
    ss->state_elem_ids = malloc((size_t)sc * sizeof(int));
    ss->state_names    = calloc((size_t)sc, sizeof(char *));
    ss->input_elem_ids = malloc((size_t)(mc > 0 ? mc : 1) * sizeof(int));
    ss->input_names    = calloc((size_t)(mc > 0 ? mc : 1), sizeof(char *));

    if (!ss->A || !ss->B || !ss->C_mat || !ss->D ||
        !ss->state_elem_ids || !ss->state_names ||
        !ss->input_elem_ids || !ss->input_names) {
        free(sm); free(inp); bg_state_space_free(ss);
        return NULL;
    }

    /* Fill state / input metadata */
    for (int i = 0; i < n; i++) {
        Element *el = g->elements[i];
        int si = sm[el->id];
        if (si >= 0) {
            ss->state_elem_ids[si] = el->id;
            ss->state_names[si]    = dup_name(el->name);
        }
    }
    for (int k = 0; k < mc; k++) {
        Element *el = g->elements[inp[k]];
        ss->input_elem_ids[k] = el->id;
        ss->input_names[k]    = dup_name(el->name);
    }

    /* Save and zero source parameters */
    double *saved = malloc((size_t)(mc > 0 ? mc : 1) * sizeof(double));
    if (!saved) { free(sm); free(inp); bg_state_space_free(ss); return NULL; }
    for (int k = 0; k < mc; k++) {
        saved[k] = g->elements[inp[k]]->parameter_value;
        g->elements[inp[k]]->parameter_value = 0.0;
    }

    double *probe = calloc((size_t)sc, sizeof(double));
    double *deriv = calloc((size_t)sc, sizeof(double));
    if (!probe || !deriv) {
        for (int k = 0; k < mc; k++)
            g->elements[inp[k]]->parameter_value = saved[k];
        free(saved); free(probe); free(deriv);
        free(sm); free(inp); bg_state_space_free(ss);
        return NULL;
    }

    /* A columns: probe state[j]=1, rest=0, all inputs=0 */
    for (int j = 0; j < sc; j++) {
        memset(probe, 0, (size_t)sc * sizeof(double));
        probe[j] = 1.0;
        bg_compute_derivatives(g, sm, sc, probe, deriv);
        for (int i = 0; i < sc; i++)
            ss->A[i * sc + j] = deriv[i];
    }

    /* B columns: state=0, probe input[k]=1, all other inputs=0 */
    memset(probe, 0, (size_t)sc * sizeof(double));
    for (int k = 0; k < mc; k++) {
        for (int j = 0; j < mc; j++)
            g->elements[inp[j]]->parameter_value = 0.0;
        g->elements[inp[k]]->parameter_value = 1.0;
        bg_compute_derivatives(g, sm, sc, probe, deriv);
        for (int i = 0; i < sc; i++)
            ss->B[i * mc + k] = deriv[i];
    }

    /* Restore source parameters */
    for (int k = 0; k < mc; k++)
        g->elements[inp[k]]->parameter_value = saved[k];

    /* C: diagonal 1/param_i for each state element */
    for (int i = 0; i < n; i++) {
        Element *el = g->elements[i];
        int si = sm[el->id];
        if (si < 0) continue;
        double p = el->parameter_value;
        ss->C_mat[si * sc + si] = (p != 0.0) ? 1.0 / p : 0.0;
    }
    /* D is already zeroed */

    free(probe); free(deriv); free(saved); free(inp); free(sm);
    return ss;
}

void bg_state_space_free(BG_StateSpace *ss) {
    if (!ss) return;
    free(ss->A);
    free(ss->B);
    free(ss->C_mat);
    free(ss->D);
    if (ss->state_names) {
        for (int i = 0; i < ss->state_count; i++)
            free(ss->state_names[i]);
        free(ss->state_names);
    }
    if (ss->input_names) {
        for (int i = 0; i < ss->input_count; i++)
            free(ss->input_names[i]);
        free(ss->input_names);
    }
    free(ss->state_elem_ids);
    free(ss->input_elem_ids);
    free(ss);
}

/* ── Euler step ──────────────────────────────────────────────────── */

static void step_euler(const SystemGraph *g, const int *sm, int sc,
                        double *state, double dt)
{
    double *ds = calloc((size_t)sc, sizeof(double));
    if (!ds) return;
    bg_compute_derivatives(g, sm, sc, state, ds);
    for (int i = 0; i < sc; i++) state[i] += dt * ds[i];
    free(ds);
}

/* ── RK4 step ────────────────────────────────────────────────────── */

static void step_rk4(const SystemGraph *g, const int *sm, int sc,
                      double *state, double dt)
{
    double *k1 = calloc((size_t)sc, sizeof(double));
    double *k2 = calloc((size_t)sc, sizeof(double));
    double *k3 = calloc((size_t)sc, sizeof(double));
    double *k4 = calloc((size_t)sc, sizeof(double));
    double *tmp = calloc((size_t)sc, sizeof(double));
    if (!k1 || !k2 || !k3 || !k4 || !tmp) goto cleanup;

    bg_compute_derivatives(g, sm, sc, state, k1);

    for (int i = 0; i < sc; i++) tmp[i] = state[i] + 0.5 * dt * k1[i];
    bg_compute_derivatives(g, sm, sc, tmp, k2);

    for (int i = 0; i < sc; i++) tmp[i] = state[i] + 0.5 * dt * k2[i];
    bg_compute_derivatives(g, sm, sc, tmp, k3);

    for (int i = 0; i < sc; i++) tmp[i] = state[i] + dt * k3[i];
    bg_compute_derivatives(g, sm, sc, tmp, k4);

    for (int i = 0; i < sc; i++)
        state[i] += (dt / 6.0) * (k1[i] + 2.0*k2[i] + 2.0*k3[i] + k4[i]);

cleanup:
    free(k1); free(k2); free(k3); free(k4); free(tmp);
}

/* ── Public: bg_simulate ─────────────────────────────────────────── */

BG_SimResult *bg_simulate(SystemGraph *graph,
                           const BG_SimConfig *cfg,
                           const double *initial_state)
{
    BG_SimResult *res = calloc(1, sizeof(BG_SimResult));
    if (!res) return NULL;

    /* Build state map: element_id → state index, -1 if not a state var */
    int *sm = malloc((size_t)graph->element_count * sizeof(int));
    if (!sm) { snprintf(res->error_msg, sizeof(res->error_msg),
                        "OOM: state map"); res->success = false; return res; }
    for (int i = 0; i < graph->element_count; i++) sm[i] = -1;

    int sc = 0;  /* state count */
    for (int i = 0; i < graph->element_count; i++) {
        Element *el = graph->elements[i];
        if (el->type == ELEM_C || el->type == ELEM_I)
            sm[el->id] = sc++;
    }
    res->state_count = sc;

    if (sc == 0) {
        snprintf(res->error_msg, sizeof(res->error_msg),
                 "No state variables (C or I elements) found");
        res->success = false; free(sm); return res;
    }

    /* State variable metadata */
    res->state_elem_ids   = malloc((size_t)sc * sizeof(int));
    res->state_elem_names = malloc((size_t)sc * sizeof(char*));
    if (!res->state_elem_ids || !res->state_elem_names) goto oom;

    for (int i = 0; i < graph->element_count; i++) {
        Element *el = graph->elements[i];
        int si = sm[el->id];
        if (si < 0) continue;
        res->state_elem_ids[si] = el->id;
        res->state_elem_names[si] = malloc(sizeof(el->name));
        if (!res->state_elem_names[si]) goto oom;
        memcpy(res->state_elem_names[si], el->name, sizeof(el->name));
    }

    /* Allocate step storage */
    double span = cfg->t_end - cfg->t_start;
    int step_count = (cfg->dt > 0.0 && span > 0.0)
                     ? (int)(span / cfg->dt) + 2 : 1;
    res->step_count = step_count;
    res->times = malloc((size_t)step_count * sizeof(double));
    res->data  = calloc((size_t)(sc * step_count), sizeof(double));
    if (!res->times || !res->data) goto oom;

    /* Initial state */
    double *state = calloc((size_t)sc, sizeof(double));
    if (!state) goto oom;
    if (initial_state) {
        for (int i = 0; i < graph->element_count; i++) {
            int si = sm[i];
            if (si >= 0) state[si] = initial_state[i];
        }
    }

    /* Record step 0 */
    res->times[0] = cfg->t_start;
    for (int i = 0; i < sc; i++) res->data[i * step_count + 0] = state[i];

    /* Integration loop */
    double t = cfg->t_start;
    int recorded = 1;
    for (int s = 1; s < step_count && t + cfg->dt <= cfg->t_end + cfg->dt * 1e-9; s++) {
        if (cfg->method == BG_RK4)
            step_rk4(graph, sm, sc, state, cfg->dt);
        else
            step_euler(graph, sm, sc, state, cfg->dt);

        t += cfg->dt;
        res->times[s] = t;
        for (int i = 0; i < sc; i++) res->data[i * step_count + s] = state[i];
        recorded = s + 1;
    }
    res->step_count = recorded;

    free(state);
    free(sm);
    res->success = true;
    return res;

oom:
    snprintf(res->error_msg, sizeof(res->error_msg), "OOM during simulation");
    res->success = false;
    free(sm);
    bg_sim_result_free(res);
    return NULL;
}

/* ── Public: bg_sim_result_free ──────────────────────────────────── */

void bg_sim_result_free(BG_SimResult *r) {
    if (!r) return;
    if (r->state_elem_names) {
        for (int i = 0; i < r->state_count; i++)
            free(r->state_elem_names[i]);
        free(r->state_elem_names);
    }
    free(r->state_elem_ids);
    free(r->times);
    free(r->data);
    free(r);
}
