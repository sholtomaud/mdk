/* json_io.c — JSON ↔ SystemGraph conversion
 *
 * Uses vendored cJSON for parsing and generation.
 * This layer is the bridge between the TypeScript world (JSON strings)
 * and the C engine (SystemGraph structs).
 */

#include "json_io.h"
#include "cJSON.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

/* ── Element type string ↔ enum mapping ──────────────────────────── */

static const struct { const char* name; ElementType type; } TYPE_MAP[] = {
    { "Se", ELEM_SE }, { "Sf", ELEM_SF },
    { "R",  ELEM_R  }, { "C",  ELEM_C  }, { "I",  ELEM_I },
    { "TF", ELEM_TF }, { "GY", ELEM_GY },
    { "J0", ELEM_J0 }, { "J1", ELEM_J1 },
    { NULL, 0 }
};

static bool parse_element_type(const char* str, ElementType* out) {
    for (int i = 0; TYPE_MAP[i].name != NULL; i++) {
        if (strcmp(str, TYPE_MAP[i].name) == 0) {
            *out = TYPE_MAP[i].type;
            return true;
        }
    }
    return false;
}

static const char* element_type_str(ElementType t) {
    for (int i = 0; TYPE_MAP[i].name != NULL; i++) {
        if (TYPE_MAP[i].type == t) return TYPE_MAP[i].name;
    }
    return "UNKNOWN";
}

static const char* causality_str(Causality c) {
    switch (c) {
        case EFFORT_OUT: return "EFFORT_OUT";
        case FLOW_OUT:   return "FLOW_OUT";
        default:         return "UNASSIGNED";
    }
}

static const char* status_str(CausalityStatus s) {
    switch (s) {
        case CAUSALITY_OK:      return "OK";
        case CAUSALITY_WARNING: return "WARNING";
        case CAUSALITY_ERROR:   return "ERROR";
        default:                return "UNKNOWN";
    }
}

/* ══════════════════════════════════════════════════════════════════
 *  JSON → SystemGraph
 * ══════════════════════════════════════════════════════════════════ */

SystemGraph* graph_from_json(const char* json_str) {
    if (!json_str) return NULL;

    cJSON* root = cJSON_Parse(json_str);
    if (!root) return NULL;

    cJSON* elements_arr = cJSON_GetObjectItemCaseSensitive(root, "elements");
    cJSON* bonds_arr    = cJSON_GetObjectItemCaseSensitive(root, "bonds");

    if (!cJSON_IsArray(elements_arr)) {
        cJSON_Delete(root);
        return NULL;
    }

    SystemGraph* graph = create_graph();
    if (!graph) { cJSON_Delete(root); return NULL; }

    /* ── Parse elements ──────────────────────────────────────────── */
    int elem_count = cJSON_GetArraySize(elements_arr);
    for (int i = 0; i < elem_count; i++) {
        cJSON* item = cJSON_GetArrayItem(elements_arr, i);

        cJSON* j_name  = cJSON_GetObjectItemCaseSensitive(item, "name");
        cJSON* j_type  = cJSON_GetObjectItemCaseSensitive(item, "type");
        cJSON* j_param = cJSON_GetObjectItemCaseSensitive(item, "parameter");

        if (!cJSON_IsString(j_type)) {
            destroy_graph(graph);
            cJSON_Delete(root);
            return NULL;
        }

        ElementType etype;
        if (!parse_element_type(j_type->valuestring, &etype)) {
            destroy_graph(graph);
            cJSON_Delete(root);
            return NULL;
        }

        const char* name = cJSON_IsString(j_name) ? j_name->valuestring : "";
        double param = cJSON_IsNumber(j_param) ? j_param->valuedouble : 0.0;

        Element* e = add_element(graph, etype, name, param);
        if (!e) {
            destroy_graph(graph);
            cJSON_Delete(root);
            return NULL;
        }
        /* Element id is assigned sequentially by add_element,
         * which matches the JSON "id" field by convention. */
    }

    /* ── Parse bonds ─────────────────────────────────────────────── */
    if (cJSON_IsArray(bonds_arr)) {
        int bond_count = cJSON_GetArraySize(bonds_arr);
        for (int i = 0; i < bond_count; i++) {
            cJSON* item = cJSON_GetArrayItem(bonds_arr, i);

            cJSON* j_src = cJSON_GetObjectItemCaseSensitive(item, "source");
            cJSON* j_tgt = cJSON_GetObjectItemCaseSensitive(item, "target");

            if (!cJSON_IsNumber(j_src) || !cJSON_IsNumber(j_tgt)) {
                destroy_graph(graph);
                cJSON_Delete(root);
                return NULL;
            }

            int src_id = j_src->valueint;
            int tgt_id = j_tgt->valueint;

            if (src_id < 0 || src_id >= graph->element_count ||
                tgt_id < 0 || tgt_id >= graph->element_count) {
                destroy_graph(graph);
                cJSON_Delete(root);
                return NULL;
            }

            Bond* b = connect_elements(graph,
                                       graph->elements[src_id],
                                       graph->elements[tgt_id]);
            if (!b) {
                destroy_graph(graph);
                cJSON_Delete(root);
                return NULL;
            }
        }
    }

    cJSON_Delete(root);
    return graph;
}

