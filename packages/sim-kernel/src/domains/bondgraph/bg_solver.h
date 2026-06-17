#ifndef BG_SOLVER_H
#define BG_SOLVER_H

#include "bondgraph.h"
#include <stdbool.h>
#include <stddef.h>

/* ── Simulation configuration ────────────────────────────────────── */

typedef enum { BG_EULER = 0, BG_RK4 = 1 } BG_Method;

typedef struct {
    double    t_start;
    double    t_end;
    double    dt;
    BG_Method method;
} BG_SimConfig;

/* ── Simulation result ───────────────────────────────────────────── */

/*
 * state_count: number of C/I elements (the system's state variables)
 * state_elem_ids[i]:   element id for state variable i
 * state_elem_names[i]: element name for state variable i (null-terminated)
 *
 * step_count: number of recorded time steps
 * times[s]:             time at step s
 * data[i * step_count + s]: value of state variable i at step s
 */
typedef struct {
    bool   success;
    char   error_msg[256];

    int    state_count;
    int   *state_elem_ids;
    char **state_elem_names;

    int     step_count;
    double *times;
    double *data;   /* flat: data[state_idx * step_count + step_idx] */
} BG_SimResult;

/* ── State-space matrices ────────────────────────────────────────── */

/*
 * Linear state-space form:  ẋ = A·x + B·u,  y = C·x + D·u
 *
 * x (state)  — charges on C elements, momenta on I elements
 * u (inputs) — effort/flow source values (Se, Sf)
 * y (output) — physical value of each state variable:
 *              y_i = x_i / param_i  (V = q/C, v = p/I)
 *
 * Matrices are row-major flat arrays (row i, col j → [i * count + j]).
 * D is zero for purely storage/inertance systems; included for completeness.
 */
typedef struct {
    int     state_count;     /* n */
    int     input_count;     /* m */
    double *A;               /* n×n */
    double *B;               /* n×m */
    double *C_mat;           /* n×n  (diagonal: 1/param_i) */
    double *D;               /* n×m  (zeros) */
    int    *state_elem_ids;
    char  **state_names;
    int    *input_elem_ids;
    char  **input_names;
} BG_StateSpace;

/*
 * bg_compute_state_space — extract A/B/C/D matrices for a linear Bond Graph.
 *
 * graph must have valid SCAP causality already assigned.
 * Temporarily modifies source element parameters (restores them before return).
 * Returns NULL if the graph has no state variables.
 * Caller must call bg_state_space_free().
 */
BG_StateSpace *bg_compute_state_space(SystemGraph *graph);

void bg_state_space_free(BG_StateSpace *ss);

/* ── Public API ──────────────────────────────────────────────────── */

/*
 * bg_simulate — run an Euler/RK4 simulation of a Bond Graph.
 *
 * graph         must have valid SCAP causality already assigned.
 * cfg           simulation parameters.
 * initial_state initial state indexed by element id; use 0.0 for
 *               non-state elements and for elements whose initial
 *               value is zero.
 *
 * Returns heap-allocated BG_SimResult; caller must call bg_sim_result_free().
 * On allocation failure returns NULL.
 */
BG_SimResult *bg_simulate(SystemGraph *graph,
                           const BG_SimConfig *cfg,
                           const double *initial_state);

void bg_sim_result_free(BG_SimResult *r);

/*
 * bg_compute_derivatives — compute dstate/dt for the current state.
 *
 * state_map[element_id] → index in state[], or -1 if not a state element.
 * Exposed for testing; normally called internally by bg_simulate().
 */
void bg_compute_derivatives(const SystemGraph *graph,
                             const int *state_map,
                             int state_count,
                             const double *state,
                             double *dstate);

#endif /* BG_SOLVER_H */
