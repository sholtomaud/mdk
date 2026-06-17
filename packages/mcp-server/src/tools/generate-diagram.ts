import { z } from 'zod';

export const generateDiagramSchema = {
  model_json: z.string().describe('SysmlPackage, BondGraphModel, or OdumEslModel JSON'),
  view: z.enum(['bdd','ibd','par','pkg','seq','act','uc','stm','req','bg','esl','all'])
    .default('all')
    .describe('"all" returns every applicable view labelled by type'),
  format: z.enum(['mermaid','dot']).default('mermaid'),
};

/* ── Types ────────────────────────────────────────────────────────── */

type Elem = Record<string, unknown>;

interface BgElem { id: number; name: string; type: string; parameter?: number }
interface BgBond { id?: number; source: number; target: number }
interface OdumNode { id: string; name?: string; type: string; value?: number }
interface OdumEdge { id?: string; origin: string; target: string; logic?: string; params?: { k?: number } }

/* ── Utilities ────────────────────────────────────────────────────── */

/** Normalise a FlowConnectionUsage element so source/target are always arrays.
 *  LLMs emit sourceFeature/targetFeature (single objects) instead of source/target (arrays). */
function normaliseFlow(f: Elem): Elem {
  const out: Elem = { ...f };
  for (const [alias, canonical] of [['sourceFeature', 'source'], ['targetFeature', 'target']] as const) {
    if (out[canonical] === undefined && out[alias] !== undefined) {
      out[canonical] = out[alias];
    }
  }
  for (const field of ['source', 'target'] as const) {
    if (out[field] !== undefined && !Array.isArray(out[field])) {
      out[field] = [out[field]];
    }
  }
  return out;
}

function san(s: string): string {
  return String(s).replace(/\W/g, '_').toLowerCase();
}

function shortId(id: string): string {
  return id.replace(/-/g, '').slice(0, 8);
}

function buildByIdMap(elements: Elem[]): Map<string, Elem> {
  return new Map(elements.map(e => [String(e['@id'] ?? e.id ?? ''), e]));
}

/** Map from portUsage/@id → owning PartUsage/@id */
function buildOwnerMap(elements: Elem[]): Map<string, string> {
  const owner = new Map<string, string>();
  for (const el of elements) {
    if (el['@type'] === 'PartUsage' || el['@type'] === 'PartDefinition') {
      const feats = (el.ownedFeature ?? []) as Array<{ '@id': string }>;
      for (const ref of feats) {
        owner.set(ref['@id'], String(el['@id']));
      }
    }
  }
  return owner;
}

/** Resolve the PartUsage that owns a port (or return the port's own id for direct junctions) */
function ownerOrSelf(portId: string, ownerMap: Map<string, string>, byId: Map<string, Elem>): string {
  const owned = ownerMap.get(portId);
  if (owned) return owned;
  // If the element itself is a PartUsage (junction), return its own id
  const el = byId.get(portId);
  if (el && el['@type'] === 'PartUsage') return portId;
  return portId;
}

function bgType(el: Elem): string {
  return String((el.bgMapping as Elem | undefined)?.elementType ?? '');
}

function bgParam(el: Elem): number | undefined {
  const p = (el.bgMapping as Elem | undefined)?.parameter;
  return typeof p === 'number' ? p : undefined;
}

/* ── SysML diagram builders ───────────────────────────────────────── */

function buildBDD(elements: Elem[]): string {
  const lines: string[] = ['classDiagram'];
  for (const el of elements) {
    const name = String(el.name ?? el['@id']);
    const safeName = san(name);
    if (el['@type'] === 'PartDefinition') {
      lines.push(`  class ${safeName} {`);
      lines.push(`    <<PartDefinition>>`);
      lines.push(`  }`);
      const feats = (el.ownedFeature ?? []) as Array<{ '@id': string }>;
      for (const ref of feats) {
        lines.push(`  ${safeName} *-- f_${shortId(ref['@id'])}`);
      }
    } else if (el['@type'] === 'PartUsage') {
      const et = bgType(el);
      lines.push(`  class ${safeName} {`);
      lines.push(`    <<PartUsage>>`);
      if (et) lines.push(`    +bgType: ${et}`);
      const param = bgParam(el);
      if (param !== undefined) lines.push(`    +parameter: ${param}`);
      lines.push(`  }`);
    } else if (el['@type'] === 'ItemDefinition') {
      const domain = String((el.bgMapping as Elem | undefined)?.domain ?? '');
      lines.push(`  class ${safeName} {`);
      lines.push(`    <<ItemDefinition>>`);
      if (domain) lines.push(`    +domain: ${domain}`);
      lines.push(`  }`);
    }
  }
  return '```mermaid\n' + lines.join('\n') + '\n```';
}