/* ══════════════════════════════════════════════════════════════════
 *  SystemGraph + CausalityReport → JSON
 * ══════════════════════════════════════════════════════════════════ */

char* result_to_json(const SystemGraph* graph,
                     const CausalityReport* report,
                     bool success) {
    cJSON* root = cJSON_CreateObject();
    if (!root) return NULL;

    /* Top-level fields */
    cJSON_AddBoolToObject(root, "success", success);
    cJSON_AddStringToObject(root, "status",
                            status_str(report->overall_status));

    /* Bonds array */
    cJSON* bonds_arr = cJSON_AddArrayToObject(root, "bonds");
    if (graph) {
        for (int i = 0; i < graph->bond_count; i++) {
            Bond* b = graph->bonds[i];
            cJSON* item = cJSON_CreateObject();
            cJSON_AddNumberToObject(item, "id", b->id);
            cJSON_AddStringToObject(item, "source_causality",
                                    causality_str(b->source_causality));
            cJSON_AddStringToObject(item, "target_causality",
                                    causality_str(b->target_causality));

            /* Include element names for readability */
            if (b->source)
                cJSON_AddStringToObject(item, "source_name", b->source->name);
            if (b->target)
                cJSON_AddStringToObject(item, "target_name", b->target->name);

            cJSON_AddItemToArray(bonds_arr, item);
        }
    }

    /* Diagnostics array */
    cJSON* diag_arr = cJSON_AddArrayToObject(root, "diagnostics");
    for (int i = 0; i < report->diagnostic_count; i++) {
        const CausalityDiagnostic* d = &report->diagnostics[i];
        cJSON* item = cJSON_CreateObject();
        cJSON_AddStringToObject(item, "status", status_str(d->status));
        cJSON_AddStringToObject(item, "message", d->message);
        cJSON_AddNumberToObject(item, "element_id", d->element_id);
        cJSON_AddNumberToObject(item, "bond_id", d->bond_id);
        cJSON_AddItemToArray(diag_arr, item);
    }

    char* json_str = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    (void)element_type_str;
    return json_str;
}

/* ══════════════════════════════════════════════════════════════════
 *  Simulation request parsing
 * ══════════════════════════════════════════════════════════════════ */

