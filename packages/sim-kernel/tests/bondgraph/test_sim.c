/* test_sim.c — Bond Graph simulation validation tests
 *
 * Validates bg_simulate() against known analytic solutions.
 *
 * Test 1 — RC charging (Se → J1 → R, J1 → C)
 *   V_C(t) = V₀(1 − e^{−t/RC})
 *   V₀=12V, R=100Ω, C=1mF → τ=0.1s
 *   At t=τ: V_C ≈ 7.585V  (tolerance 0.1%)
 *   At t=5τ: V_C ≈ 11.92V (tolerance 0.1%)
 *
 * Test 2 — RC discharging (C → R, no source)
 *   V_C(t) = V₀·e^{−t/RC}
 *   V₀=10V, R=50Ω, C=2mF → τ=0.1s
 *
 * Test 3 — sim_kernel_run JSON entry point
 */

#include "test_harness.h"
#include "bondgraph.h"
#include "bg_solver.h"
#include "json_io.h"
#include <math.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

extern const char *sim_kernel_run(const char *json_input);
extern void        cleanup_bridge(void);

static bool str_contains(const char *h, const char *n) {
    return h && n && strstr(h, n);
}

/* ── helpers ─────────────────────────────────────────────────────── */

/*
 * Build the series-RC graph:  Se(V0) → J1 → R(R_val), J1 → C(C_val)
 * id mapping: Se=0, J1=1, R=2, C=3
 */
static SystemGraph *build_rc(double V0, double R_val, double C_val) {
    SystemGraph *g = create_graph();
    Element *se = add_element(g, ELEM_SE, "Vsrc", V0);
    Element *j1 = add_element(g, ELEM_J1, "J1",   0.0);
    Element *r  = add_element(g, ELEM_R,  "R1",   R_val);
    Element *c  = add_element(g, ELEM_C,  "C1",   C_val);
    connect_elements(g, se, j1);   /* b0 */
    connect_elements(g, j1, r);    /* b1 */
    connect_elements(g, j1, c);    /* b2 */
    (void)r; (void)c;
    return g;
}

/* Find state index for a given element name */
static int find_state_idx(const BG_SimResult *res, const char *name) {
    for (int i = 0; i < res->state_count; i++)
        if (strcmp(res->state_elem_names[i], name) == 0) return i;
    return -1;
}

/* Get simulated value at step closest to time t_target */
static double value_at(const BG_SimResult *res, int si, double t_target) {
    int best = 0;
    double best_diff = fabs(res->times[0] - t_target);
    for (int s = 1; s < res->step_count; s++) {
        double d = fabs(res->times[s] - t_target);
        if (d < best_diff) { best_diff = d; best = s; }
    }
    return res->data[(size_t)si * (size_t)res->step_count + (size_t)best];
}

/* ── Test 1: RC charging ─────────────────────────────────────────── */

void test_sim_rc_charging(int *_pass, int *_fail) {
    const double V0 = 12.0, R = 100.0, C = 0.001;
    const double tau = R * C;   /* 0.1 s */

    SystemGraph *g = build_rc(V0, R, C);
    bool ok = assign_causality(g);
    ASSERT_TRUE(ok);

    BG_SimConfig cfg = { .t_start = 0.0, .t_end = 5.0 * tau,
                         .dt = 0.0001, .method = BG_RK4 };
    double init[4] = {0.0, 0.0, 0.0, 0.0};   /* all zero: C uncharged */

    BG_SimResult *res = bg_simulate(g, &cfg, init);
    ASSERT_NOT_NULL(res);
    ASSERT_TRUE(res->success);
    ASSERT_TRUE(res->state_count == 1);

    int ci = find_state_idx(res, "C1");
    ASSERT_TRUE(ci >= 0);

    /* q(t) = C * V₀ * (1 - e^{-t/τ}), so V_C = q/C = V₀*(1-e^{-t/τ}) */

    double q_at_tau   = value_at(res, ci, tau);
    double V_at_tau   = q_at_tau / C;
    double V_analytic = V0 * (1.0 - exp(-1.0));   /* ≈ 7.585 */
    double rel_err    = fabs(V_at_tau - V_analytic) / V_analytic;

    printf("  RC charging at t=τ: sim=%.4f V, analytic=%.4f V, err=%.4f%%\n",
           V_at_tau, V_analytic, rel_err * 100.0);
    ASSERT_TRUE(rel_err < 0.001);   /* < 0.1% */

    double q_at_5tau  = value_at(res, ci, 5.0 * tau);
    double V_at_5tau  = q_at_5tau / C;
    double V_analytic5 = V0 * (1.0 - exp(-5.0));  /* ≈ 11.919 */
    double rel_err5   = fabs(V_at_5tau - V_analytic5) / V_analytic5;

    printf("  RC charging at t=5τ: sim=%.4f V, analytic=%.4f V, err=%.4f%%\n",
           V_at_5tau, V_analytic5, rel_err5 * 100.0);
    ASSERT_TRUE(rel_err5 < 0.001);

    bg_sim_result_free(res);
    destroy_graph(g);
}

/* ── Test 2: RC discharging (C as source, no Se) ─────────────────── */