function buildIBD(elements: Elem[], packageName: string): string {
  const byId = buildByIdMap(elements);
  const ownerMap = buildOwnerMap(elements);
  const lines: string[] = [`%%{init: {'theme': 'default', 'themeVariables': { 'fontSize': '13px' }}}%%`, `graph LR`, `  %% IBD: ${packageName}`];

  const parts = elements.filter(e => e['@type'] === 'PartUsage');
  const flows = elements.filter(e => e['@type'] === 'FlowConnectionUsage').map(normaliseFlow);

  for (const p of parts) {
    const name = String(p.name ?? p['@id']);
    const et = bgType(p);
    const label = et ? `${et}: ${name}` : name;
    lines.push(`  ${san(name)}["${label}"]`);
  }

  for (const f of flows) {
    const src = (f.source as Array<{ '@id': string }>)[0]?.['@id'] ?? '';
    const tgt = (f.target as Array<{ '@id': string }>)[0]?.['@id'] ?? '';
    const srcOwner = ownerOrSelf(src, ownerMap, byId);
    const tgtOwner = ownerOrSelf(tgt, ownerMap, byId);
    const srcEl = byId.get(srcOwner);
    const tgtEl = byId.get(tgtOwner);
    if (!srcEl || !tgtEl) continue;
    const srcName = san(String(srcEl.name ?? srcOwner));
    const tgtName = san(String(tgtEl.name ?? tgtOwner));
    const fname = String(f.name ?? '');
    const portSrcEl = byId.get(src);
    const portLabel = fname || String(portSrcEl?.name ?? '');
    if (portLabel) {
      lines.push(`  ${srcName} -->|${portLabel}| ${tgtName}`);
    } else {
      lines.push(`  ${srcName} --> ${tgtName}`);
    }
  }

  return '```mermaid\n' + lines.join('\n') + '\n```';
}

function buildPAR(elements: Elem[]): string {
  const byId = buildByIdMap(elements);
  const ownerMap = buildOwnerMap(elements);
  const lines: string[] = [`%%{init: {'theme': 'default', 'themeVariables': { 'fontSize': '13px' }}}%%`, `graph TD`];

  const parts = elements.filter(e => e['@type'] === 'PartUsage');
  const flows = elements.filter(e => e['@type'] === 'FlowConnectionUsage').map(normaliseFlow);

  for (const p of parts) {
    const name = String(p.name ?? p['@id']);
    const param = bgParam(p);
    const et = bgType(p);
    if (param !== undefined) {
      lines.push(`  ${san(name)}["{${et}: ${name}\\nparam=${param}}"]`);
    } else {
      lines.push(`  ${san(name)}["${et}: ${name}"]`);
    }
  }

  for (const f of flows) {
    const src = (f.source as Array<{ '@id': string }>)[0]?.['@id'] ?? '';
    const tgt = (f.target as Array<{ '@id': string }>)[0]?.['@id'] ?? '';
    const srcOwner = ownerOrSelf(src, ownerMap, byId);
    const tgtOwner = ownerOrSelf(tgt, ownerMap, byId);
    const srcEl = byId.get(srcOwner);
    const tgtEl = byId.get(tgtOwner);
    if (!srcEl || !tgtEl) continue;
    lines.push(`  ${san(String(srcEl.name ?? srcOwner))} --> ${san(String(tgtEl.name ?? tgtOwner))}`);
  }

  return '```mermaid\n' + lines.join('\n') + '\n```';
}

