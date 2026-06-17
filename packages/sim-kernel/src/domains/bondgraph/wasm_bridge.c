/* wasm_bridge.c — Emscripten entry points for the MDK sim-kernel.
 *
 * Exports (callable from JavaScript / TypeScript):
 *
 *   validate_bondgraph(json)  — SCAP causality check only (backward compat)
 *   sim_kernel_run(json)      — full simulation: dispatches to the correct
 *                               domain (bondgraph | odum-esl) based on the
 *                               "domain" field in the JSON input
 *   cleanup_bridge()          — free the internal result buffer
 */

#include "bondgraph.h"
#include "json_io.h"
#include "bg_solver.h"
#include "../odum-esl/gssk.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

/* Single result buffer — overwritten on each call. */
static char *g_result_buf = NULL;

static void set_result(char *s) {
    free(g_result_buf);
    g_result_buf = s;
}

static const char *error_json(const char *msg) {
    /* ~300 bytes is always enough for the fixed error template */
    size_t len = strlen(msg) + 128;
    char *buf = malloc(len);
    if (!buf) return NULL;
    snprintf(buf, len,
        "{\"success\":false,\"status\":\"ERROR\","
        "\"bonds\":[],\"diagnostics\":["
        "{\"status\":\"ERROR\",\"message\":\"%s\","
        "\"element_id\":-1,\"bond_id\":-1}]}", msg);
    set_result(buf);
    return g_result_buf;
}

/* ── validate_bondgraph (backward-compatible) ────────────────────── */

EMSCRIPTEN_KEEPALIVE
const char *validate_bondgraph(const char *json_input) {
    SystemGraph *graph = graph_from_json(json_input);
    if (!graph) return error_json("Failed to parse input JSON");

    bool ok = assign_causality(graph);
    CausalityReport rpt = get_causality_report(graph);
    set_result(result_to_json(graph, &rpt, ok));
    destroy_graph(graph);
    return g_result_buf;
}

/* ── sim_kernel_run — unified entry point ────────────────────────── */

static const char *run_bondgraph(const char *json_input) {
    SystemGraph *graph   = NULL;
    BG_SimConfig cfg     = {0};
    double *init_state   = NULL;
    bool has_cfg         = false;

    if (!sim_request_parse(json_input, &graph, &cfg, &init_state, &has_cfg)
            || !graph) {
        return error_json("Failed to parse Bond Graph request");
    }

    bool ok = assign_causality(graph);
    CausalityReport rpt = get_causality_report(graph);

    if (!has_cfg) {
        /* Validation only — no state-space or simulation */
        set_result(result_to_json(graph, &rpt, ok));
    } else {
        BG_StateSpace *ss  = ok ? bg_compute_state_space(graph) : NULL;
        BG_SimResult  *sim = ok ? bg_simulate(graph, &cfg, init_state) : NULL;
        set_result(sim_result_to_json(graph, &rpt, ok, sim, ss));
        bg_sim_result_free(sim);
        bg_state_space_free(ss);
    }

    free(init_state);
    destroy_graph(graph);
    return g_result_buf;
}

static const char *run_odum(const char *json_input) {
    GSSK_Instance *inst = NULL;
    GSSK_Status status  = GSSK_Init(json_input, &inst);
    if (status != GSSK_SUCCESS) {
        const char *msg = inst ? GSSK_GetErrorDescription(inst)
                               : "GSSK_Init failed";
        const char *r = error_json(msg);
        if (inst) GSSK_Free(inst);
        return r;
    }

    double t     = GSSK_GetTStart(inst);
    double t_end = GSSK_GetTEnd(inst);
    double dt    = GSSK_GetDt(inst);
    size_t n     = GSSK_GetStateSize(inst);

    /* Build JSON simulation result compatible with the GSSK CLI CSV format */
    /* Approximate step count */
    size_t steps = (dt > 0.0 && (t_end - t) > 0.0)
                   ? (size_t)((t_end - t) / dt) + 2 : 1;

    /* Allocate flat arrays: times[steps], data[n * steps] */
    double *times = malloc(steps * sizeof(double));
    double *data  = calloc(n * steps, sizeof(double));
    if (!times || !data) {
        free(times); free(data); GSSK_Free(inst);
        return error_json("OOM during Odum ESL simulation");
    }

    size_t recorded = 0;
    while (t <= t_end + dt * 1e-9 && recorded < steps) {
        const double *state = GSSK_GetState(inst);
        times[recorded] = t;
        for (size_t i = 0; i < n; i++)
            data[i * steps + recorded] = state[i];
        recorded++;
        if (GSSK_Step(inst, dt) != GSSK_SUCCESS) break;
        t += dt;
    }

    /* Serialise to JSON */
    char *node_names_buf = malloc(n * 64);
    if (!node_names_buf) {
        free(times); free(data); GSSK_Free(inst);
        return error_json("OOM during Odum ESL serialisation");
    }

    /* Build a simple JSON result */
    /* For large results, use cJSON */
    /* We'll construct it directly to avoid a cJSON dependency here */
    /* Actually, include cJSON for correctness */
#include "cJSON.h"
    cJSON *root = cJSON_CreateObject();
    cJSON_AddBoolToObject(root, "success", true);
    cJSON_AddStringToObject(root, "domain", "odum-esl");

    cJSON *simobj = cJSON_AddObjectToObject(root, "simulation");

    /* state_variables */
    cJSON *sv = cJSON_AddArrayToObject(simobj, "state_variables");
    for (size_t i = 0; i < n; i++) {
        const char *id = GSSK_GetNodeID(inst, i);
        cJSON_AddItemToArray(sv, cJSON_CreateString(id ? id : "unknown"));
    }

    cJSON *tarr = cJSON_CreateDoubleArray(times, (int)recorded);
    cJSON_AddItemToObject(simobj, "time", tarr);

    cJSON *darr = cJSON_AddArrayToObject(simobj, "data");
    for (size_t i = 0; i < n; i++) {
        cJSON_AddItemToArray(darr,
            cJSON_CreateDoubleArray(data + i * steps, (int)recorded));
    }

    char *out = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);

    free(times); free(data); free(node_names_buf);
    GSSK_Free(inst);
    set_result(out);
    return g_result_buf;
}

EMSCRIPTEN_KEEPALIVE
const char *sim_kernel_run(const char *json_input) {
    if (!json_input) return error_json("No input provided");

    /* Peek at the domain field without a full parse */
    const char *domain_tag = strstr(json_input, "\"domain\"");
    bool is_odum = domain_tag && strstr(domain_tag, "odum-esl");

    return is_odum ? run_odum(json_input) : run_bondgraph(json_input);
}

/* ── cleanup ─────────────────────────────────────────────────────── */

EMSCRIPTEN_KEEPALIVE
void cleanup_bridge(void) {
    free(g_result_buf);
    g_result_buf = NULL;
}
