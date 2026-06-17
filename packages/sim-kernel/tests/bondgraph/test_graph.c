/* test_graph.c — Unit tests for graph construction / destruction */

#include "test_harness.h"
#include "bondgraph.h"

/* ── Test: create and destroy an empty graph ───────────────────── */
void test_create_destroy(int *_pass, int *_fail) {
    SystemGraph* g = create_graph();
    ASSERT_NOT_NULL(g);
    ASSERT_EQ(g->element_count, 0);
    ASSERT_EQ(g->bond_count, 0);
    destroy_graph(g);
}

/* ── Test: add elements ────────────────────────────────────────── */
void test_add_elements(int *_pass, int *_fail) {
    SystemGraph* g = create_graph();

    Element* se = add_element(g, ELEM_SE, "Battery", 12.0);
    ASSERT_NOT_NULL(se);
    ASSERT_EQ(se->id, 0);
    ASSERT_EQ(se->type, ELEM_SE);
    ASSERT_STR_EQ(se->name, "Battery");
    ASSERT_EQ(g->element_count, 1);

    Element* r = add_element(g, ELEM_R, "Friction", 1.5);
    ASSERT_NOT_NULL(r);
    ASSERT_EQ(r->id, 1);
    ASSERT_EQ(g->element_count, 2);

    destroy_graph(g);
}

/* ── Test: connect elements creates a bond ─────────────────────── */
void test_connect_elements(int *_pass, int *_fail) {
    SystemGraph* g = create_graph();

    Element* se = add_element(g, ELEM_SE, "Vsrc", 12.0);
    Element* j1 = add_element(g, ELEM_J1, "J1", 0.0);

    Bond* b = connect_elements(g, se, j1);
    ASSERT_NOT_NULL(b);
    ASSERT_EQ(b->id, 0);
    ASSERT_EQ(b->source, se);
    ASSERT_EQ(b->target, j1);
    ASSERT_EQ(b->source_causality, UNASSIGNED);
    ASSERT_EQ(b->target_causality, UNASSIGNED);
    ASSERT_EQ(g->bond_count, 1);

    /* Both elements should reference the bond */
    ASSERT_EQ(se->bond_count, 1);
    ASSERT_EQ(j1->bond_count, 1);
    ASSERT_EQ(se->connected_bonds[0], b);
    ASSERT_EQ(j1->connected_bonds[0], b);

    destroy_graph(g);
}

/* ── Test: array growth (add many elements) ────────────────────── */
void test_growth(int *_pass, int *_fail) {
    SystemGraph* g = create_graph();

    for (int i = 0; i < 64; i++) {
        char name[16];
        snprintf(name, sizeof(name), "E%d", i);
        Element* e = add_element(g, ELEM_R, name, (double)i);
        ASSERT_NOT_NULL(e);
        ASSERT_EQ(e->id, i);
    }
    ASSERT_EQ(g->element_count, 64);

    /* Chain-connect all of them */
    for (int i = 0; i < 63; i++) {
        Bond* b = connect_elements(g, g->elements[i], g->elements[i + 1]);
        ASSERT_NOT_NULL(b);
    }
    ASSERT_EQ(g->bond_count, 63);

    destroy_graph(g);
}