bool sim_request_parse(const char *json_str,
                       SystemGraph **graph_out,
                       BG_SimConfig *cfg_out,
                       double **initial_state_out,
                       bool *has_config_out)
{
    *graph_out         = NULL;
    *initial_state_out = NULL;
    *has_config_out    = false;

    if (!json_str) return false;

    cJSON *root = cJSON_Parse(json_str);
    if (!root) return false;

    /* Re-use graph_from_json for element/bond parsing */
    *graph_out = graph_from_json(json_str);
    if (!*graph_out) { cJSON_Delete(root); return false; }

    /* Parse "config" object */
    cJSON *cfg = cJSON_GetObjectItemCaseSensitive(root, "config");
    if (!cJSON_IsObject(cfg)) { cJSON_Delete(root); return true; }

    *has_config_out = true;
    cfg_out->t_start = 0.0;
    cfg_out->t_end   = 1.0;
    cfg_out->dt      = 0.01;
    cfg_out->method  = BG_RK4;

    cJSON *jts = cJSON_GetObjectItemCaseSensitive(cfg, "t_start");
    cJSON *jte = cJSON_GetObjectItemCaseSensitive(cfg, "t_end");
    cJSON *jdt = cJSON_GetObjectItemCaseSensitive(cfg, "dt");
    cJSON *jme = cJSON_GetObjectItemCaseSensitive(cfg, "method");

    if (cJSON_IsNumber(jts)) cfg_out->t_start = jts->valuedouble;
    if (cJSON_IsNumber(jte)) cfg_out->t_end   = jte->valuedouble;
    if (cJSON_IsNumber(jdt)) cfg_out->dt       = jdt->valuedouble;
    if (cJSON_IsString(jme) && strcmp(jme->valuestring, "euler") == 0)
        cfg_out->method = BG_EULER;

    /* Parse "initial_state": { "element_name": value } */
    int n = (*graph_out)->element_count;
    double *init = calloc((size_t)n, sizeof(double));
    if (!init) { cJSON_Delete(root); return false; }

    cJSON *is = cJSON_GetObjectItemCaseSensitive(root, "initial_state");
    if (cJSON_IsObject(is)) {
        cJSON *item;
        cJSON_ArrayForEach(item, is) {
            if (!cJSON_IsNumber(item)) continue;
            /* Find element by name */
            for (int i = 0; i < n; i++) {
                if (strcmp((*graph_out)->elements[i]->name,
                           item->string) == 0) {
                    init[i] = item->valuedouble;
                    break;
                }
            }
        }
    }

    *initial_state_out = init;
    cJSON_Delete(root);
    return true;
}

/* ══════════════════════════════════════════════════════════════════
 *  Simulation result serialisation
 * ══════════════════════════════════════════════════════════════════ */

/* Helper: build the causality sub-object (reuses result_to_json logic) */
static cJSON *causality_to_cjson(const SystemGraph *graph,
                                  const CausalityReport *report,
                                  bool success)
{
    cJSON *obj = cJSON_CreateObject();
    cJSON_AddBoolToObject(obj, "success", success);
    cJSON_AddStringToObject(obj, "status",
        report->overall_status == CAUSALITY_OK      ? "OK"      :
        report->overall_status == CAUSALITY_WARNING ? "WARNING" : "ERROR");

    cJSON *bonds_arr = cJSON_AddArrayToObject(obj, "bonds");
    if (graph) {
        for (int i = 0; i < graph->bond_count; i++) {
            Bond *b = graph->bonds[i];
            cJSON *item = cJSON_CreateObject();
            cJSON_AddNumberToObject(item, "id", b->id);
            cJSON_AddStringToObject(item, "source_causality",
                b->source_causality == EFFORT_OUT ? "EFFORT_OUT" :
                b->source_causality == FLOW_OUT   ? "FLOW_OUT"   : "UNASSIGNED");
            cJSON_AddStringToObject(item, "target_causality",
                b->target_causality == EFFORT_OUT ? "EFFORT_OUT" :
                b->target_causality == FLOW_OUT   ? "FLOW_OUT"   : "UNASSIGNED");
            if (b->source) cJSON_AddStringToObject(item, "source_name", b->source->name);
            if (b->target) cJSON_AddStringToObject(item, "target_name", b->target->name);
            cJSON_AddItemToArray(bonds_arr, item);
        }
    }

    cJSON *diag_arr = cJSON_AddArrayToObject(obj, "diagnostics");
    for (int i = 0; i < report->diagnostic_count; i++) {
        const CausalityDiagnostic *d = &report->diagnostics[i];
        cJSON *item = cJSON_CreateObject();
        cJSON_AddStringToObject(item, "status",
            d->status == CAUSALITY_OK      ? "OK"      :
            d->status == CAUSALITY_WARNING ? "WARNING" : "ERROR");
        cJSON_AddStringToObject(item, "message", d->message);
        cJSON_AddNumberToObject(item, "element_id", d->element_id);
        cJSON_AddNumberToObject(item, "bond_id",    d->bond_id);
        cJSON_AddItemToArray(diag_arr, item);
    }
    return obj;
}

