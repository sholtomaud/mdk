import * as readline from 'readline';
import type { JsonRpcRequest, JsonRpcResponse } from './types.js';

export class StdioTransport {
  private rl: readline.Interface;
  onMessage?: (msg: JsonRpcRequest) => void;

  constructor() {
    this.rl = readline.createInterface({ input: process.stdin, terminal: false });
    this.rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const msg = JSON.parse(trimmed) as JsonRpcRequest;
        this.onMessage?.(msg);
      } catch { /* ignore malformed */ }
    });
    this.rl.on('close', () => process.exit(0));
  }

  send(msg: JsonRpcResponse | object): void {
    process.stdout.write(JSON.stringify(msg) + '\n');
  }

  close(): void {
    this.rl.close();
  }
}