void test_sim_rc_discharging(int *_pass, int *_fail) {
    const double V0 = 10.0, R = 50.0, C = 0.002;
    const double tau = R * C;   /* 0.1 s */

    /* Topology: C(source) → R(target) */
    SystemGraph *g = create_graph();
    Element *c  = add_element(g, ELEM_C, "Cap", C);
    Element *r  = add_element(g, ELEM_R, "Res", R);
    connect_elements(g, c, r);  /* b0: C→R */
    (void)r;

    bool ok = assign_causality(g);
    ASSERT_TRUE(ok);

    BG_SimConfig cfg = { .t_start = 0.0, .t_end = 5.0 * tau,
                         .dt = 0.0001, .method = BG_RK4 };

    /* Initial state: C charged to V0 → q0 = C * V0 */
    double init[2] = {0.0, 0.0};
    /* state_map: Cap=id0, so init[0] = q0 */
    init[0] = C * V0;

    BG_SimResult *res = bg_simulate(g, &cfg, init);
    ASSERT_NOT_NULL(res);
    ASSERT_TRUE(res->success);

    int ci = find_state_idx(res, "Cap");
    ASSERT_TRUE(ci >= 0);

    double q_at_tau   = value_at(res, ci, tau);
    double V_at_tau   = q_at_tau / C;
    double V_analytic = V0 * exp(-1.0);       /* ≈ 3.679 */
    double rel_err    = fabs(V_at_tau - V_analytic) / V_analytic;

    printf("  RC discharge at t=τ: sim=%.4f V, analytic=%.4f V, err=%.4f%%\n",
           V_at_tau, V_analytic, rel_err * 100.0);
    ASSERT_TRUE(rel_err < 0.001);

    bg_sim_result_free(res);
    destroy_graph(g);
}

/* ── Test 3: sim_kernel_run JSON entry point ─────────────────────── */

void test_sim_kernel_run_rc(int *_pass, int *_fail) {
    const char *json =
        "{"
        "  \"domain\": \"bondgraph\","
        "  \"elements\": ["
        "    { \"id\": 0, \"name\": \"Vsrc\", \"type\": \"Se\","
        "      \"parameter\": 12.0 },"
        "    { \"id\": 1, \"name\": \"J1\",   \"type\": \"J1\","
        "      \"parameter\": 0.0 },"
        "    { \"id\": 2, \"name\": \"R1\",   \"type\": \"R\","
        "      \"parameter\": 100.0 },"
        "    { \"id\": 3, \"name\": \"C1\",   \"type\": \"C\","
        "      \"parameter\": 0.001 }"
        "  ],"
        "  \"bonds\": ["
        "    { \"id\": 0, \"source\": 0, \"target\": 1 },"
        "    { \"id\": 1, \"source\": 1, \"target\": 2 },"
        "    { \"id\": 2, \"source\": 1, \"target\": 3 }"
        "  ],"
        "  \"config\": {"
        "    \"t_start\": 0.0, \"t_end\": 0.5,"
        "    \"dt\": 0.001, \"method\": \"rk4\""
        "  }"
        "}";

    const char *result = sim_kernel_run(json);
    ASSERT_NOT_NULL(result);
    ASSERT_TRUE(str_contains(result, "\"success\":true"));
    ASSERT_TRUE(str_contains(result, "\"domain\":\"bondgraph\""));
    ASSERT_TRUE(str_contains(result, "\"simulation\""));
    ASSERT_TRUE(str_contains(result, "\"C1\""));
    ASSERT_TRUE(str_contains(result, "\"time\""));
    ASSERT_TRUE(str_contains(result, "\"data\""));

    cleanup_bridge();
}

/* ── Test 4: state-space matrices for RC circuit ─────────────────── */

void test_sim_state_space_rc(int *_pass, int *_fail) {
    const double R = 100.0, C = 0.001;

    SystemGraph *g = build_rc(12.0, R, C);
    bool ok = assign_causality(g);
    ASSERT_TRUE(ok);

    BG_StateSpace *ss = bg_compute_state_space(g);
    ASSERT_NOT_NULL(ss);
    ASSERT_TRUE(ss->state_count == 1);
    ASSERT_TRUE(ss->input_count == 1);

    /*
     * ẋ = A·x + B·u  →  dq_C/dt = -(1/RC)·q_C + (1/R)·V_src
     * A[0][0] = -1/(R·C) = -10.0
     * B[0][0] =  1/R     =   0.01
     * C[0][0] =  1/C     = 1000.0
     * D[0][0] =  0.0
     */
    double A00 = ss->A[0];
    double B00 = ss->B[0];
    double C00 = ss->C_mat[0];
    double D00 = ss->D[0];

    printf("  RC state-space: A=%.4f (exp -10.0), B=%.4f (exp 0.0100),"
           " C=%.1f (exp 1000.0), D=%.1f (exp 0.0)\n",
           A00, B00, C00, D00);

    ASSERT_TRUE(fabs(A00 - (-1.0 / (R * C))) < 1e-10);
    ASSERT_TRUE(fabs(B00 -  (1.0 / R))        < 1e-10);
    ASSERT_TRUE(fabs(C00 -  (1.0 / C))        < 1e-10);
    ASSERT_TRUE(fabs(D00)                      < 1e-10);

    bg_state_space_free(ss);
    destroy_graph(g);
}

/* ── Test 5: validate-only (no config) still works ─────────────── */

void test_sim_kernel_run_validate_only(int *_pass, int *_fail) {
    const char *json =
        "{"
        "  \"domain\": \"bondgraph\","
        "  \"elements\": ["
        "    { \"id\": 0, \"name\": \"Se\", \"type\": \"Se\","
        "      \"parameter\": 5.0 },"
        "    { \"id\": 1, \"name\": \"C1\", \"type\": \"C\","
        "      \"parameter\": 0.01 }"
        "  ],"
        "  \"bonds\": ["
        "    { \"id\": 0, \"source\": 0, \"target\": 1 }"
        "  ]"
        "}";

    const char *result = sim_kernel_run(json);
    ASSERT_NOT_NULL(result);
    ASSERT_TRUE(str_contains(result, "\"success\":true"));
    ASSERT_TRUE(str_contains(result, "EFFORT_OUT") ||
                str_contains(result, "FLOW_OUT"));

    cleanup_bridge();
}
