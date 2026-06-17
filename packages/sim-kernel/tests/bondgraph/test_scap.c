/* test_scap.c — Unit tests for the SCAP causality algorithm */

#include "test_harness.h"
#include "bondgraph.h"

/* ════════════════════════════════════════════════════════════════
 *  Helper: build common topologies
 * ════════════════════════════════════════════════════════════════ */

/*  Simple series RC circuit (bond graph):
 *
 *     Se ──b0──▷ J1 ──b1──▷ R
 *                   ──b2──▷ C
 *
 *  Se (effort source), R (resistor), C (capacitor) all share
 *  common flow through a 1-junction.
 */
static SystemGraph* build_series_rc(void) {
    SystemGraph* g = create_graph();
    Element* se = add_element(g, ELEM_SE, "Vsrc", 12.0);
    Element* j1 = add_element(g, ELEM_J1, "J1",    0.0);
    Element* r  = add_element(g, ELEM_R,  "R1",    100.0);
    Element* c  = add_element(g, ELEM_C,  "C1",    0.001);

    connect_elements(g, se, j1);   /* b0 */
    connect_elements(g, j1, r);    /* b1 */
    connect_elements(g, j1, c);    /* b2 */
    return g;
}

/*  Series RLC circuit:
 *
 *     Se ──b0──▷ J1 ──b1──▷ R
 *                   ──b2──▷ I
 *                   ──b3──▷ C
 */
static SystemGraph* build_series_rlc(void) {
    SystemGraph* g = create_graph();
    Element* se = add_element(g, ELEM_SE, "Vsrc", 12.0);
    Element* j1 = add_element(g, ELEM_J1, "J1",    0.0);
    Element* r  = add_element(g, ELEM_R,  "R1",    10.0);
    Element* in = add_element(g, ELEM_I,  "L1",    0.5);
    Element* c  = add_element(g, ELEM_C,  "C1",    0.001);

    connect_elements(g, se, j1);
    connect_elements(g, j1, r);
    connect_elements(g, j1, in);
    connect_elements(g, j1, c);
    return g;
}

/*  Conflict: two Se on a 0-junction (common effort).
 *
 *     Se1 ──b0──▷ J0 ◁──b1── Se2
 *
 *  Both try to set effort → conflict.
 */
static SystemGraph* build_two_se_on_j0(void) {
    SystemGraph* g = create_graph();
    Element* se1 = add_element(g, ELEM_SE, "V1", 12.0);
    Element* se2 = add_element(g, ELEM_SE, "V2",  5.0);
    Element* j0  = add_element(g, ELEM_J0, "J0",  0.0);

    connect_elements(g, se1, j0);
    connect_elements(g, se2, j0);
    return g;
}

/*  Conflict: two Sf on a 1-junction (common flow).
 *
 *     Sf1 ──b0──▷ J1 ◁──b1── Sf2
 */
static SystemGraph* build_two_sf_on_j1(void) {
    SystemGraph* g = create_graph();
    Element* sf1 = add_element(g, ELEM_SF, "F1", 10.0);
    Element* sf2 = add_element(g, ELEM_SF, "F2",  5.0);
    Element* j1  = add_element(g, ELEM_J1, "J1",  0.0);

    connect_elements(g, sf1, j1);
    connect_elements(g, sf2, j1);
    return g;
}

/*  DC Motor (Gyrator) topology:
 *
 *     Se ──b0──▷ J1_e ──b1──▷ R
 *                     ──b2──▷ I_e
 *                     ──b3──▷ GY ──b4──▷ J1_m ──b5──▷ I_m
 *
 *  Electrical side: Se (voltage), R (winding resistance), I_e (inductance)
 *  Mechanical side: I_m (rotor inertia)
 *  GY couples them via the torque constant.
 */
static SystemGraph* build_dc_motor(void) {
    SystemGraph* g = create_graph();
    Element* se   = add_element(g, ELEM_SE, "Vsrc",   12.0);
    Element* j1e  = add_element(g, ELEM_J1, "J1_elec", 0.0);
    Element* r    = add_element(g, ELEM_R,  "Rwind",   1.5);
    Element* ie   = add_element(g, ELEM_I,  "Lwind",   0.8);
    Element* gy   = add_element(g, ELEM_GY, "Motor",   0.05);
    Element* j1m  = add_element(g, ELEM_J1, "J1_mech", 0.0);
    Element* im   = add_element(g, ELEM_I,  "Jrotor",  0.01);

    connect_elements(g, se,  j1e);  /* b0 */
    connect_elements(g, j1e, r);    /* b1 */
    connect_elements(g, j1e, ie);   /* b2 */
    connect_elements(g, j1e, gy);   /* b3 */
    connect_elements(g, gy,  j1m);  /* b4 */
    connect_elements(g, j1m, im);   /* b5 */
    return g;
}

/* ════════════════════════════════════════════════════════════════
 *  Helpers
 * ════════════════════════════════════════════════════════════════ */

/* Check a bond is fully and validly assigned */
static bool bond_assigned_valid(const Bond* b) {
    return (b->source_causality == EFFORT_OUT &&
            b->target_causality == FLOW_OUT)  ||
           (b->source_causality == FLOW_OUT   &&
            b->target_causality == EFFORT_OUT);
}