function buildPKG(elements: Elem[], packageName: string): string {
  const lines: string[] = [`%%{init: {'theme': 'default', 'themeVariables': { 'fontSize': '13px' }}}%%`, `graph TD`, `  pkg["<<Package>>\\n${packageName}"]`];

  const defs = elements.filter(e => e['@type'] === 'PartDefinition');
  const usages = elements.filter(e => e['@type'] === 'PartUsage');
  const items = elements.filter(e => e['@type'] === 'ItemDefinition');

  for (const d of defs) {
    const name = String(d.name ?? d['@id']);
    lines.push(`  pkg --> pd_${san(name)}["<<PartDefinition>>\\n${name}"]`);
    const feats = (d.ownedFeature ?? []) as Array<{ '@id': string }>;
    for (const ref of feats) {
      lines.push(`  pd_${san(name)} --> pu_${shortId(ref['@id'])}`);
    }
  }

  for (const u of usages) {
    const name = String(u.name ?? u['@id']);
    const et = bgType(u);
    const defRef = (u.definition as { '@id': string } | undefined)?.['@id'];
    if (!defRef) {
      lines.push(`  pkg --> pu_${san(name)}["<<PartUsage>>\\n${name}${et ? '\\n[' + et + ']' : ''}"]`);
    } else {
      lines.push(`  pu_${san(name)}["<<PartUsage>>\\n${name}${et ? '\\n[' + et + ']' : ''}"]`);
    }
  }

  for (const i of items) {
    const name = String(i.name ?? i['@id']);
    lines.push(`  pkg --> id_${san(name)}["<<ItemDefinition>>\\n${name}"]`);
  }

  return '```mermaid\n' + lines.join('\n') + '\n```';
}

function buildSEQ(elements: Elem[], packageName: string): string {
  const byId = buildByIdMap(elements);
  const ownerMap = buildOwnerMap(elements);
  const lines: string[] = [`sequenceDiagram`, `  %% ${packageName}`];

  const parts = elements.filter(e => e['@type'] === 'PartUsage');
  const flows = elements.filter(e => e['@type'] === 'FlowConnectionUsage').map(normaliseFlow);

  for (const p of parts) {
    const name = String(p.name ?? p['@id']);
    const et = bgType(p);
    lines.push(`  participant ${san(name)} as ${et ? et + ':' : ''}${name}`);
  }

  for (const f of flows) {
    const src = (f.source as Array<{ '@id': string }>)[0]?.['@id'] ?? '';
    const tgt = (f.target as Array<{ '@id': string }>)[0]?.['@id'] ?? '';
    const srcOwner = ownerOrSelf(src, ownerMap, byId);
    const tgtOwner = ownerOrSelf(tgt, ownerMap, byId);
    const srcEl = byId.get(srcOwner);
    const tgtEl = byId.get(tgtOwner);
    if (!srcEl || !tgtEl) continue;
    const srcName = san(String(srcEl.name ?? srcOwner));
    const tgtName = san(String(tgtEl.name ?? tgtOwner));
    const label = String(f.name ?? (f.itemFlow as { '@id': string } | undefined)?.['@id'] ?? 'flow');
    lines.push(`  ${srcName}->>${tgtName}: ${label}`);
  }

  return '```mermaid\n' + lines.join('\n') + '\n```';
}

