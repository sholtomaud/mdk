/* MDK VSCode Extension (T5.3)
 *
 * Activation events: any TypeScript workspace, any *.mdk.json file, mdk.config.json present.
 *
 * Features:
 *   - @mdk/ts-plugin wired via package.json typescriptServerPlugins (hover docs, diagnostics)
 *   - DiagnosticProvider: runs `mdk validate` on save, shows errors in Problems panel (T5.3)
 *   - MdkDiagramPanel: Webview hosting <mdk-dia> web component (T6.3)
 *   - Bidirectional sync: file → Webview on disk change, Webview → file on editor edit (T6.3)
 *   - Status bar item: ✅ Valid / ❌ N errors
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MdkDiagramPanel } from './MdkDiagramPanel';
import { MdkDiagnosticProvider } from './MdkDiagnosticProvider';

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection('mdk');
  context.subscriptions.push(diagnostics);

  const provider = new MdkDiagnosticProvider(diagnostics);
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  statusBar.command = 'mdk.validate';
  context.subscriptions.push(statusBar);

  /* ── Commands ────────────────────────────────────────────────── */

  context.subscriptions.push(
    vscode.commands.registerCommand('mdk.openDiagram', () => {
      const editor = vscode.window.activeTextEditor;
      const uri = editor?.document.uri;
      if (!uri) {
        vscode.window.showErrorMessage('MDK: Open a .mdk.json file first.');
        return;
      }
      MdkDiagramPanel.createOrShow(context.extensionUri, uri, (updatedJson) => {
        /* Webview sent updated model — write to disk */
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.replace(uri, new vscode.Range(0, 0, Number.MAX_VALUE, 0), updatedJson);
        vscode.workspace.applyEdit(workspaceEdit);
      });
    }),

    vscode.commands.registerCommand('mdk.validate', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const doc = editor.document;
      const count = await provider.validateDocument(doc);
      if (count === 0) {
        statusBar.text = '$(check) MDK Valid';
        statusBar.backgroundColor = undefined;
        vscode.window.showInformationMessage('MDK: Model is valid.');
      } else {
        statusBar.text = `$(error) MDK ${count} error${count > 1 ? 's' : ''}`;
        statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        vscode.window.showWarningMessage(`MDK: ${count} validation error${count > 1 ? 's' : ''} — see Problems panel.`);
      }
      statusBar.show();
    }),

    vscode.commands.registerCommand('mdk.synth', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) { vscode.window.showErrorMessage('MDK: No workspace folder open.'); return; }
      const terminal = vscode.window.createTerminal('MDK Synth');
      terminal.sendText('mdk synth'); terminal.show();
    }),
  );

  /* ── Auto-validate on save ───────────────────────────────────── */

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      const cfg = vscode.workspace.getConfiguration('mdk');
      if (!cfg.get<boolean>('validateOnSave', true)) return;
      if (!isMdkJson(doc)) return;
      const count = await provider.validateDocument(doc);
      if (cfg.get<boolean>('showStatusBar', true)) {
        if (count === 0) {
          statusBar.text = '$(check) MDK Valid';
          statusBar.backgroundColor = undefined;
        } else {
          statusBar.text = `$(error) MDK ${count} error${count > 1 ? 's' : ''}`;
          statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        }
        statusBar.show();
      }
      /* Forward updated model to any open diagram panel */
      if (MdkDiagramPanel.currentPanel?.targetUri.toString() === doc.uri.toString()) {
        MdkDiagramPanel.currentPanel.sendModel(doc.getText());
      }
    }),
  );

  /* ── Watch .mdk.json files for external changes ──────────────── */

  const watcher = vscode.workspace.createFileSystemWatcher('**/*.mdk.json');
  context.subscriptions.push(watcher);
  watcher.onDidChange((uri) => {
    if (MdkDiagramPanel.currentPanel?.targetUri.toString() === uri.toString()) {
      const content = fs.readFileSync(uri.fsPath, 'utf8');
      MdkDiagramPanel.currentPanel.sendModel(content);
    }
  });

  /* Show status bar if a .mdk.json file is active */
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor && isMdkJson(editor.document)) statusBar.show();
      else statusBar.hide();
    }),
  );
}

export function deactivate(): void {
  MdkDiagramPanel.currentPanel?.dispose();
}

function isMdkJson(doc: vscode.TextDocument): boolean {
  return doc.fileName.endsWith('.mdk.json') || doc.fileName.endsWith('model.mdk.json');
}
