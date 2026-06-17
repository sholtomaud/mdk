/* test_kernel_integration.c — Integration test: sim_kernel_run() Odum ESL path.
 *
 * Verifies that the unified sim_kernel_run() entry point (wasm_bridge.c)
 * correctly dispatches to the Odum ESL domain and returns a well-formed
 * JSON simulation result.
 */

#include "gssk.h"
#include <stdio.h>
#include <string.h>

/* sim_kernel_run / cleanup_bridge live in wasm_bridge.c (simkernel_bondgraph) */
extern const char *sim_kernel_run(const char *json_input);
extern void        cleanup_bridge(void);

static int g_fail = 0;

#define CHECK(cond) \
    do { if (!(cond)) { \
        fprintf(stderr, "  FAIL: %s  (%s:%d)\n", #cond, __FILE__, __LINE__); \
        g_fail++; \
    } } while (0)

static int str_has(const char *h, const char *n) {
    return h && n && strstr(h, n) != NULL;
}

/* ── Test 1: simple source→storage model ────────────────────────── */

static void test_odum_esl_simple(void) {
    printf("test_sim_kernel_run_odum_simple\n");

    const char *json =
        "{"
        "  \"domain\": \"odum-esl\","
        "  \"nodes\": ["
        "    { \"id\": \"sun\",   \"type\": \"source\",  \"value\": 100.0 },"
        "    { \"id\": \"grass\", \"type\": \"storage\", \"value\": 10.0 }"
        "  ],"
        "  \"edges\": ["
        "    { \"origin\": \"sun\", \"target\": \"grass\","
        "      \"logic\": \"linear\", \"params\": { \"k\": 0.1 } }"
        "  ],"
        "  \"config\": {"
        "    \"t_start\": 0.0, \"t_end\": 5.0, \"dt\": 0.1, \"method\": \"euler\""
        "  }"
        "}";

    const char *result = sim_kernel_run(json);
    CHECK(result != NULL);
    CHECK(str_has(result, "\"success\":true"));
    CHECK(str_has(result, "\"domain\":\"odum-esl\""));
    CHECK(str_has(result, "\"simulation\""));
    CHECK(str_has(result, "\"state_variables\""));
    CHECK(str_has(result, "\"time\""));
    CHECK(str_has(result, "\"data\""));
    CHECK(str_has(result, "grass"));

    cleanup_bridge();
    printf("  PASS\n");
}

/* ── Test 2: decay model via RK4 ────────────────────────────────── */

static void test_odum_esl_decay_rk4(void) {
    printf("test_sim_kernel_run_odum_decay_rk4\n");

    /* dX/dt = -0.5·X, X(0)=100 → X(2) = 100·e^{-1} ≈ 36.79 */
    const char *json =
        "{"
        "  \"domain\": \"odum-esl\","
        "  \"nodes\": ["
        "    { \"id\": \"X\",    \"type\": \"storage\", \"value\": 100.0 },"
        "    { \"id\": \"sink\", \"type\": \"sink\",    \"value\": 0.0   }"
        "  ],"
        "  \"edges\": ["
        "    { \"origin\": \"X\", \"target\": \"sink\","
        "      \"logic\": \"linear\", \"params\": { \"k\": 0.5 } }"
        "  ],"
        "  \"config\": {"
        "    \"t_start\": 0.0, \"t_end\": 2.0, \"dt\": 0.01, \"method\": \"rk4\""
        "  }"
        "}";

    const char *result = sim_kernel_run(json);
    CHECK(result != NULL);
    CHECK(str_has(result, "\"success\":true"));
    CHECK(str_has(result, "\"domain\":\"odum-esl\""));
    CHECK(str_has(result, "\"X\""));
    CHECK(str_has(result, "\"time\""));
    CHECK(str_has(result, "\"data\""));

    cleanup_bridge();
    printf("  PASS\n");
}

/* ── Test 3: error path — bad JSON ──────────────────────────────── */

static void test_odum_esl_bad_json(void) {
    printf("test_sim_kernel_run_odum_bad_json\n");

    const char *result = sim_kernel_run("{\"domain\":\"odum-esl\", INVALID}");
    CHECK(result != NULL);
    CHECK(str_has(result, "\"success\":false"));

    cleanup_bridge();
    printf("  PASS\n");
}

/* ── main ────────────────────────────────────────────────────────── */

int main(void) {
    printf("\n═══ MDK sim-kernel — Kernel Integration Tests ═══\n\n");
    printf("── Odum ESL end-to-end via sim_kernel_run() ──\n");

    test_odum_esl_simple();
    test_odum_esl_decay_rk4();
    test_odum_esl_bad_json();

    if (g_fail > 0) {
        printf("\n── Results: %d failed ──\n", g_fail);
        return 1;
    }
    printf("\n── Results: all passed ──\n");
    return 0;
}
