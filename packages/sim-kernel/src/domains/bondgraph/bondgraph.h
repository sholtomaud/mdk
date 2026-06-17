#ifndef BONDGRAPH_H
#define BONDGRAPH_H

#include <stdbool.h>

/* ── Enumerations ────────────────────────────────────────────────── */

typedef enum { UNASSIGNED, EFFORT_OUT, FLOW_OUT } Causality;

typedef enum {
    ELEM_SE,  /* Effort source  (e.g. battery voltage)   */
    ELEM_SF,  /* Flow source    (e.g. constant velocity)  */
    ELEM_R,   /* Resistor       (e.g. friction)           */
    ELEM_C,   /* Capacitor      (e.g. spring compliance)  */
    ELEM_I,   /* Inertia        (e.g. mass)               */
    ELEM_TF,  /* Transformer    (e.g. gear ratio)         */
    ELEM_GY,  /* Gyrator        (e.g. DC motor)           */
    ELEM_J0,  /* 0-junction     (common effort)           */
    ELEM_J1,  /* 1-junction     (common flow)             */
    ELEM_MTF, /* Modulated Transformer (DACM — same SCAP as TF) */
    ELEM_MGY, /* Modulated Gyrator    (DACM — same SCAP as GY) */
    ELEM_CTF  /* Control Transformer  (DACM — arbitrary causality like R) */
} ElementType;

/* ── Forward declaration ─────────────────────────────────────────── */

typedef struct Element Element;

/* ── Bond ────────────────────────────────────────────────────────── */

typedef struct {
    int id;
    Element* source;
    Element* target;
    Causality source_causality;   /* Causality at the source end */
    Causality target_causality;   /* Causality at the target end */
} Bond;

/* ── Element ─────────────────────────────────────────────────────── */

struct Element {
    int id;
    char name[64];
    ElementType type;
    double parameter_value;
    Bond** connected_bonds;
    int bond_count;
    int bond_capacity;            /* Internal: allocated slots */
};

/* ── System Graph ────────────────────────────────────────────────── */

typedef struct {
    Element** elements;
    int element_count;
    int element_capacity;         /* Internal: allocated slots */
    Bond** bonds;
    int bond_count;
    int bond_capacity;            /* Internal: allocated slots */
} SystemGraph;

/* ── Causality Report (rich diagnostics) ─────────────────────────── */

#define MAX_WARNINGS 32

typedef enum {
    CAUSALITY_OK,
    CAUSALITY_WARNING,
    CAUSALITY_ERROR
} CausalityStatus;

typedef struct {
    CausalityStatus status;
    char message[256];
    int element_id;               /* Element involved, or -1 */
    int bond_id;                  /* Bond involved, or -1    */
} CausalityDiagnostic;

typedef struct {
    CausalityStatus overall_status;
    CausalityDiagnostic diagnostics[MAX_WARNINGS];
    int diagnostic_count;
} CausalityReport;

/* ── Core Engine API ─────────────────────────────────────────────── */

SystemGraph*  create_graph(void);
void          destroy_graph(SystemGraph* graph);

Element*      add_element(SystemGraph* graph, ElementType type,
                          const char* name, double param);
Bond*         connect_elements(SystemGraph* graph,
                               Element* src, Element* target);

/* ── The SCAP (Linter) Algorithm ─────────────────────────────────── */

/*  Returns true if causality is fully resolved (possibly with
 *  derivative-causality warnings).  Returns false on irreconcilable
 *  conflicts (e.g. two Se on a 0-junction).                         */
bool              assign_causality(SystemGraph* graph);

/*  Detailed report — call AFTER assign_causality().                 */
CausalityReport   get_causality_report(SystemGraph* graph);

#endif /* BONDGRAPH_H */
