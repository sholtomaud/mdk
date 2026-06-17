/* bondgraph.c — MDK Core Engine
 *
 * Implements:
 *   1. Graph construction / destruction
 *   2. Sequential Causality Assignment Procedure (SCAP)
 *   3. Rich causality diagnostics
 *
 * Reference: Karnopp, Margolis & Rosenberg — "System Dynamics:
 *            Modeling, Simulation, and Control of Mechatronic Systems"
 *
 * Convention used throughout:
 *   - EFFORT_OUT at an element's end of a bond means that element
 *     DETERMINES effort on that bond.
 *   - FLOW_OUT  means that element DETERMINES flow.
 *   - A valid bond always has one end EFFORT_OUT, the other FLOW_OUT.
 */

#include "bondgraph.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

/* ── Internal constants ──────────────────────────────────────────── */

#define INITIAL_CAPACITY 16

/* ── Module-level diagnostics (populated by assign_causality) ────── */

static CausalityReport g_report;

static void report_clear(void) {
    memset(&g_report, 0, sizeof(g_report));
    g_report.overall_status = CAUSALITY_OK;
}

static void report_add(CausalityStatus status, const char* msg,
                       int elem_id, int bond_id) {
    if (g_report.diagnostic_count < MAX_WARNINGS) {
        CausalityDiagnostic* d =
            &g_report.diagnostics[g_report.diagnostic_count++];
        d->status     = status;
        d->element_id = elem_id;
        d->bond_id    = bond_id;
        snprintf(d->message, sizeof(d->message), "%s", msg);
    }
    if (status > g_report.overall_status)
        g_report.overall_status = status;
}

/* ══════════════════════════════════════════════════════════════════
 *  Graph Construction / Destruction
 * ══════════════════════════════════════════════════════════════════ */

SystemGraph* create_graph(void) {
    SystemGraph* g = calloc(1, sizeof(SystemGraph));
    if (!g) return NULL;
    g->element_capacity = INITIAL_CAPACITY;
    g->elements = calloc((size_t)g->element_capacity, sizeof(Element*));
    g->bond_capacity = INITIAL_CAPACITY;
    g->bonds = calloc((size_t)g->bond_capacity, sizeof(Bond*));
    return g;
}

void destroy_graph(SystemGraph* graph) {
    if (!graph) return;
    for (int i = 0; i < graph->element_count; i++) {
        free(graph->elements[i]->connected_bonds);
        free(graph->elements[i]);
    }
    free(graph->elements);
    for (int i = 0; i < graph->bond_count; i++)
        free(graph->bonds[i]);
    free(graph->bonds);
    free(graph);
}

Element* add_element(SystemGraph* graph, ElementType type,
                     const char* name, double param) {
    if (!graph) return NULL;

    /* Grow array if needed */
    if (graph->element_count >= graph->element_capacity) {
        graph->element_capacity *= 2;
        graph->elements = realloc(graph->elements,
            (size_t)graph->element_capacity * sizeof(Element*));
    }

    Element* e = calloc(1, sizeof(Element));
    if (!e) return NULL;
    e->id = graph->element_count;
    snprintf(e->name, sizeof(e->name), "%s", name ? name : "");
    e->type            = type;
    e->parameter_value = param;
    e->bond_capacity   = 4;
    e->connected_bonds = calloc((size_t)e->bond_capacity, sizeof(Bond*));

    graph->elements[graph->element_count++] = e;
    return e;
}

/* Helper: append a bond pointer to an element's connected_bonds */
static void element_attach_bond(Element* e, Bond* b) {
    if (e->bond_count >= e->bond_capacity) {
        e->bond_capacity *= 2;
        e->connected_bonds = realloc(e->connected_bonds,
            (size_t)e->bond_capacity * sizeof(Bond*));
    }
    e->connected_bonds[e->bond_count++] = b;
}

Bond* connect_elements(SystemGraph* graph, Element* src, Element* target) {
    if (!graph || !src || !target) return NULL;

    /* Grow array if needed */
    if (graph->bond_count >= graph->bond_capacity) {
        graph->bond_capacity *= 2;
        graph->bonds = realloc(graph->bonds,
            (size_t)graph->bond_capacity * sizeof(Bond*));
    }

    Bond* b = calloc(1, sizeof(Bond));
    if (!b) return NULL;
    b->id               = graph->bond_count;
    b->source           = src;
    b->target           = target;
    b->source_causality = UNASSIGNED;
    b->target_causality = UNASSIGNED;

    element_attach_bond(src, b);
    element_attach_bond(target, b);

    graph->bonds[graph->bond_count++] = b;
    return b;
}

