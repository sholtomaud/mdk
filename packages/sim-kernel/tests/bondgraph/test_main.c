/* test_main.c — MDK sim-kernel Bond Graph test runner */

#include "test_harness.h"

/* ── Extern declarations from test suites ────────────────────────── */

/* test_graph.c */
extern void test_create_destroy(int *_pass, int *_fail);
extern void test_add_elements(int *_pass, int *_fail);
extern void test_connect_elements(int *_pass, int *_fail);
extern void test_growth(int *_pass, int *_fail);

/* test_scap.c */
extern void test_scap_series_rc(int *_pass, int *_fail);
extern void test_scap_series_rlc(int *_pass, int *_fail);
extern void test_scap_conflict_two_se_j0(int *_pass, int *_fail);
extern void test_scap_conflict_two_sf_j1(int *_pass, int *_fail);
extern void test_scap_dc_motor(int *_pass, int *_fail);
extern void test_scap_transformer(int *_pass, int *_fail);

/* test_json.c */
extern void test_json_parse_rc(int *_pass, int *_fail);
extern void test_json_parse_invalid(int *_pass, int *_fail);
extern void test_json_parse_bad_type(int *_pass, int *_fail);
extern void test_json_parse_bad_bond(int *_pass, int *_fail);
extern void test_json_result_ok(int *_pass, int *_fail);
extern void test_bridge_valid(int *_pass, int *_fail);
extern void test_bridge_conflict(int *_pass, int *_fail);
extern void test_bridge_bad_json(int *_pass, int *_fail);

/* test_sim.c */
extern void test_sim_rc_charging(int *_pass, int *_fail);
extern void test_sim_rc_discharging(int *_pass, int *_fail);
extern void test_sim_kernel_run_rc(int *_pass, int *_fail);
extern void test_sim_kernel_run_validate_only(int *_pass, int *_fail);
extern void test_sim_state_space_rc(int *_pass, int *_fail);

int main(void) {
    int pass = 0, fail = 0;

    printf("\n═══ MDK sim-kernel — Bond Graph Test Suite ═══\n\n");

    printf("── Graph Operations ──\n");
    RUN_TEST(test_create_destroy);
    RUN_TEST(test_add_elements);
    RUN_TEST(test_connect_elements);
    RUN_TEST(test_growth);

    printf("\n── SCAP Causality Algorithm ──\n");
    RUN_TEST(test_scap_series_rc);
    RUN_TEST(test_scap_series_rlc);
    RUN_TEST(test_scap_conflict_two_se_j0);
    RUN_TEST(test_scap_conflict_two_sf_j1);
    RUN_TEST(test_scap_dc_motor);
    RUN_TEST(test_scap_transformer);

    printf("\n── JSON I/O & WASM Bridge ──\n");
    RUN_TEST(test_json_parse_rc);
    RUN_TEST(test_json_parse_invalid);
    RUN_TEST(test_json_parse_bad_type);
    RUN_TEST(test_json_parse_bad_bond);
    RUN_TEST(test_json_result_ok);
    RUN_TEST(test_bridge_valid);
    RUN_TEST(test_bridge_conflict);
    RUN_TEST(test_bridge_bad_json);

    printf("\n── Bond Graph Simulation (Euler / RK4) ──\n");
    RUN_TEST(test_sim_rc_charging);
    RUN_TEST(test_sim_rc_discharging);
    RUN_TEST(test_sim_kernel_run_rc);
    RUN_TEST(test_sim_kernel_run_validate_only);

    printf("\n── State-Space Matrix Extraction ──\n");
    RUN_TEST(test_sim_state_space_rc);

    PRINT_RESULTS();
    return fail > 0 ? 1 : 0;
}
