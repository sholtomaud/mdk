#!/usr/bin/env node
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { chat, chatStream } from './gemini.js';

const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_DIR = path.resolve(__dirname, '../public');

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js':   'text/javascript',
  '.css':  'text/css',
  '.ico':  'image/x-icon',
};

function serveFile(res: http.ServerResponse, filePath: string): void {
  const ext = path.extname(filePath);
  const mime = MIME[ext] ?? 'application/octet-stream';
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'content-type': mime });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url ?? '/';

  /* ── GET /chat-stream (SSE) ───────────────────────────────── */
  if (req.method === 'GET' && url.startsWith('/chat-stream')) {
    const params = new URLSearchParams(url.split('?')[1] ?? '');
    const message = params.get('message')?.trim() ?? '';
    const historyRaw = params.get('history') ?? '[]';
    let history: Array<{ role: string; parts: Array<{ text?: string }> }> = [];
    try { history = JSON.parse(decodeURIComponent(historyRaw)); } catch { /* ignore */ }

    const socraticAnswers = params.get('socratic_answers') ?? '';
    const correctionJson  = params.get('correction_json') ?? '';

    if (!message) {
      res.writeHead(400);
      res.end('message param required');
      return;
    }

    res.writeHead(200, {
      'content-type':  'text/event-stream',
      'cache-control': 'no-cache',
      'connection':    'keep-alive',
      'access-control-allow-origin': '*',
    });

    const send = (event: object) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      for await (const event of chatStream(history, message, socraticAnswers, correctionJson)) {
        send(event);
      }
    } catch (e) {
      send({ type: 'error', message: String(e) });
    } finally {
      res.write('data: {"type":"done"}\n\n');
      res.end();
    }
    return;
  }

  /* ── POST /chat (batch JSON — backward compat) ─────────────── */
  if (req.method === 'POST' && url === '/chat') {
    res.setHeader('content-type', 'application/json');
    try {
      const raw = await readBody(req);
      const { message, history = [] } = JSON.parse(raw) as {
        message: string;
        history: Array<{ role: string; parts: Array<{ text?: string }> }>;
      };

      if (!message?.trim()) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'message is required' }));
        return;
      }

      const result = await chat(history, message);
      res.writeHead(200);
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  /* ── Static files ────────────────────────────────────────────── */
  if (req.method === 'GET') {
    const filePath = url === '/' || url === '/index.html'
      ? path.join(PUBLIC_DIR, 'index.html')
      : path.join(PUBLIC_DIR, url);
    serveFile(res, filePath);
    return;
  }

  res.writeHead(405);
  res.end();
});

server.listen(PORT, () => {
  process.stderr.write(`MDK chat demo running on http://localhost:${PORT}\n`);
});