/* ══════════════════════════════════════════════════════════════════
 *  Causality Helpers
 * ══════════════════════════════════════════════════════════════════ */

static Causality complement(Causality c) {
    if (c == EFFORT_OUT) return FLOW_OUT;
    if (c == FLOW_OUT)   return EFFORT_OUT;
    return UNASSIGNED;
}

/* Get / set causality at a specific element's end of a bond. */
static Causality get_caus(const Bond* b, const Element* e) {
    if (b->source == e) return b->source_causality;
    if (b->target == e) return b->target_causality;
    return UNASSIGNED;
}

static void set_caus(Bond* b, const Element* e, Causality c) {
    if (b->source == e) b->source_causality = c;
    else                b->target_causality = c;
}

static Element* other_element(const Bond* b, const Element* e) {
    return (b->source == e) ? b->target : b->source;
}

/*  Assign causality at one end of a bond.  The complementary end is
 *  set automatically.  Returns false on conflict.                   */
static bool assign_bond_from(Bond* b, const Element* e, Causality c) {
    Causality existing = get_caus(b, e);
    if (existing != UNASSIGNED)
        return existing == c;           /* conflict if different */

    Causality other_existing = get_caus(b, other_element(b, e));
    Causality comp = complement(c);
    if (other_existing != UNASSIGNED && other_existing != comp)
        return false;                   /* conflict */

    set_caus(b, e, c);
    set_caus(b, other_element(b, e), comp);
    return true;
}

static bool bond_is_assigned(const Bond* b) {
    return b->source_causality != UNASSIGNED &&
           b->target_causality != UNASSIGNED;
}

/* ══════════════════════════════════════════════════════════════════
 *  Junction / TF / GY Propagation
 *
 *  Each function returns:
 *    1  = made at least one new assignment (progress)
 *    0  = nothing to do
 *   -1  = irreconcilable conflict
 * ══════════════════════════════════════════════════════════════════ */

/*
 * 0-junction (common effort):
 *   Exactly ONE bond carries effort INTO the junction
 *   (the junction's end is FLOW_OUT on that bond — it outputs flow).
 *   All other bonds: the junction's end is EFFORT_OUT.
 */
static int propagate_j0(Element* j) {
    int effort_in_count = 0;        /* bonds where junction FLOW_OUT */
    int unassigned_count = 0;
    Bond* unassigned[128];
    int progress = 0;

    for (int i = 0; i < j->bond_count; i++) {
        Bond* b = j->connected_bonds[i];
        Causality jc = get_caus(b, j);
        if (jc == FLOW_OUT)   effort_in_count++;
        else if (jc == EFFORT_OUT) { /* fine — junction broadcasts effort */ }
        else                  unassigned[unassigned_count++] = b;
    }

    if (effort_in_count > 1) {
        char msg[256];
        snprintf(msg, sizeof(msg),
                 "Conflict at 0-junction '%s': multiple effort sources",
                 j->name);
        report_add(CAUSALITY_ERROR, msg, j->id, -1);
        return -1;
    }

    if (effort_in_count == 1) {
        /* All remaining unassigned bonds: junction outputs effort */
        for (int i = 0; i < unassigned_count; i++) {
            if (!assign_bond_from(unassigned[i], j, EFFORT_OUT)) return -1;
            progress = 1;
        }
    } else if (effort_in_count == 0 && unassigned_count == 1) {
        /* Last unassigned bond MUST be the effort-determining bond */
        if (!assign_bond_from(unassigned[0], j, FLOW_OUT)) return -1;
        progress = 1;
    }

    return progress;
}

/*
 * 1-junction (common flow):
 *   Exactly ONE bond carries flow INTO the junction
 *   (the junction's end is EFFORT_OUT on that bond — it outputs effort).
 *   All other bonds: the junction's end is FLOW_OUT.
 */