char *sim_result_to_json(const SystemGraph *graph,
                         const CausalityReport *report,
                         bool causal_ok,
                         const BG_SimResult *sim,
                         const BG_StateSpace *ss)
{
    cJSON *root = cJSON_CreateObject();
    if (!root) return NULL;

    bool overall_ok = causal_ok && (!sim || sim->success);
    cJSON_AddBoolToObject(root, "success", overall_ok);
    cJSON_AddStringToObject(root, "domain", "bondgraph");
    cJSON_AddItemToObject(root, "causality",
                          causality_to_cjson(graph, report, causal_ok));

    /* state_space block */
    if (ss) {
        cJSON *ssobj = cJSON_AddObjectToObject(root, "state_space");
        cJSON_AddNumberToObject(ssobj, "state_count", ss->state_count);
        cJSON_AddNumberToObject(ssobj, "input_count",  ss->input_count);

        cJSON *snames = cJSON_AddArrayToObject(ssobj, "state_names");
        for (int i = 0; i < ss->state_count; i++)
            cJSON_AddItemToArray(snames,
                cJSON_CreateString(ss->state_names[i] ? ss->state_names[i] : ""));

        cJSON *inames = cJSON_AddArrayToObject(ssobj, "input_names");
        for (int i = 0; i < ss->input_count; i++)
            cJSON_AddItemToArray(inames,
                cJSON_CreateString(ss->input_names[i] ? ss->input_names[i] : ""));

        /* Emit each matrix as array-of-rows */
        int sc = ss->state_count, mc = ss->input_count;
        cJSON *A = cJSON_AddArrayToObject(ssobj, "A");
        for (int i = 0; i < sc; i++)
            cJSON_AddItemToArray(A,
                cJSON_CreateDoubleArray(ss->A + i * sc, sc));

        cJSON *B = cJSON_AddArrayToObject(ssobj, "B");
        for (int i = 0; i < sc; i++)
            cJSON_AddItemToArray(B,
                cJSON_CreateDoubleArray(ss->B + i * (mc > 0 ? mc : 1),
                                        mc > 0 ? mc : 1));

        cJSON *C = cJSON_AddArrayToObject(ssobj, "C");
        for (int i = 0; i < sc; i++)
            cJSON_AddItemToArray(C,
                cJSON_CreateDoubleArray(ss->C_mat + i * sc, sc));

        cJSON *D = cJSON_AddArrayToObject(ssobj, "D");
        for (int i = 0; i < sc; i++)
            cJSON_AddItemToArray(D,
                cJSON_CreateDoubleArray(ss->D + i * (mc > 0 ? mc : 1),
                                        mc > 0 ? mc : 1));
    }

    if (sim && sim->success) {
        cJSON *simobj = cJSON_AddObjectToObject(root, "simulation");

        cJSON *sv = cJSON_AddArrayToObject(simobj, "state_variables");
        for (int i = 0; i < sim->state_count; i++)
            cJSON_AddItemToArray(sv,
                cJSON_CreateString(sim->state_elem_names[i]));

        cJSON *tarr = cJSON_CreateDoubleArray(sim->times, sim->step_count);
        cJSON_AddItemToObject(simobj, "time", tarr);

        cJSON *data = cJSON_AddArrayToObject(simobj, "data");
        for (int i = 0; i < sim->state_count; i++) {
            const double *row = sim->data + (size_t)i * (size_t)sim->step_count;
            cJSON_AddItemToArray(data,
                cJSON_CreateDoubleArray(row, sim->step_count));
        }
    } else if (sim && !sim->success) {
        cJSON_AddStringToObject(root, "sim_error", sim->error_msg);
    }

    char *out = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    return out;
}
