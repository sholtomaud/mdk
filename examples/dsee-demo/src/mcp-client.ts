import * as child_process from 'child_process';
import * as readline from 'readline';
import * as path from 'path';

let _client: MdkMcpClient | null = null;

class MdkMcpClient {
  private proc: child_process.ChildProcess;
  private rl: readline.Interface;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private nextId = 1;
  private initialized = false;

  constructor(serverScript: string) {
    this.proc = child_process.spawn('node', [serverScript], {
      env: { ...process.env } as Record<string, string>,
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    this.rl = readline.createInterface({ input: this.proc.stdout!, terminal: false });
    this.rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const msg = JSON.parse(trimmed) as { id?: number; result?: unknown; error?: { message: string } };
        if (msg.id != null) {
          const handler = this.pending.get(msg.id);
          if (handler) {
            this.pending.delete(msg.id);
            if ((msg as { error?: unknown }).error) {
              handler.reject(new Error(((msg as { error?: { message?: string } }).error)?.message ?? 'RPC error'));
            } else {
              handler.resolve(msg.result);
            }
          }
        }
      } catch { /* ignore malformed */ }
    });

    this.proc.on('exit', () => {
      for (const { reject } of this.pending.values()) {
        reject(new Error('MCP server process exited'));
      }
      this.pending.clear();
    });
  }

  private send(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      this.proc.stdin!.write(msg + '\n');
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Timeout waiting for response to ${method}`));
        }
      }, 120_000);
      // prevent timer from keeping event loop alive
      if (typeof timer === 'object' && timer.unref) timer.unref();
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mdk-chat-demo', version: '0.1.0' },
    });
    // fire-and-forget — server sends no response for notifications
    this.proc.stdin!.write(
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n',
    );
    this.initialized = true;
    process.stderr.write('MDK MCP client connected\n');
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    await this.initialize();
    const result = await this.send('tools/call', { name, arguments: args }) as {
      content: Array<{ type: string; text?: string }>;
    };
    return (result.content ?? []).map(c => c.text ?? '').join('');
  }

  dispose(): void {
    this.rl.close();
    this.proc.kill();
  }
}

async function getClient(): Promise<MdkMcpClient> {
  if (_client) return _client;
  const serverScript = path.resolve(process.cwd(), 'packages/mcp-server/dist/index.js');
  _client = new MdkMcpClient(serverScript);
  return _client;
}

export async function callMdkTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const client = await getClient();
  return client.callTool(name, args);
}