static int propagate_j1(Element* j) {
    int flow_in_count = 0;
    int unassigned_count = 0;
    Bond* unassigned[128];
    int progress = 0;

    for (int i = 0; i < j->bond_count; i++) {
        Bond* b = j->connected_bonds[i];
        Causality jc = get_caus(b, j);
        if (jc == EFFORT_OUT) flow_in_count++;
        else if (jc == FLOW_OUT) { /* fine */ }
        else                  unassigned[unassigned_count++] = b;
    }

    if (flow_in_count > 1) {
        char msg[256];
        snprintf(msg, sizeof(msg),
                 "Conflict at 1-junction '%s': multiple flow sources",
                 j->name);
        report_add(CAUSALITY_ERROR, msg, j->id, -1);
        return -1;
    }

    if (flow_in_count == 1) {
        for (int i = 0; i < unassigned_count; i++) {
            if (!assign_bond_from(unassigned[i], j, FLOW_OUT)) return -1;
            progress = 1;
        }
    } else if (flow_in_count == 0 && unassigned_count == 1) {
        if (!assign_bond_from(unassigned[0], j, EFFORT_OUT)) return -1;
        progress = 1;
    }

    return progress;
}

/*
 * Transformer (TF):  effort causality propagates THROUGH.
 *   If TF receives effort on one bond → TF outputs effort on the other.
 *   If TF receives flow on one bond   → TF outputs flow on the other.
 */
static int propagate_tf(Element* tf) {
    if (tf->bond_count != 2) return 0;

    Bond* b0 = tf->connected_bonds[0];
    Bond* b1 = tf->connected_bonds[1];
    Causality c0 = get_caus(b0, tf);
    Causality c1 = get_caus(b1, tf);
    int progress = 0;

    if (c0 != UNASSIGNED && c1 == UNASSIGNED) {
        /* TF receives X on b0 → TF outputs X on b1 */
        Causality out = (c0 == EFFORT_OUT) ? FLOW_OUT : EFFORT_OUT;
        if (!assign_bond_from(b1, tf, out)) return -1;
        progress = 1;
    } else if (c1 != UNASSIGNED && c0 == UNASSIGNED) {
        Causality out = (c1 == EFFORT_OUT) ? FLOW_OUT : EFFORT_OUT;
        if (!assign_bond_from(b0, tf, out)) return -1;
        progress = 1;
    }
    return progress;
}

/*
 * Gyrator (GY):  causality CROSSES.
 *   If GY receives effort on one bond → GY outputs effort on the other.
 *   (effort in → flow known on other side, but from the junction's
 *    perspective the GY end outputs the SAME type as what it received.)
 *
 *  GY constitutive:  e₁ = r·f₂,  e₂ = r·f₁
 *   If element on bond0 sets effort (TF end = FLOW_OUT, receives effort):
 *     e₁ known → f₂ = e₁/r → GY sets flow on bond1 → GY end = FLOW_OUT
 *   So GY end on bond0 = FLOW_OUT  →  GY end on bond1 = FLOW_OUT  (same!)
 */
static int propagate_gy(Element* gy) {
    if (gy->bond_count != 2) return 0;

    Bond* b0 = gy->connected_bonds[0];
    Bond* b1 = gy->connected_bonds[1];
    Causality c0 = get_caus(b0, gy);
    Causality c1 = get_caus(b1, gy);
    int progress = 0;

    if (c0 != UNASSIGNED && c1 == UNASSIGNED) {
        /* GY: same causality type on both ends */
        if (!assign_bond_from(b1, gy, c0)) return -1;
        progress = 1;
    } else if (c1 != UNASSIGNED && c0 == UNASSIGNED) {
        if (!assign_bond_from(b0, gy, c1)) return -1;
        progress = 1;
    }
    return progress;
}

/* ── Fixed-point propagation through all junctions/TF/GY ────────── */

static int propagate_all(SystemGraph* graph) {
    int progress = 0;
    for (int i = 0; i < graph->element_count; i++) {
        Element* e = graph->elements[i];
        int r = 0;
        switch (e->type) {
            case ELEM_J0: r = propagate_j0(e); break;
            case ELEM_J1: r = propagate_j1(e); break;
            case ELEM_TF: r = propagate_tf(e); break;
            case ELEM_GY: r = propagate_gy(e); break;
            default: continue;
        }
        if (r == -1) return -1;
        if (r ==  1) progress = 1;
    }
    return progress;
}

