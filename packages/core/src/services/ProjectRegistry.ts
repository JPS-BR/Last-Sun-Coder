import * as fs from "node:fs";
import * as path from "node:path";
import { DB } from "./DB.js";
import { ProjectPrefs, ProjectRow } from "../models/types.js";
import type { Project, UnknownRecord } from "../types";

export type OpenProject = {
  db: DB;
  project: Project;
};

function projectDbPath(root: string): string {
  return path.join(root, ".lastsun", "lastsun.db");
}

export function ensureRoot(root: string): void {
  const dir = path.join(root, ".lastsun");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function ensureProjectsTable(db: DB): void {
  const cols: string[] =
    db
      .prepare<{ name: string }>("PRAGMA table_info(projects)")
      .all()
      .map((r) => r.name) || [];

  if (cols.length === 0) {
    db.exec(`
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  root TEXT NOT NULL UNIQUE,
  name TEXT,
  prefs_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_projects_root ON projects(root);
    `);
    return;
  }
  if (!cols.includes("name")) db.prepare("ALTER TABLE projects ADD COLUMN name TEXT").run();
  if (!cols.includes("prefs_json")) db.prepare("ALTER TABLE projects ADD COLUMN prefs_json TEXT").run();
  db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS ux_projects_root ON projects(root)").run();
}

function ensureFilesTable(db: DB): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  path TEXT NOT NULL,
  lang TEXT,
  hash TEXT,
  size INTEGER,
  mtime INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(project_id, path),
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_files_proj ON files(project_id);
`);
}

export function openOrCreateProject(root: string, name?: string): OpenProject {
  ensureRoot(root);
  const dbPath = projectDbPath(root);
  const db = new DB(dbPath);
  db.migrateBase();
  ensureProjectsTable(db);
  ensureFilesTable(db);

  const normRoot = path.resolve(root).replace(/\\\\/g, "/");
  let row = db
    .prepare<ProjectRow>("SELECT id, root, name, prefs_json FROM projects WHERE root = ?")
    .get(normRoot) as ProjectRow | undefined;

  if (!row) {
    const info = db
      .prepare("INSERT INTO projects(root, name, prefs_json) VALUES(?,?,?)")
      .run(normRoot, name || null, null);
    const id = Number((info as UnknownRecord).lastInsertRowid);
    row = { id, root: normRoot, name: name || null, prefs_json: null } as ProjectRow;
  } else if (name && row.name !== name) {
    db.prepare("UPDATE projects SET name=? WHERE id=?").run(name, (row as UnknownRecord).id);
    row = { ...(row as UnknownRecord), name } as ProjectRow;
  }

  return { db, project: row as Project };
}

export function upsertFile(
  db: DB,
  projectId: number,
  projectRoot: string,
  filePath: string,
  lang: string | null,
  hash: string
): number {
  const rel = path.relative(projectRoot, filePath).replace(/\\\\/g, "/");

  const stat = fs.statSync(filePath);
  const existing = db
    .prepare<{ id: number; hash: string; size: number; mtime: number }>(
      "SELECT id, hash, size, mtime FROM files WHERE project_id = ? AND path = ?"
    )
    .get(projectId, rel) as { id?: number; hash?: string; size?: number; mtime?: number } | undefined;

  if (existing?.id) {
    if (
      existing.hash !== hash ||
      existing.size !== stat.size ||
      existing.mtime !== Math.floor(stat.mtimeMs)
    ) {
      db.prepare("UPDATE files SET lang=?, hash=?, size=?, mtime=? WHERE id = ?").run(
        lang || null,
        hash,
        stat.size,
        Math.floor(stat.mtimeMs),
        existing.id
      );
    }
    return existing.id;
  }

  const info = db
    .prepare("INSERT INTO files(project_id, path, lang, hash, size, mtime) VALUES(?,?,?,?,?,?)")
    .run(projectId, rel, lang || null, hash, stat.size, Math.floor(stat.mtimeMs));
  return Number((info as UnknownRecord).lastInsertRowid);
}

export function projectRoot(db: DB, projectId: number): string {
  const row = db
    .prepare<{ root: string }>("SELECT root FROM projects WHERE id = ?")
    .get(projectId) as { root: string };
  return row.root;
}

/**
 * Salva a whitelist do projeto em projects.prefs_json (chave: "whitelist").
 * Aceita padrões glob/relativos ao root. Remove duplicados e ordena.
 */
export function setWhitelist(db: DB, projectId: number, patterns: string[]): void {
  const row =
    (db
      .prepare<{ prefs_json: string | null }>("SELECT prefs_json FROM projects WHERE id = ?")
      .get(projectId) as { prefs_json: string | null }) || { prefs_json: null };

  const prefs: ProjectPrefs | Record<string, unknown> = row.prefs_json
    ? JSON.parse(row.prefs_json)
    : {};

  const clean = Array.from(new Set((patterns || []).map((s) => String(s).trim()).filter(Boolean))).sort();
  (prefs as UnknownRecord).whitelist = clean;

  db
    .prepare("UPDATE projects SET prefs_json = ?, updated_at = strftime('%s','now') WHERE id = ?")
    .run(JSON.stringify(prefs), projectId);
}