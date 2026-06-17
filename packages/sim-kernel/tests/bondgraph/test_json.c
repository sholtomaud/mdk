/* test_json.c — Unit tests for the JSON I/O layer and WASM bridge */

#include "test_harness.h"
#include "bondgraph.h"
#include "json_io.h"
#include <stdlib.h>
#include <string.h>

/* Declared in wasm_bridge.c */
extern const char* validate_bondgraph(const char* json_input);
extern void cleanup_bridge(void);

/* ── Helper: check if a string contains a substring ─────────────── */
static bool str_contains(const char* haystack, const char* needle) {
    return haystack && needle && strstr(haystack, needle) != NULL;
}

/* ════════════════════════════════════════════════════════════════
 *  graph_from_json tests
 * ════════════════════════════════════════════════════════════════ */

/* ── Test: parse a valid series RC circuit ──────────────────────── */
void test_json_parse_rc(int *_pass, int *_fail) {
    const char* json =
        "{"
        "  \"elements\": ["
        "    { \"id\": 0, \"name\": \"Vsrc\", \"type\": \"Se\", \"parameter\": 12.0 },"
        "    { \"id\": 1, \"name\": \"J1\",   \"type\": \"J1\", \"parameter\": 0.0 },"
        "    { \"id\": 2, \"name\": \"R1\",   \"type\": \"R\",  \"parameter\": 100.0 },"
        "    { \"id\": 3, \"name\": \"C1\",   \"type\": \"C\",  \"parameter\": 0.001 }"
        "  ],"
        "  \"bonds\": ["
        "    { \"id\": 0, \"source\": 0, \"target\": 1 },"
        "    { \"id\": 1, \"source\": 1, \"target\": 2 },"
        "    { \"id\": 2, \"source\": 1, \"target\": 3 }"
        "  ]"
        "}";

    SystemGraph* g = graph_from_json(json);
    ASSERT_NOT_NULL(g);
    ASSERT_EQ(g->element_count, 4);
    ASSERT_EQ(g->bond_count, 3);

    /* Verify element types */
    ASSERT_EQ(g->elements[0]->type, ELEM_SE);
    ASSERT_EQ(g->elements[1]->type, ELEM_J1);
    ASSERT_EQ(g->elements[2]->type, ELEM_R);
    ASSERT_EQ(g->elements[3]->type, ELEM_C);

    /* Verify names */
    ASSERT_STR_EQ(g->elements[0]->name, "Vsrc");

    /* Verify bonds connect the right elements */
    ASSERT_EQ(g->bonds[0]->source, g->elements[0]);
    ASSERT_EQ(g->bonds[0]->target, g->elements[1]);

    destroy_graph(g);
}

/* ── Test: invalid JSON returns NULL ───────────────────────────── */
void test_json_parse_invalid(int *_pass, int *_fail) {
    ASSERT_TRUE(graph_from_json(NULL) == NULL);
    ASSERT_TRUE(graph_from_json("") == NULL);
    ASSERT_TRUE(graph_from_json("{not valid json}") == NULL);
    ASSERT_TRUE(graph_from_json("{\"elements\": \"not array\"}") == NULL);
}

/* ── Test: invalid element type returns NULL ───────────────────── */
void test_json_parse_bad_type(int *_pass, int *_fail) {
    const char* json =
        "{"
        "  \"elements\": ["
        "    { \"id\": 0, \"name\": \"X\", \"type\": \"INVALID\", \"parameter\": 0.0 }"
        "  ],"
        "  \"bonds\": []"
        "}";

    ASSERT_TRUE(graph_from_json(json) == NULL);
}

/* ── Test: out-of-range bond target returns NULL ──────────────── */
void test_json_parse_bad_bond(int *_pass, int *_fail) {
    const char* json =
        "{"
        "  \"elements\": ["
        "    { \"id\": 0, \"name\": \"X\", \"type\": \"Se\", \"parameter\": 0.0 }"
        "  ],"
        "  \"bonds\": ["
        "    { \"id\": 0, \"source\": 0, \"target\": 99 }"
        "  ]"
        "}";

    ASSERT_TRUE(graph_from_json(json) == NULL);
}

/* ════════════════════════════════════════════════════════════════
 *  result_to_json tests
 * ════════════════════════════════════════════════════════════════ */