function buildACT(elements: Elem[]): string {
  const byId = buildByIdMap(elements);
  const ownerMap = buildOwnerMap(elements);
  const lines: string[] = [`%%{init: {'theme': 'default', 'themeVariables': { 'fontSize': '13px' }}}%%`, `graph TD`];

  const parts = elements.filter(e => e['@type'] === 'PartUsage');
  const flows = elements.filter(e => e['@type'] === 'FlowConnectionUsage').map(normaliseFlow);

  for (const p of parts) {
    const name = String(p.name ?? p['@id']);
    const et = bgType(p);
    const param = bgParam(p);
    const id = san(name);
    if (et === 'Se' || et === 'Sf') {
      lines.push(`  ${id}(["▶ ${et}: ${name}"])`);
    } else if (et === 'C' || et === 'I') {
      const qLabel = param !== undefined ? `\\nq=${param}` : '';
      lines.push(`  ${id}["${et}: ${name}${qLabel}"]`);
    } else if (et === 'R') {
      lines.push(`  ${id}{{"R: ${name}"}}`);
    } else if (et === 'J0' || et === 'J1') {
      lines.push(`  ${id}((${et}))`);
    } else {
      lines.push(`  ${id}["${et ? et + ': ' : ''}${name}"]`);
    }
  }

  for (const f of flows) {
    const src = (f.source as Array<{ '@id': string }>)[0]?.['@id'] ?? '';
    const tgt = (f.target as Array<{ '@id': string }>)[0]?.['@id'] ?? '';
    const srcOwner = ownerOrSelf(src, ownerMap, byId);
    const tgtOwner = ownerOrSelf(tgt, ownerMap, byId);
    const srcEl = byId.get(srcOwner);
    const tgtEl = byId.get(tgtOwner);
    if (!srcEl || !tgtEl) continue;
    lines.push(`  ${san(String(srcEl.name ?? srcOwner))} --> ${san(String(tgtEl.name ?? tgtOwner))}`);
  }

  return '```mermaid\n' + lines.join('\n') + '\n```';
}

function buildUC(elements: Elem[], packageName: string): string {
  const byId = buildByIdMap(elements);
  const ownerMap = buildOwnerMap(elements);
  const lines: string[] = [`%%{init: {'theme': 'default', 'themeVariables': { 'fontSize': '13px' }}}%%`, `graph LR`];

  const parts = elements.filter(e => e['@type'] === 'PartUsage');
  const flows = elements.filter(e => e['@type'] === 'FlowConnectionUsage').map(normaliseFlow);

  for (const p of parts) {
    const name = String(p.name ?? p['@id']);
    const et = bgType(p);
    const id = san(name);
    if (et === 'Se' || et === 'Sf') {
      lines.push(`  actor_${id}["<<actor>>\\n${name}"]`);
    } else {
      lines.push(`  uc_${id}(("${et ? et + ': ' : ''}${name}"))`);
    }
  }

  for (const f of flows) {
    const src = (f.source as Array<{ '@id': string }>)[0]?.['@id'] ?? '';
    const tgt = (f.target as Array<{ '@id': string }>)[0]?.['@id'] ?? '';
    const srcOwner = ownerOrSelf(src, ownerMap, byId);
    const tgtOwner = ownerOrSelf(tgt, ownerMap, byId);
    const srcEl = byId.get(srcOwner);
    const tgtEl = byId.get(tgtOwner);
    if (!srcEl || !tgtEl) continue;
    const srcEt = bgType(srcEl);
    const tgtEt = bgType(tgtEl);
    const srcNodeId = (srcEt === 'Se' || srcEt === 'Sf') ? `actor_${san(String(srcEl.name ?? srcOwner))}` : `uc_${san(String(srcEl.name ?? srcOwner))}`;
    const tgtNodeId = (tgtEt === 'Se' || tgtEt === 'Sf') ? `actor_${san(String(tgtEl.name ?? tgtOwner))}` : `uc_${san(String(tgtEl.name ?? tgtOwner))}`;
    lines.push(`  ${srcNodeId} --> ${tgtNodeId}`);
  }

  return '```mermaid\n' + lines.join('\n') + '\n```';
}

