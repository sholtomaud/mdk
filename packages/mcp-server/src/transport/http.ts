import * as http from 'http';
import type { JsonRpcRequest, JsonRpcResponse } from './types.js';

export class HttpTransport {
  private sseRes: http.ServerResponse | null = null;
  onMessage?: (msg: JsonRpcRequest) => void;

  attachSse(res: http.ServerResponse): void {
    this.sseRes = res;
    res.writeHead(200, {
      'content-type':  'text/event-stream',
      'cache-control': 'no-cache',
      'connection':    'keep-alive',
      'access-control-allow-origin': '*',
    });
  }

  send(msg: JsonRpcResponse | object): void {
    this.sseRes?.write(`data: ${JSON.stringify(msg)}\n\n`);
  }

  handlePost(body: unknown): void {
    try {
      this.onMessage?.(body as JsonRpcRequest);
    } catch { /* ignore */ }
  }
}