/* ════════════════════════════════════════════════════════════════
 *  Tests
 * ════════════════════════════════════════════════════════════════ */

/* ── Test: Series RC — should resolve cleanly ──────────────────── */
void test_scap_series_rc(int *_pass, int *_fail) {
    SystemGraph* g = build_series_rc();
    bool ok = assign_causality(g);
    ASSERT_TRUE(ok);

    /* Every bond should be fully assigned */
    for (int i = 0; i < g->bond_count; i++) {
        ASSERT_TRUE(g->bonds[i]->source_causality != UNASSIGNED);
        ASSERT_TRUE(g->bonds[i]->target_causality != UNASSIGNED);
    }

    /* Complementarity: each bond has one EFFORT_OUT, one FLOW_OUT */
    for (int i = 0; i < g->bond_count; i++) {
        Bond* b = g->bonds[i];
        ASSERT_TRUE(
            (b->source_causality == EFFORT_OUT &&
             b->target_causality == FLOW_OUT)  ||
            (b->source_causality == FLOW_OUT   &&
             b->target_causality == EFFORT_OUT));
    }

    /* Se should be EFFORT_OUT on its bond */
    Bond* b0 = g->bonds[0];
    ASSERT_EQ(b0->source_causality, EFFORT_OUT);   /* Se end */
    ASSERT_EQ(b0->target_causality, FLOW_OUT);      /* J1 end */

    /* Report should be OK (or WARNING for derivative causality) */
    CausalityReport rpt = get_causality_report(g);
    ASSERT_TRUE(rpt.overall_status != CAUSALITY_ERROR);

    destroy_graph(g);
}

/* ── Test: Series RLC — should resolve cleanly ─────────────────── */
void test_scap_series_rlc(int *_pass, int *_fail) {
    SystemGraph* g = build_series_rlc();
    bool ok = assign_causality(g);
    ASSERT_TRUE(ok);

    /* All bonds assigned with valid complementarity */
    for (int i = 0; i < g->bond_count; i++) {
        Bond* b = g->bonds[i];
        ASSERT_TRUE(bond_assigned_valid(b));
    }

    CausalityReport rpt = get_causality_report(g);
    ASSERT_TRUE(rpt.overall_status != CAUSALITY_ERROR);

    destroy_graph(g);
}

/* ── Test: Two Se on J0 — must FAIL ────────────────────────────── */
void test_scap_conflict_two_se_j0(int *_pass, int *_fail) {
    SystemGraph* g = build_two_se_on_j0();
    bool ok = assign_causality(g);
    ASSERT_FALSE(ok);

    CausalityReport rpt = get_causality_report(g);
    ASSERT_EQ(rpt.overall_status, CAUSALITY_ERROR);
    ASSERT_TRUE(rpt.diagnostic_count > 0);

    destroy_graph(g);
}

/* ── Test: Two Sf on J1 — must FAIL ────────────────────────────── */
void test_scap_conflict_two_sf_j1(int *_pass, int *_fail) {
    SystemGraph* g = build_two_sf_on_j1();
    bool ok = assign_causality(g);
    ASSERT_FALSE(ok);

    CausalityReport rpt = get_causality_report(g);
    ASSERT_EQ(rpt.overall_status, CAUSALITY_ERROR);

    destroy_graph(g);
}

/* ── Test: DC Motor with Gyrator — should resolve ──────────────── */
void test_scap_dc_motor(int *_pass, int *_fail) {
    SystemGraph* g = build_dc_motor();
    bool ok = assign_causality(g);
    ASSERT_TRUE(ok);

    /* All bonds valid */
    for (int i = 0; i < g->bond_count; i++) {
        Bond* b = g->bonds[i];
        ASSERT_TRUE(bond_assigned_valid(b));
    }

    CausalityReport rpt = get_causality_report(g);
    ASSERT_TRUE(rpt.overall_status != CAUSALITY_ERROR);

    destroy_graph(g);
}

/* ── Test: Transformer topology ────────────────────────────────── */
void test_scap_transformer(int *_pass, int *_fail) {
    /*  Se ──▷ J1 ──▷ TF ──▷ J1 ──▷ I  */
    SystemGraph* g = create_graph();
    Element* se  = add_element(g, ELEM_SE, "Vsrc",  12.0);
    Element* j1a = add_element(g, ELEM_J1, "J1a",    0.0);
    Element* tf  = add_element(g, ELEM_TF, "Gear", 100.0);
    Element* j1b = add_element(g, ELEM_J1, "J1b",    0.0);
    Element* in  = add_element(g, ELEM_I,  "Load",   5.0);

    connect_elements(g, se,  j1a);
    connect_elements(g, j1a, tf);
    connect_elements(g, tf,  j1b);
    connect_elements(g, j1b, in);

    bool ok = assign_causality(g);
    ASSERT_TRUE(ok);

    for (int i = 0; i < g->bond_count; i++) {
        Bond* b = g->bonds[i];
        ASSERT_TRUE(bond_assigned_valid(b));
    }

    destroy_graph(g);
}