function buildSTM(elements: Elem[]): string {
  const byId = buildByIdMap(elements);
  const ownerMap = buildOwnerMap(elements);
  const lines: string[] = [`stateDiagram-v2`];

  const parts = elements.filter(e => e['@type'] === 'PartUsage');
  const flows = elements.filter(e => e['@type'] === 'FlowConnectionUsage').map(normaliseFlow);

  const storageTypes = new Set(['C', 'I']);
  const sourceTypes = new Set(['Se', 'Sf']);

  for (const p of parts) {
    const name = String(p.name ?? p['@id']);
    const et = bgType(p);
    const param = bgParam(p);
    if (storageTypes.has(et)) {
      const label = param !== undefined ? `${name}\\n(${et}: q=${param})` : `${name}\\n(${et})`;
      lines.push(`  state "${label}" as ${san(name)}`);
    }
  }

  for (const f of flows) {
    const src = (f.source as Array<{ '@id': string }>)[0]?.['@id'] ?? '';
    const tgt = (f.target as Array<{ '@id': string }>)[0]?.['@id'] ?? '';
    const srcOwner = ownerOrSelf(src, ownerMap, byId);
    const tgtOwner = ownerOrSelf(tgt, ownerMap, byId);
    const srcEl = byId.get(srcOwner);
    const tgtEl = byId.get(tgtOwner);
    if (!srcEl || !tgtEl) continue;

    const srcEt = bgType(srcEl);
    const tgtEt = bgType(tgtEl);
    const srcName = san(String(srcEl.name ?? srcOwner));
    const tgtName = san(String(tgtEl.name ?? tgtOwner));
    const label = String(f.name ?? '');

    if (sourceTypes.has(srcEt)) {
      if (storageTypes.has(tgtEt)) {
        lines.push(`  [*] --> ${tgtName}${label ? ' : ' + label : ''}`);
      }
    } else if (storageTypes.has(srcEt) && storageTypes.has(tgtEt)) {
      // Intermediate R element — label the transition
      const rLabel = label || 'flow';
      lines.push(`  ${srcName} --> ${tgtName} : ${rLabel}`);
    } else if (storageTypes.has(srcEt) && (tgtEt === 'R' || tgtEt === '')) {
      lines.push(`  ${srcName} --> [*]${label ? ' : ' + label : ''}`);
    }
  }

  return '```mermaid\n' + lines.join('\n') + '\n```';
}

function buildREQ(elements: Elem[], packageName: string): string {
  const lines: string[] = [`%%{init: {'theme': 'default', 'themeVariables': { 'fontSize': '13px' }}}%%`, `graph TD`, `  req0["<<RequirementDiagram>>\\nSystem: ${packageName}"]`];

  const parts = elements.filter(e => e['@type'] === 'PartDefinition' || e['@type'] === 'PartUsage');
  let idx = 1;
  for (const p of parts) {
    const name = String(p.name ?? p['@id']);
    const et = bgType(p);
    const typeLabel = et ? `model ${et} element` : 'participate in the system';
    lines.push(`  req${idx}["<<requirement>>\\nID: ${idx}\\nname: ${name} shall ${typeLabel}"]`);
    lines.push(`  req0 --> req${idx}`);
    idx++;
  }

  return '```mermaid\n' + lines.join('\n') + '\n```';
}