static bool propagate_until_stable(SystemGraph* graph) {
    int r;
    do {
        r = propagate_all(graph);
        if (r == -1) return false;
    } while (r == 1);
    return true;
}

/* ══════════════════════════════════════════════════════════════════
 *  SCAP — Sequential Causality Assignment Procedure
 * ══════════════════════════════════════════════════════════════════ */

bool assign_causality(SystemGraph* graph) {
    if (!graph) return false;
    report_clear();

    /* ── Step 1: Sources ─────────────────────────────────────────
     * Se → EFFORT_OUT from Se end.
     * Sf → FLOW_OUT from Sf end.                                  */
    for (int i = 0; i < graph->element_count; i++) {
        Element* e = graph->elements[i];
        if (e->type != ELEM_SE && e->type != ELEM_SF) continue;

        Causality c = (e->type == ELEM_SE) ? EFFORT_OUT : FLOW_OUT;

        for (int j = 0; j < e->bond_count; j++) {
            if (!assign_bond_from(e->connected_bonds[j], e, c)) {
                char msg[256];
                snprintf(msg, sizeof(msg),
                         "Source '%s' causality conflict on bond %d",
                         e->name, e->connected_bonds[j]->id);
                report_add(CAUSALITY_ERROR, msg, e->id,
                           e->connected_bonds[j]->id);
                return false;
            }
        }
    }
    if (!propagate_until_stable(graph)) return false;

    /* ── Step 2: Storage elements (preferred integral causality) ──
     * C prefers EFFORT_OUT  (integral: integrates flow → outputs effort)
     * I prefers FLOW_OUT    (integral: integrates effort → outputs flow) */
    for (int i = 0; i < graph->element_count; i++) {
        Element* e = graph->elements[i];
        if (e->type != ELEM_C && e->type != ELEM_I) continue;

        Causality preferred = (e->type == ELEM_C) ? EFFORT_OUT : FLOW_OUT;

        for (int j = 0; j < e->bond_count; j++) {
            Bond* b = e->connected_bonds[j];
            if (bond_is_assigned(b)) {
                /* Already assigned — check for derivative causality */
                if (get_caus(b, e) != preferred) {
                    char msg[256];
                    snprintf(msg, sizeof(msg),
                        "Derivative causality on element '%s' (%s). "
                        "System may require algebraic constraint handling.",
                        e->name,
                        e->type == ELEM_C ? "C" : "I");
                    report_add(CAUSALITY_WARNING, msg, e->id, b->id);
                }
                continue;
            }
            if (!assign_bond_from(b, e, preferred)) {
                char msg[256];
                snprintf(msg, sizeof(msg),
                         "Storage element '%s' causality conflict", e->name);
                report_add(CAUSALITY_ERROR, msg, e->id, b->id);
                return false;
            }
        }
        if (!propagate_until_stable(graph)) return false;
    }

    /* ── Step 3: Resistors (arbitrary causality) ─────────────────
     * Default: R outputs FLOW_OUT (conductive / conductance form). */
    for (int i = 0; i < graph->element_count; i++) {
        Element* e = graph->elements[i];
        if (e->type != ELEM_R) continue;

        for (int j = 0; j < e->bond_count; j++) {
            Bond* b = e->connected_bonds[j];
            if (bond_is_assigned(b)) continue;
            if (!assign_bond_from(b, e, FLOW_OUT)) {
                char msg[256];
                snprintf(msg, sizeof(msg),
                         "Resistor '%s' causality conflict", e->name);
                report_add(CAUSALITY_ERROR, msg, e->id, b->id);
                return false;
            }
        }
        if (!propagate_until_stable(graph)) return false;
    }

    /* ── Step 4: Verify completeness ─────────────────────────────── */
    for (int i = 0; i < graph->bond_count; i++) {
        Bond* b = graph->bonds[i];
        if (!bond_is_assigned(b)) {
            char msg[256];
            snprintf(msg, sizeof(msg),
                     "Bond %d has unresolved causality", b->id);
            report_add(CAUSALITY_ERROR, msg, -1, b->id);
            return false;
        }
    }

    return true;
}

/* ── Public diagnostic accessor ──────────────────────────────────── */

CausalityReport get_causality_report(SystemGraph* graph) {
    (void)graph;   /* report is populated by assign_causality() */
    return g_report;
}
