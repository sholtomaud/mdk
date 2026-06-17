#!/usr/bin/env node
import * as http from 'http';
import { StdioTransport } from './transport/stdio.js';
import { HttpTransport } from './transport/http.js';
import { createMdkServer } from './server.js';

const transportArg = process.argv.includes('--transport')
  ? process.argv[process.argv.indexOf('--transport') + 1]
  : 'stdio';

async function main(): Promise<void> {
  const server = createMdkServer();

  if (transportArg === 'http') {
    const httpTransport = new HttpTransport();
    await server.connect(httpTransport);

    const port = Number(process.env.PORT ?? 3001);
    const httpServer = http.createServer((req, res) => {
      const url = req.url ?? '/';

      if (req.method === 'GET' && url === '/sse') {
        httpTransport.attachSse(res);
        return;
      }

      if (req.method === 'POST' && url === '/messages') {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString());
            httpTransport.handlePost(body);
            res.writeHead(202);
            res.end();
          } catch {
            res.writeHead(400);
            res.end('Bad JSON');
          }
        });
        return;
      }

      res.writeHead(404);
      res.end();
    });

    httpServer.listen(port, () => {
      process.stderr.write(`MDK MCP server listening on http://localhost:${port}/sse\n`);
    });
    return;
  }

  const stdioTransport = new StdioTransport();
  await server.connect(stdioTransport);
  process.stderr.write('MDK MCP server running on stdio\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