function buildESL(elements: Elem[]): string {
  const byId = buildByIdMap(elements);
  const ownerMap = buildOwnerMap(elements);
  const lines: string[] = [`%%{init: {'theme': 'default', 'themeVariables': { 'fontSize': '13px' }}}%%`, `graph LR`];

  const parts = elements.filter(e => e['@type'] === 'PartUsage');
  const flows = elements.filter(e => e['@type'] === 'FlowConnectionUsage').map(normaliseFlow);

  // Determine sinks (R elements with no outbound flow to storage)
  const outflowTargets = new Set<string>();
  for (const f of flows) {
    const tgt = (f.target as Array<{ '@id': string }>)[0]?.['@id'] ?? '';
    outflowTargets.add(ownerOrSelf(tgt, ownerMap, byId));
  }

  for (const p of parts) {
    const name = String(p.name ?? p['@id']);
    const et = bgType(p);
    const param = bgParam(p);
    const id = san(name);

    if (et === 'Se' || et === 'Sf') {
      lines.push(`  src_${id}(("☀ ${name}"))`);
    } else if (et === 'C' || et === 'I') {
      const qLabel = param !== undefined ? `\\nq=${param}` : '';
      lines.push(`  stg_${id}[["⬡ ${name}${qLabel}"]]`);
    } else if (et === 'R') {
      lines.push(`  snk_${id}{{"↓ ${name}"}}`);
    } else if (et === 'J0' || et === 'J1') {
      lines.push(`  jn_${id}((${et}))`);
    } else {
      lines.push(`  nd_${id}["${name}"]`);
    }
  }

  for (const f of flows) {
    const src = (f.source as Array<{ '@id': string }>)[0]?.['@id'] ?? '';
    const tgt = (f.target as Array<{ '@id': string }>)[0]?.['@id'] ?? '';
    const srcOwner = ownerOrSelf(src, ownerMap, byId);
    const tgtOwner = ownerOrSelf(tgt, ownerMap, byId);
    const srcEl = byId.get(srcOwner);
    const tgtEl = byId.get(tgtOwner);
    if (!srcEl || !tgtEl) continue;

    const srcEt = bgType(srcEl);
    const tgtEt = bgType(tgtEl);
    const srcPrefix = srcEt === 'Se' || srcEt === 'Sf' ? 'src_' : srcEt === 'C' || srcEt === 'I' ? 'stg_' : srcEt === 'R' ? 'snk_' : srcEt === 'J0' || srcEt === 'J1' ? 'jn_' : 'nd_';
    const tgtPrefix = tgtEt === 'Se' || tgtEt === 'Sf' ? 'src_' : tgtEt === 'C' || tgtEt === 'I' ? 'stg_' : tgtEt === 'R' ? 'snk_' : tgtEt === 'J0' || tgtEt === 'J1' ? 'jn_' : 'nd_';

    lines.push(`  ${srcPrefix}${san(String(srcEl.name ?? srcOwner))} --> ${tgtPrefix}${san(String(tgtEl.name ?? tgtOwner))}`);
  }

  return '```mermaid\n' + lines.join('\n') + '\n```';
}

/* ── Bond Graph diagram builders ──────────────────────────────────── */

function buildBgDiagram(elements: BgElem[], bonds: BgBond[], format: 'mermaid' | 'dot'): string {
  if (format === 'dot') {
    const lines = [`digraph "bondgraph" {`, '  rankdir=LR;'];
    for (const el of elements) {
      const label = `${el.type}: ${el.name}${el.parameter !== undefined ? '\\n(' + el.parameter + ')' : ''}`;
      const shape = (el.type === 'J0' || el.type === 'J1') ? 'circle' : 'box';
      lines.push(`  n${el.id} [label="${label}" shape=${shape}];`);
    }
    for (const b of bonds) {
      lines.push(`  n${b.source} -> n${b.target};`);
    }
    lines.push('}');
    return lines.join('\n');
  }

  const lines = [`%%{init: {'theme': 'default', 'themeVariables': { 'fontSize': '13px' }}}%%`, `graph LR`];
  for (const el of elements) {
    const param = el.parameter !== undefined ? ` (${el.parameter})` : '';
    if (el.type === 'J0' || el.type === 'J1') {
      lines.push(`  n${el.id}((${el.type}))`);
    } else if (el.type === 'Se' || el.type === 'Sf') {
      lines.push(`  n${el.id}(["${el.type}: ${el.name}${param}"])`);
    } else if (el.type === 'C' || el.type === 'I') {
      lines.push(`  n${el.id}[["${el.type}: ${el.name}${param}"]]`);
    } else {
      lines.push(`  n${el.id}["${el.type}: ${el.name}${param}"]`);
    }
  }
  for (const b of bonds) {
    lines.push(`  n${b.source} --> n${b.target}`);
  }
  return '```mermaid\n' + lines.join('\n') + '\n```';
}

