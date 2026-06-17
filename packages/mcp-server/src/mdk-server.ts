import type { JsonRpcRequest, JsonRpcResponse, ToolDefinition, ToolHandler } from './transport/types.js';
import type { StdioTransport } from './transport/stdio.js';
import type { HttpTransport } from './transport/http.js';

const PROTOCOL_VERSION = '2024-11-05';

export class MdkServer {
  private tools = new Map<string, { def: ToolDefinition; handler: ToolHandler }>();
  private transport: StdioTransport | HttpTransport | null = null;

  tool(
    name: string,
    description: string,
    inputSchema: ToolDefinition['inputSchema'],
    handler: ToolHandler,
  ): void {
    this.tools.set(name, { def: { name, description, inputSchema }, handler });
  }

  async connect(transport: StdioTransport | HttpTransport): Promise<void> {
    this.transport = transport;
    transport.onMessage = (msg) => { void this.handleMessage(msg); };
  }

  private respond(id: number | string | null, result: unknown): void {
    const msg: JsonRpcResponse = { jsonrpc: '2.0', id, result };
    this.transport?.send(msg);
  }

  private respondError(id: number | string | null, code: number, message: string): void {
    const msg: JsonRpcResponse = { jsonrpc: '2.0', id, error: { code, message } };
    this.transport?.send(msg);
  }

  private async handleMessage(msg: JsonRpcRequest): Promise<void> {
    const { id, method, params } = msg;

    switch (method) {
      case 'initialize':
        this.respond(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'mdk-server', version: '0.1.0' },
        });
        return;

      case 'notifications/initialized':
      case 'initialized':
        return; // no response

      case 'ping':
        this.respond(id, {});
        return;

      case 'tools/list':
        this.respond(id, {
          tools: [...this.tools.values()].map(({ def }) => ({
            name:        def.name,
            description: def.description,
            inputSchema: def.inputSchema,
          })),
        });
        return;

      case 'tools/call': {
        const p = params as { name: string; arguments: unknown };
        const entry = this.tools.get(p.name);
        if (!entry) {
          this.respondError(id, -32601, `Tool not found: ${p.name}`);
          return;
        }
        try {
          const result = await entry.handler(p.arguments);
          const text = typeof result === 'string' ? result : JSON.stringify(result);
          this.respond(id, { content: [{ type: 'text', text }] });
        } catch (e) {
          this.respondError(id, -32000, String(e));
        }
        return;
      }

      default:
        this.respondError(id, -32601, `Method not found: ${method}`);
    }
  }
}
