import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

/* ── DB location ─────────────────────────────────────────────────────
 * Defaults to .mdk/state.db in the working directory so each MDK
 * project gets its own isolated state. Override via MDK_DB_PATH.
 * ──────────────────────────────────────────────────────────────────── */

/* ── SQL injection policy ─────────────────────────────────────────────
 * ALL user-supplied values are passed via ? placeholders, never
 * interpolated into SQL strings. Template literals are used only for
 * multi-line formatting — none contain ${} expressions on runtime data.
 *
 * The one exception is updateBlock(), which interpolates column names
 * (not values) because SQLite does not allow ? for identifiers. That
 * function is safe only because its `fields` parameter is typed as
 * Partial<Pick<Block, 'model_json'|'status'|'validation_json'>>, which
 * constrains the key set to known column names at compile time.
 * ─── DO NOT widen that type to accept arbitrary keys without adding ───
 * ─── an explicit allowlist check, or SQL injection becomes possible. ──
 * ──────────────────────────────────────────────────────────────────── */

function resolveDbPath(): string {
  if (process.env.MDK_DB_PATH) return process.env.MDK_DB_PATH;
  const dir = path.join(process.cwd(), '.mdk');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'state.db');
}

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (_db) return _db;
  _db = new DatabaseSync(resolveDbPath());
  migrate(_db);
  return _db;
}

/* ── Schema ──────────────────────────────────────────────────────────*/

function migrate(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;

    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT,
      domain      TEXT DEFAULT 'bondgraph',
      status      TEXT DEFAULT 'active',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS blocks (
      id              TEXT PRIMARY KEY,
      project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      parent_id       TEXT REFERENCES blocks(id) ON DELETE CASCADE,
      name            TEXT NOT NULL,
      spec            TEXT,
      model_json      TEXT,
      domain          TEXT DEFAULT 'bondgraph',
      status          TEXT DEFAULT 'pending',
      validation_json TEXT,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS relations (
      id            TEXT PRIMARY KEY,
      project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      from_id       TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
      to_id         TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
      relation_type TEXT NOT NULL,
      metadata      TEXT
    ) STRICT;

    CREATE TABLE IF NOT EXISTS generation_log (
      id          INTEGER PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      block_id    TEXT REFERENCES blocks(id) ON DELETE SET NULL,
      tool_name   TEXT NOT NULL,
      input_json  TEXT,
      output_json TEXT,
      ts          INTEGER NOT NULL
    ) STRICT;
  `);
}

/* ── Helpers ─────────────────────────────────────────────────────────*/

export function uuid(): string {
  return crypto.randomUUID();
}

export function now(): number {
  return Date.now();
}

/* ── Project CRUD ────────────────────────────────────────────────────*/

export interface Project {
  id: string;
  name: string;
  description: string | null;
  domain: string;
  status: string;
  created_at: number;
  updated_at: number;
}

export function createProject(name: string, description: string | null, domain = 'bondgraph'): Project {
  const db = getDb();
  const id = uuid();
  const ts = now();
  db.prepare(`
    INSERT INTO projects (id, name, description, domain, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
  `).run(id, name, description, domain, ts, ts);
  return getProject(id)!;
}

export function getProject(id: string): Project | null {
  return (getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as unknown as Project) ?? null;
}

export function listProjects(): Project[] {
  return getDb().prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as unknown as Project[];
}

/* ── Block CRUD ──────────────────────────────────────────────────────*/

export interface Block {
  id: string;
  project_id: string;
  parent_id: string | null;
  name: string;
  spec: string | null;
  model_json: string | null;
  domain: string;
  status: string;
  validation_json: string | null;
  created_at: number;
  updated_at: number;
}

export function createBlock(
  projectId: string,
  name: string,
  spec: string | null,
  parentId: string | null = null,
  domain = 'bondgraph',
): Block {
  const db = getDb();
  const id = uuid();
  const ts = now();
  db.prepare(`
    INSERT INTO blocks (id, project_id, parent_id, name, spec, domain, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(id, projectId, parentId, name, spec, domain, ts, ts);
  return getBlock(id)!;
}

export function getBlock(id: string): Block | null {
  return (getDb().prepare('SELECT * FROM blocks WHERE id = ?').get(id) as unknown as Block) ?? null;
}

export function updateBlock(id: string, fields: Partial<Pick<Block, 'model_json' | 'status' | 'validation_json'>>): void {
  // Column names cannot be bound with ?, so they are interpolated below.
  // Safety depends entirely on the Pick<> type above limiting keys to the
  // three known column names. If you widen `fields` to accept arbitrary
  // keys you MUST add an explicit allowlist before this loop, e.g.:
  //   const ALLOWED = new Set(['model_json', 'status', 'validation_json']);
  //   if (!ALLOWED.has(k)) throw new Error(`Disallowed column: ${k}`);
  const db = getDb();
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = ?`);  // k is a compile-time-constrained column name
    vals.push(v);            // v is bound via ?, not interpolated
  }
  sets.push('updated_at = ?');
  vals.push(now());
  vals.push(id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.prepare(`UPDATE blocks SET ${sets.join(', ')} WHERE id = ?`).run(...(vals as any[]));
}

export function listBlocks(projectId: string, status?: string): Block[] {
  if (status) {
    return getDb().prepare('SELECT * FROM blocks WHERE project_id = ? AND status = ? ORDER BY created_at').all(projectId, status) as unknown as Block[];
  }
  return getDb().prepare('SELECT * FROM blocks WHERE project_id = ? ORDER BY created_at').all(projectId) as unknown as Block[];
}

export function listPendingBlocks(projectId: string): Block[] {
  return listBlocks(projectId, 'pending');
}

export function getBlockChildren(blockId: string): Block[] {
  return getDb().prepare('SELECT * FROM blocks WHERE parent_id = ? ORDER BY created_at').all(blockId) as unknown as Block[];
}

/* ── Relation CRUD ───────────────────────────────────────────────────*/

export interface Relation {
  id: string;
  project_id: string;
  from_id: string;
  to_id: string;
  relation_type: string;
  metadata: string | null;
}

export function createRelation(
  projectId: string,
  fromId: string,
  toId: string,
  relationType: string,
  metadata?: Record<string, unknown>,
): Relation {
  const db = getDb();
  const id = uuid();
  db.prepare(`
    INSERT INTO relations (id, project_id, from_id, to_id, relation_type, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, projectId, fromId, toId, relationType, metadata ? JSON.stringify(metadata) : null);
  return { id, project_id: projectId, from_id: fromId, to_id: toId, relation_type: relationType, metadata: metadata ? JSON.stringify(metadata) : null };
}

export function listRelations(projectId: string): Relation[] {
  return getDb().prepare('SELECT * FROM relations WHERE project_id = ?').all(projectId) as unknown as Relation[];
}

/* ── Generation log ──────────────────────────────────────────────────*/

export function logGeneration(
  projectId: string,
  blockId: string | null,
  toolName: string,
  input: unknown,
  output: unknown,
): void {
  getDb().prepare(`
    INSERT INTO generation_log (project_id, block_id, tool_name, input_json, output_json, ts)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(projectId, blockId, toolName, JSON.stringify(input), JSON.stringify(output), now());
}