function buildEslFromBg(nodes: OdumNode[], edges: OdumEdge[], format: 'mermaid' | 'dot'): string {
  if (format === 'dot') {
    const lines = [`digraph "odum_esl" {`, '  rankdir=LR;'];
    for (const n of nodes) {
      const label = `${n.type}: ${n.name ?? n.id}`;
      const shape = n.type === 'source' ? 'ellipse' : n.type === 'storage' ? 'box3d' : 'box';
      lines.push(`  ${san(n.id)} [label="${label}" shape=${shape}];`);
    }
    for (const e of edges) {
      const label = e.logic ?? '';
      lines.push(`  ${san(e.origin)} -> ${san(e.target)}${label ? ` [label="${label}"]` : ''};`);
    }
    lines.push('}');
    return lines.join('\n');
  }

  const lines = [`%%{init: {'theme': 'default', 'themeVariables': { 'fontSize': '13px' }}}%%`, `graph LR`];
  for (const n of nodes) {
    const nameLabel = n.name ?? n.id;
    if (n.type === 'source') {
      lines.push(`  ${san(n.id)}(("☀ ${nameLabel}"))`);
    } else if (n.type === 'storage') {
      lines.push(`  ${san(n.id)}[["⬡ ${nameLabel}\\nq=${n.value ?? 0}"]]`);
    } else if (n.type === 'sink') {
      lines.push(`  ${san(n.id)}{{"↓ ${nameLabel}"}}`);
    } else {
      lines.push(`  ${san(n.id)}["${nameLabel}"]`);
    }
  }
  for (const e of edges) {
    const label = e.params?.k !== undefined ? `k=${e.params.k}` : (e.logic ?? '');
    lines.push(`  ${san(e.origin)} -->|${label}| ${san(e.target)}`);
  }
  return '```mermaid\n' + lines.join('\n') + '\n```';
}

/* ── DOT equivalents for structural diagrams ──────────────────────── */

function buildBddDot(elements: Elem[]): string {
  const lines = ['digraph "bdd" {', '  rankdir=TB;', '  node [shape=record];'];
  for (const el of elements) {
    const name = String(el.name ?? el['@id']);
    const safeName = san(name);
    if (el['@type'] === 'PartDefinition' || el['@type'] === 'PartUsage') {
      const et = bgType(el);
      const label = `{${el['@type']}|${name}${et ? '|bgType: ' + et : ''}}`;
      lines.push(`  ${safeName} [label="${label}"];`);
      if (el['@type'] === 'PartDefinition') {
        const feats = (el.ownedFeature ?? []) as Array<{ '@id': string }>;
        for (const ref of feats) {
          lines.push(`  ${safeName} -> f_${shortId(ref['@id'])} [arrowhead=diamond];`);
        }
      }
    }
  }
  lines.push('}');
  return lines.join('\n');
}

/* ── Main tool function ───────────────────────────────────────────── */

