/* MdkDiagramPanel — VSCode Webview hosting the <mdk-dia> editor component (T6.3)
 *
 * Lifecycle:
 *   MdkDiagramPanel.createOrShow(extensionUri, fileUri, onUpdate)
 *     → opens (or reveals) the diagram panel
 *     → sends the current file contents to the webview
 *     → when the diagram fires a 'change' event, calls onUpdate(updatedJson)
 *
 * The webview loads @mdk/dia directly from the extension's local dist folder.
 * On first use the dist must exist (built via `make build` or `npm run build`
 * inside the container). The extension gracefully falls back to a loading notice
 * if the dist file is missing.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class MdkDiagramPanel {
  static currentPanel: MdkDiagramPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  readonly targetUri: vscode.Uri;
  private readonly _onUpdate: (json: string) => void;

  private constructor(
    panel: vscode.WebviewPanel,
    targetUri: vscode.Uri,
    onUpdate: (json: string) => void,
    extensionUri: vscode.Uri,
  ) {
    this._panel = panel;
    this.targetUri = targetUri;
    this._onUpdate = onUpdate;

    this._panel.webview.html = this._buildHtml(extensionUri);

    /* Send initial model */
    try {
      const content = fs.readFileSync(targetUri.fsPath, 'utf8');
      this.sendModel(content);
    } catch { /* file may not yet exist */ }

    /* Receive messages from the webview */
    this._panel.webview.onDidReceiveMessage(
      (msg: { type: string; model?: string }) => {
        if (msg.type === 'model-update' && msg.model) {
          this._onUpdate(msg.model);
        }
      },
      null,
      this._disposables,
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  static createOrShow(
    extensionUri: vscode.Uri,
    targetUri: vscode.Uri,
    onUpdate: (json: string) => void,
  ): MdkDiagramPanel {
    const column = vscode.ViewColumn.Beside;

    if (MdkDiagramPanel.currentPanel) {
      MdkDiagramPanel.currentPanel._panel.reveal(column);
      return MdkDiagramPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'mdkDiagram',
      `MDK Diagram — ${path.basename(targetUri.fsPath)}`,
      column,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist'),
          vscode.Uri.joinPath(extensionUri, '..', 'dia', 'dist'),
        ],
      },
    );

    MdkDiagramPanel.currentPanel = new MdkDiagramPanel(panel, targetUri, onUpdate, extensionUri);
    return MdkDiagramPanel.currentPanel;
  }

  sendModel(json: string): void {
    void this._panel.webview.postMessage({ type: 'load-model', model: json });
  }

  dispose(): void {
    MdkDiagramPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      d?.dispose();
    }
  }

  private _buildHtml(extensionUri: vscode.Uri): string {
    /* Try to locate the built mdk-dia.js */
    const diaDist = vscode.Uri.joinPath(extensionUri, '..', 'dia', 'dist', 'mdk-dia.js');
    const diaDistExists = fs.existsSync(diaDist.fsPath);
    const diaScriptUri = this._panel.webview.asWebviewUri(diaDist);

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src 'nonce-${nonce}';
             style-src 'unsafe-inline';
             img-src ${this._panel.webview.cspSource} data:;">
  <title>MDK Diagram</title>
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100vh; background: var(--vscode-editor-background); }
    mdk-dia { width: 100%; height: 100vh; }
    #loading { padding: 2rem; font-family: sans-serif; color: var(--vscode-foreground); }
  </style>
</head>
<body>
  ${diaDistExists
    ? `<mdk-dia id="editor"></mdk-dia>`
    : `<div id="loading">
        <h3>MDK Diagram editor not yet built.</h3>
        <p>Run <code>make build</code> from the repository root, then reopen this panel.</p>
      </div>`
  }

  ${diaDistExists ? `<script nonce="${nonce}" type="module" src="${diaScriptUri}"></script>` : ''}

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const editor = document.getElementById('editor');

    /* Receive model from extension */
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'load-model' && editor) {
        try {
          const json = JSON.parse(msg.model);
          /* Unwrap synthesised envelope if present */
          editor.value = json.model ?? json;
        } catch (e) {
          console.error('MDK: failed to parse model JSON', e);
        }
      }
    });

    /* Send model changes back to extension */
    if (editor) {
      editor.addEventListener('change', e => {
        vscode.postMessage({ type: 'model-update', model: JSON.stringify(e.detail, null, 2) });
      });
    }
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}
