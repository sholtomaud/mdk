#include "gssk.h"
#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <string.h>

static int g_fail = 0;

#define CHECK(cond) \
    do { if (!(cond)) { fprintf(stderr, "  FAIL: %s  (%s:%d)\n", #cond, __FILE__, __LINE__); g_fail++; } } while(0)

static void test_calibration(void) {
    printf("Testing Parameter Calibration...\n");

    const char *model_json =
        "{"
        "\"nodes\": ["
        "  {\"id\": \"A\", \"type\": \"source\", \"value\": 10.0},"
        "  {\"id\": \"B\", \"type\": \"storage\", \"value\": 0.0}"
        "],"
        "\"edges\": ["
        "  {\"origin\": \"A\", \"target\": \"B\", \"logic\": \"linear\", \"params\": {\"k\": 0.5}}"
        "],"
        "\"config\": {\"t_start\": 0, \"t_end\": 10, \"dt\": 1.0}"
        "}";

    GSSK_Instance *inst = NULL;
    GSSK_Status init_status = GSSK_Init(model_json, &inst);
    CHECK(init_status == GSSK_SUCCESS);
    if (inst == NULL) return;

    printf("  Initial k: %f\n", GSSK_GetEdgeK(inst, 0));

    GSSK_Observation obs_data[] = {
        {5.0, 40.0},   /* 10 * 0.8 * 5 = 40  */
        {10.0, 80.0}   /* 10 * 0.8 * 10 = 80 */
    };

    GSSK_NodeObservations node_obs = {
        .node_id = "B",
        .data = obs_data,
        .count = 2
    };

    GSSK_Status cal_status = GSSK_Calibrate(inst, &node_obs, 1, 100);
    CHECK(cal_status == GSSK_SUCCESS);

    double calibrated_k = GSSK_GetEdgeK(inst, 0);
    printf("  Calibrated k: %f (Expected ~0.8)\n", calibrated_k);
    CHECK(fabs(calibrated_k - 0.8) < 0.1);

    GSSK_Free(inst);
    printf("  Calibration test PASSED\n");
}

static void test_ensemble(void) {
    printf("Testing Ensemble Forecasting...\n");

    const char *model_json =
        "{"
        "\"nodes\": ["
        "  {\"id\": \"Source\", \"type\": \"source\", \"value\": 10.0},"
        "  {\"id\": \"Stock\",  \"type\": \"storage\", \"value\": 0.0}"
        "],"
        "\"edges\": ["
        "  {\"origin\": \"Source\", \"target\": \"Stock\", \"logic\": \"linear\", \"params\": {\"k\": 1.0}}"
        "],"
        "\"config\": {\"t_start\": 0, \"t_end\": 10, \"dt\": 1.0}"
        "}";

    GSSK_Instance *inst = NULL;
    GSSK_Status init_status = GSSK_Init(model_json, &inst);
    CHECK(init_status == GSSK_SUCCESS);
    if (inst == NULL) return;

    srand(42);
    GSSK_EnsembleResult *res = GSSK_EnsembleForecast(inst, 10, 0.2);
    CHECK(res != NULL);
    if (res == NULL) { GSSK_Free(inst); return; }

    CHECK(res->node_count == 2);
    CHECK(res->step_count == 11);

    size_t stock_idx = 1;
    size_t final_step_idx = 10 * res->node_count + stock_idx;

    printf("  t=10 Mean: %f, Min: %f, Max: %f\n",
           res->mean_envelope[final_step_idx],
           res->min_envelope[final_step_idx],
           res->max_envelope[final_step_idx]);

    CHECK(res->max_envelope[final_step_idx] >= res->mean_envelope[final_step_idx]);
    CHECK(res->mean_envelope[final_step_idx] >= res->min_envelope[final_step_idx]);

    GSSK_FreeEnsembleResult(res);
    GSSK_Free(inst);
    printf("  Ensemble test PASSED\n");
}

int main(void) {
    test_calibration();
    test_ensemble();

    if (g_fail > 0) {
        printf("\n── Results: %d failed ──\n", g_fail);
        return 1;
    }
    printf("\n── Results: all passed ──\n");
    return 0;
}