export async function generateDiagram(
  { model_json, view, format }: { model_json: string; view: 'bdd'|'ibd'|'par'|'pkg'|'seq'|'act'|'uc'|'stm'|'req'|'bg'|'esl'|'all'; format: 'mermaid' | 'dot' },
): Promise<string> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(model_json) as Record<string, unknown>;
  } catch {
    return 'Error: invalid JSON';
  }

  // Detect model type
  const isSysml = parsed['@type'] === 'Package';
  const isBg = parsed.domain === 'bondgraph';
  const isOdum = parsed.domain === 'odum-esl';

  if (isSysml) {
    const elements = (parsed.elements ?? []) as Elem[];
    const packageName = String(parsed.name ?? 'Package');

    const viewBuilders: Record<string, () => string> = {
      bdd: () => format === 'dot' ? buildBddDot(elements) : buildBDD(elements),
      ibd: () => buildIBD(elements, packageName),
      par: () => buildPAR(elements),
      pkg: () => format === 'dot' ? buildBddDot(elements) : buildPKG(elements, packageName),
      seq: () => buildSEQ(elements, packageName),
      act: () => buildACT(elements),
      uc:  () => buildUC(elements, packageName),
      stm: () => buildSTM(elements),
      req: () => buildREQ(elements, packageName),
      esl: () => buildESL(elements),
      bg:  () => {
        // Reconstruct minimal BG topology from SysML elements
        const bgElements: BgElem[] = [];
        const bgBonds: BgBond[] = [];
        const byId = buildByIdMap(elements);
        const ownerMap = buildOwnerMap(elements);
        let idx = 1;
        const idToIdx = new Map<string, number>();

        for (const el of elements) {
          if (el['@type'] === 'PartUsage') {
            const name = String(el.name ?? el['@id']);
            const et = bgType(el) || 'J0';
            const param = bgParam(el) ?? 0;
            idToIdx.set(String(el['@id']), idx);
            bgElements.push({ id: idx, name, type: et, parameter: param });
            idx++;
          }
        }

        const flows = elements.filter(e => e['@type'] === 'FlowConnectionUsage').map(normaliseFlow);
        let bIdx = 1;
        for (const f of flows) {
          const src = (f.source as Array<{ '@id': string }>)[0]?.['@id'] ?? '';
          const tgt = (f.target as Array<{ '@id': string }>)[0]?.['@id'] ?? '';
          const srcOwner = ownerOrSelf(src, ownerMap, byId);
          const tgtOwner = ownerOrSelf(tgt, ownerMap, byId);
          const s = idToIdx.get(srcOwner);
          const t = idToIdx.get(tgtOwner);
          if (s && t) {
            bgBonds.push({ id: bIdx++, source: s, target: t });
          }
        }

        return buildBgDiagram(bgElements, bgBonds, format);
      },
    };

    if (view !== 'all') {
      const builder = viewBuilders[view];
      if (!builder) return `Error: unknown view "${view}"`;
      return builder();
    }

    // 'all' — generate all views
    const viewOrder: Array<[string, string]> = [
      ['bdd', 'BDD — Block Definition Diagram'],
      ['ibd', 'IBD — Internal Block Diagram'],
      ['par', 'PAR — Parametric Diagram'],
      ['pkg', 'PKG — Package Diagram'],
      ['seq', 'SEQ — Sequence Diagram'],
      ['act', 'ACT — Activity Diagram'],
      ['uc',  'UC — Use Case Diagram'],
      ['stm', 'STM — State Machine Diagram'],
      ['req', 'REQ — Requirement Diagram'],
      ['esl', 'ESL — Odum Energy Systems Language (reconstructed)'],
      ['bg',  'BG — Bond Graph Topology (reconstructed)'],
    ];

    const parts: string[] = [];
    for (const [key, label] of viewOrder) {
      const builder = viewBuilders[key];
      if (builder) {
        parts.push(`### ${label}\n${builder()}`);
      }
    }
    return parts.join('\n\n---\n\n');
  }

  if (isBg) {
    const bgElements = (parsed.elements ?? []) as BgElem[];
    const bgBonds = (parsed.bonds ?? []) as BgBond[];

    if (view === 'all' || view === 'bg') {
      const bgDiag = buildBgDiagram(bgElements, bgBonds, format);
      // Reconstruct ESL from BG
      const eslNodes: OdumNode[] = bgElements.map(e => ({
        id: `n${e.id}`,
        name: e.name,
        type: (e.type === 'Se' || e.type === 'Sf') ? 'source' : (e.type === 'C' || e.type === 'I') ? 'storage' : (e.type === 'R') ? 'sink' : 'constant',
        value: e.parameter,
      }));
      const eslEdges: OdumEdge[] = bgBonds.map(b => ({
        origin: `n${b.source}`,
        target: `n${b.target}`,
        logic: 'linear',
        params: { k: 1 },
      }));
      const eslDiag = buildEslFromBg(eslNodes, eslEdges, format);

      if (view === 'bg') return bgDiag;
      return `### BG — Bond Graph Topology\n${bgDiag}\n\n---\n\n### ESL — Odum Energy Systems Language (reconstructed)\n${eslDiag}`;
    }

    return buildBgDiagram(bgElements, bgBonds, format);
  }

  if (isOdum) {
    const odumNodes = (parsed.nodes ?? []) as OdumNode[];
    const odumEdges = (parsed.edges ?? []) as OdumEdge[];

    const eslDiag = buildEslFromBg(odumNodes, odumEdges, format);
    if (view === 'esl' || view === 'bg' || view === 'all') {
      return eslDiag;
    }
    return eslDiag;
  }

  // Fallback: legacy BG-style with elements/bonds or nodes/edges
  const name = String(parsed.name ?? 'model');
  const elements = (parsed.elements ?? parsed.nodes ?? []) as BgElem[];
  const edges = (parsed.bonds ?? parsed.edges ?? []) as BgBond[];
  return buildBgDiagram(elements, edges, format);
}
