/* Inline validator — no external dependencies.
 * Validates both Odum ESL and Bond Graph model structures. */

export function validateModel(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: [{ message: 'Model must be an object' }] };
  }

  if (data.domain === 'bondgraph') {
    const errors = [];
    if (!Array.isArray(data.elements) || data.elements.length === 0)
      errors.push({ message: 'elements array is required and must be non-empty' });
    if (!Array.isArray(data.bonds))
      errors.push({ message: 'bonds array is required' });
    if (Array.isArray(data.elements)) {
      const ids = new Set();
      data.elements.forEach((el, i) => {
        if (typeof el.id !== 'number') errors.push({ message: `elements[${i}].id must be a number` });
        if (!el.type) errors.push({ message: `elements[${i}].type is required` });
        if (ids.has(el.id)) errors.push({ message: `Duplicate element id: ${el.id}` });
        ids.add(el.id);
      });
      if (Array.isArray(data.bonds)) {
        data.bonds.forEach((b, i) => {
          if (!ids.has(b.source)) errors.push({ message: `bonds[${i}].source ${b.source} references unknown element` });
          if (!ids.has(b.target)) errors.push({ message: `bonds[${i}].target ${b.target} references unknown element` });
        });
      }
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : null };
  }

  /* Odum ESL */
  const errors = [];
  if (!Array.isArray(data.nodes) || data.nodes.length === 0)
    errors.push({ message: 'nodes array is required and must be non-empty' });
  if (Array.isArray(data.nodes)) {
    const ids = new Set();
    data.nodes.forEach((n, i) => {
      if (!n.id) errors.push({ message: `nodes[${i}].id is required` });
      if (!n.type) errors.push({ message: `nodes[${i}].type is required` });
      if (typeof n.value !== 'number') errors.push({ message: `nodes[${i}].value must be a number` });
      if (ids.has(n.id)) errors.push({ message: `Duplicate node id: ${n.id}` });
      ids.add(n.id);
    });
    if (Array.isArray(data.edges)) {
      data.edges.forEach((e, i) => {
        if (!ids.has(e.origin)) errors.push({ message: `edges[${i}].origin "${e.origin}" references unknown node` });
        if (!ids.has(e.target)) errors.push({ message: `edges[${i}].target "${e.target}" references unknown node` });
      });
    }
  }
  return { valid: errors.length === 0, errors: errors.length ? errors : null };
}
