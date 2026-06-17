#ifndef JSON_IO_H
#define JSON_IO_H

#include "bondgraph.h"
#include "bg_solver.h"

/* ── graph_from_json ─────────────────────────────────────────────────
 *
 * Parse a JSON string into a SystemGraph.  Returns NULL on error.
 * Caller must call destroy_graph() on the result.
 *
 * JSON schema (minimum):
 * {
 *   "elements": [{ "id": 0, "name": "Vsrc", "type": "Se",
 *                  "parameter": 12.0 }],
 *   "bonds":    [{ "id": 0, "source": 0, "target": 1 }]
 * }
 *
 * Optional fields (parsed by graph_from_json, ignored otherwise):
 *   "domain"        — "bondgraph" | "odum-esl"
 *   "config"        — { "t_start", "t_end", "dt", "method" }
 *   "initial_state" — { "<element_name>": <value>, … }
 */
SystemGraph *graph_from_json(const char *json_str);

/* ── result_to_json ──────────────────────────────────────────────────
 *
 * Serialise causality report only (used by validate_bondgraph).
 * Caller must free() the returned string.
 */
char *result_to_json(const SystemGraph *graph,
                     const CausalityReport *report,
                     bool success);

/* ── sim_request_parse ───────────────────────────────────────────────
 *
 * Parse a Bond Graph simulation request from JSON.
 * On success: *graph_out is a new SystemGraph (caller destroys),
 *             cfg_out and initial_state_out are populated (initial_state
 *             indexed by element id; caller frees the array).
 * Returns true on success.
 *
 * Simulation is only attempted when the JSON contains a "config" object.
 */
bool sim_request_parse(const char *json_str,
                       SystemGraph **graph_out,
                       BG_SimConfig *cfg_out,
                       double **initial_state_out,
                       bool *has_config_out);

/* ── sim_result_to_json ──────────────────────────────────────────────
 *
 * Serialise a full simulation result to JSON.  Pass ss=NULL to omit
 * the state_space block.
 *
 * Output schema:
 * {
 *   "success": true,
 *   "domain": "bondgraph",
 *   "causality": { "bonds": […], "diagnostics": […] },
 *   "state_space": {                         // only when ss != NULL
 *     "state_names": ["C1"], "input_names": ["Vsrc"],
 *     "A": [[-10.0]], "B": [[0.01]],
 *     "C": [[1000.0]], "D": [[0.0]]
 *   },
 *   "simulation": {
 *     "state_variables": ["C1"],
 *     "time": [0.0, 0.001, …],
 *     "data": [[0.0, 0.001, …]]
 *   }
 * }
 *
 * Caller must free() the returned string.
 */
char *sim_result_to_json(const SystemGraph *graph,
                         const CausalityReport *report,
                         bool causal_ok,
                         const BG_SimResult *sim,
                         const BG_StateSpace *ss);

#endif /* JSON_IO_H */
