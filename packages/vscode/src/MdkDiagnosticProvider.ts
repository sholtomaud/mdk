/* MdkDiagnosticProvider — validates *.mdk.json files and populates the Problems panel.
 *
 * For MVP, validation is pure JSON-schema (Zod-equivalent in TS) rather than
 * spawning `mdk validate` (which requires WASM to be built). Full WASM causality
 * checking is available via `mdk validate` in the terminal. */

import * as vscode from 'vscode';

const BG_ELEMENT_TYPES = new Set([
  'Se', 'Sf', 'R', 'C', 'I', 'TF', 'GY', 'J0', 'J1',
  'FractionalC', 'FractionalR',
]);

export class MdkDiagnosticProvider {
  constructor(private readonly _collection: vscode.DiagnosticCollection) {}

  async validateDocument(doc: vscode.TextDocument): Promise<number> {
    this._collection.delete(doc.uri);
    const text = doc.getText();
    const diags: vscode.Diagnostic[] = [];

    let model: unknown;
    try {
      model = JSON.parse(text);
    } catch (e) {
      const range = new vscode.Range(0, 0, doc.lineCount, 0);
      diags.push(new vscode.Diagnostic(range, `Invalid JSON: ${(e as Error).message}`, vscode.DiagnosticSeverity.Error));
      this._collection.set(doc.uri, diags);
      return diags.length;
    }

    /* Unwrap synthesised { model, result } envelope */
    const m = (model && typeof model === 'object' && 'model' in (model as object))
      ? (model as Record<string, unknown>)['model']
      : model;

    if (!m || typeof m !== 'object') {
      diags.push(this._diag(doc, 0, 0, 'Model must be a JSON object.', vscode.DiagnosticSeverity.Error));
      this._collection.set(doc.uri, diags);
      return diags.length;
    }

    const rec = m as Record<string, unknown>;

    if (rec['domain'] === 'bondgraph') {
      this._validateBondGraph(doc, rec, diags);
    } else {
      this._validateOdumEsl(doc, rec, diags);
    }

    this._collection.set(doc.uri, diags);
    return diags.length;
  }

  private _validateBondGraph(
    doc: vscode.TextDocument,
    model: Record<string, unknown>,
    diags: vscode.Diagnostic[],
  ): void {
    const elements = model['elements'];
    if (!Array.isArray(elements) || elements.length === 0) {
      diags.push(this._diag(doc, 0, 0, 'Bond Graph model must have a non-empty "elements" array.', vscode.DiagnosticSeverity.Error));
      return;
    }

    const ids = new Set<number>();
    (elements as unknown[]).forEach((el, i) => {
      if (!el || typeof el !== 'object') return;
      const e = el as Record<string, unknown>;
      if (typeof e['id'] !== 'number')
        diags.push(this._diag(doc, i, 0, `elements[${i}]: "id" must be a number.`, vscode.DiagnosticSeverity.Error));
      if (!e['type'] || !BG_ELEMENT_TYPES.has(String(e['type'])))
        diags.push(this._diag(doc, i, 0, `elements[${i}]: unknown type "${e['type']}". Expected one of: ${[...BG_ELEMENT_TYPES].join(', ')}.`, vscode.DiagnosticSeverity.Error));
      if (typeof e['parameter'] !== 'number')
        diags.push(this._diag(doc, i, 0, `elements[${i}]: "parameter" must be a number.`, vscode.DiagnosticSeverity.Warning));
      if (ids.has(Number(e['id'])))
        diags.push(this._diag(doc, i, 0, `elements[${i}]: duplicate id ${e['id']}.`, vscode.DiagnosticSeverity.Error));
      ids.add(Number(e['id']));
    });

    const bonds = model['bonds'];
    if (!Array.isArray(bonds)) {
      diags.push(this._diag(doc, 0, 0, 'Bond Graph model must have a "bonds" array.', vscode.DiagnosticSeverity.Error));
      return;
    }
    (bonds as unknown[]).forEach((b, i) => {
      if (!b || typeof b !== 'object') return;
      const bond = b as Record<string, unknown>;
      if (!ids.has(Number(bond['source'])))
        diags.push(this._diag(doc, i, 0, `bonds[${i}].source ${bond['source']} references unknown element id.`, vscode.DiagnosticSeverity.Error));
      if (!ids.has(Number(bond['target'])))
        diags.push(this._diag(doc, i, 0, `bonds[${i}].target ${bond['target']} references unknown element id.`, vscode.DiagnosticSeverity.Error));
    });
  }

  private _validateOdumEsl(
    doc: vscode.TextDocument,
    model: Record<string, unknown>,
    diags: vscode.Diagnostic[],
  ): void {
    const nodes = model['nodes'];
    if (!Array.isArray(nodes) || nodes.length === 0) {
      diags.push(this._diag(doc, 0, 0, 'Odum ESL model must have a non-empty "nodes" array.', vscode.DiagnosticSeverity.Error));
      return;
    }
    const ids = new Set<string>();
    const validTypes = new Set(['storage', 'source', 'sink', 'constant']);
    (nodes as unknown[]).forEach((n, i) => {
      if (!n || typeof n !== 'object') return;
      const node = n as Record<string, unknown>;
      if (!node['id'])
        diags.push(this._diag(doc, i, 0, `nodes[${i}]: "id" is required.`, vscode.DiagnosticSeverity.Error));
      if (!validTypes.has(String(node['type'])))
        diags.push(this._diag(doc, i, 0, `nodes[${i}]: unknown type "${node['type']}". Expected: storage, source, sink, constant.`, vscode.DiagnosticSeverity.Error));
      if (typeof node['value'] !== 'number')
        diags.push(this._diag(doc, i, 0, `nodes[${i}]: "value" must be a number.`, vscode.DiagnosticSeverity.Error));
      const idStr = String(node['id']);
      if (ids.has(idStr))
        diags.push(this._diag(doc, i, 0, `nodes[${i}]: duplicate id "${idStr}".`, vscode.DiagnosticSeverity.Error));
      ids.add(idStr);
    });
    const edges = model['edges'];
    if (Array.isArray(edges)) {
      (edges as unknown[]).forEach((e, i) => {
        if (!e || typeof e !== 'object') return;
        const edge = e as Record<string, unknown>;
        if (!ids.has(String(edge['origin'])))
          diags.push(this._diag(doc, i, 0, `edges[${i}].origin "${edge['origin']}" references unknown node.`, vscode.DiagnosticSeverity.Error));
        if (!ids.has(String(edge['target'])))
          diags.push(this._diag(doc, i, 0, `edges[${i}].target "${edge['target']}" references unknown node.`, vscode.DiagnosticSeverity.Error));
      });
    }
  }

  private _diag(
    doc: vscode.TextDocument,
    line: number,
    col: number,
    message: string,
    severity: vscode.DiagnosticSeverity,
  ): vscode.Diagnostic {
    const clampedLine = Math.min(line, doc.lineCount - 1);
    const range = doc.lineAt(clampedLine).range;
    return new vscode.Diagnostic(range, message, severity);
  }
}