/* ── Test: serialize a successful result ──────────────────────── */
void test_json_result_ok(int *_pass, int *_fail) {
    const char* json =
        "{"
        "  \"elements\": ["
        "    { \"id\": 0, \"name\": \"Vsrc\", \"type\": \"Se\", \"parameter\": 12.0 },"
        "    { \"id\": 1, \"name\": \"J1\",   \"type\": \"J1\", \"parameter\": 0.0 },"
        "    { \"id\": 2, \"name\": \"R1\",   \"type\": \"R\",  \"parameter\": 100.0 },"
        "    { \"id\": 3, \"name\": \"C1\",   \"type\": \"C\",  \"parameter\": 0.001 }"
        "  ],"
        "  \"bonds\": ["
        "    { \"id\": 0, \"source\": 0, \"target\": 1 },"
        "    { \"id\": 1, \"source\": 1, \"target\": 2 },"
        "    { \"id\": 2, \"source\": 1, \"target\": 3 }"
        "  ]"
        "}";

    SystemGraph* g = graph_from_json(json);
    ASSERT_NOT_NULL(g);

    bool ok = assign_causality(g);
    ASSERT_TRUE(ok);

    CausalityReport rpt = get_causality_report(g);
    char* result = result_to_json(g, &rpt, ok);
    ASSERT_NOT_NULL(result);

    /* Verify key fields are present */
    ASSERT_TRUE(str_contains(result, "\"success\":true"));
    ASSERT_TRUE(str_contains(result, "EFFORT_OUT") ||
                str_contains(result, "FLOW_OUT"));
    ASSERT_TRUE(str_contains(result, "\"bonds\""));

    free(result);
    destroy_graph(g);
}

/* ════════════════════════════════════════════════════════════════
 *  Full pipeline via validate_bondgraph (WASM bridge)
 * ════════════════════════════════════════════════════════════════ */

/* ── Test: valid RC circuit through the bridge ──────────────────── */
void test_bridge_valid(int *_pass, int *_fail) {
    const char* json =
        "{"
        "  \"elements\": ["
        "    { \"id\": 0, \"name\": \"Vsrc\", \"type\": \"Se\", \"parameter\": 12.0 },"
        "    { \"id\": 1, \"name\": \"J1\",   \"type\": \"J1\", \"parameter\": 0.0 },"
        "    { \"id\": 2, \"name\": \"R1\",   \"type\": \"R\",  \"parameter\": 100.0 },"
        "    { \"id\": 3, \"name\": \"C1\",   \"type\": \"C\",  \"parameter\": 0.001 }"
        "  ],"
        "  \"bonds\": ["
        "    { \"id\": 0, \"source\": 0, \"target\": 1 },"
        "    { \"id\": 1, \"source\": 1, \"target\": 2 },"
        "    { \"id\": 2, \"source\": 1, \"target\": 3 }"
        "  ]"
        "}";

    const char* result = validate_bondgraph(json);
    ASSERT_NOT_NULL(result);
    ASSERT_TRUE(str_contains(result, "\"success\":true"));
    ASSERT_TRUE(str_contains(result, "\"status\":\"OK\"") ||
                str_contains(result, "\"status\":\"WARNING\""));
}

/* ── Test: conflict case through the bridge ─────────────────────── */
void test_bridge_conflict(int *_pass, int *_fail) {
    const char* json =
        "{"
        "  \"elements\": ["
        "    { \"id\": 0, \"name\": \"V1\", \"type\": \"Se\", \"parameter\": 12.0 },"
        "    { \"id\": 1, \"name\": \"V2\", \"type\": \"Se\", \"parameter\": 5.0 },"
        "    { \"id\": 2, \"name\": \"J0\", \"type\": \"J0\", \"parameter\": 0.0 }"
        "  ],"
        "  \"bonds\": ["
        "    { \"id\": 0, \"source\": 0, \"target\": 2 },"
        "    { \"id\": 1, \"source\": 1, \"target\": 2 }"
        "  ]"
        "}";

    const char* result = validate_bondgraph(json);
    ASSERT_NOT_NULL(result);
    ASSERT_TRUE(str_contains(result, "\"success\":false"));
    ASSERT_TRUE(str_contains(result, "\"status\":\"ERROR\""));
}

/* ── Test: invalid JSON through the bridge ──────────────────────── */
void test_bridge_bad_json(int *_pass, int *_fail) {
    const char* result = validate_bondgraph("not json at all");
    ASSERT_NOT_NULL(result);
    ASSERT_TRUE(str_contains(result, "\"success\":false"));
    ASSERT_TRUE(str_contains(result, "Failed to parse"));

    cleanup_bridge();
}
