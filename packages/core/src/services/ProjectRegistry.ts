import * as fs from "node:fs";
import * as path from "node:path";
import { DB } from "./DB.js";
import { ProjectPrefs, ProjectRow } from "../models/types.js";

export type OpenProject = {
  db: DB;
  project: ProjectRow;
};

function projectDbPath(root: string): string {
  return path.join(root, ".lastsun", "lastsun.db");
}

export function ensureRoot(root: string): void {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Diretório raiz inválido: ${root}`);
  }
}

export function openOrCreateProject(root: string, name?: string): OpenProject {
  ensureRoot(root);
  const dbPath = projectDbPath(root);
  const db = new DB(dbPath);
  db.migrateBase();

  const row = db
    .prepare<{ id: number }>("SELECT id FROM projects WHERE root = ?")
    .get(root) as { id?: number } | undefined;

  let project: ProjectRow | undefined;

  if (!row?.id) {
    const projectName = name?.trim() || path.basename(path.resolve(root));
    db.prepare(
      "INSERT INTO projects(name, root, prefs_json) VALUES (?, ?, ?)"
    ).run(projectName, root, JSON.stringify({ whitelist: ["src", "packages"] }));
  }

  project = db
    .prepare<ProjectRow>("SELECT id, name, root, prefs_json FROM projects WHERE root = ?")
    .get(root) as ProjectRow;

  return { db, project };
}

export function setWhitelist(db: DB, projectId: number, whitelist: string[]): void {
  const proj = db
    .prepare<ProjectRow>("SELECT id, name, root, prefs_json FROM projects WHERE id = ?")
    .get(projectId) as ProjectRow;
  const prefs: ProjectPrefs = proj?.prefs_json ? JSON.parse(proj.prefs_json) : {};
  prefs.whitelist = whitelist;
  db.prepare("UPDATE projects SET prefs_json = ? WHERE id = ?")
    .run(JSON.stringify(prefs), projectId);
}

export function upsertFile(
  db: DB,
  projectId: number,
  filePath: string,
  lang?: string
): number {
  const stat = fs.statSync(filePath);
  const rel = path.relative(projectRoot(db, projectId), filePath).replace(/\\/g, "/");
  const existing = db
    .prepare<{ id: number }>(
      "SELECT id FROM files WHERE project_id = ? AND path = ?"
    )
    .get(projectId, rel) as { id?: number } | undefined;

  const hash = `${stat.size}-${stat.mtimeMs}`;

  if (existing?.id) {
    db.prepare(
      "UPDATE files SET lang=?, hash=?, size=?, mtime=? WHERE id=?"
    ).run(lang || null, hash, stat.size, Math.floor(stat.mtimeMs), existing.id);
    return existing.id;
  }

  const info = db
    .prepare("INSERT INTO files(project_id, path, lang, hash, size, mtime) VALUES(?,?,?,?,?,?)")
    .run(projectId, rel, lang || null, hash, stat.size, Math.floor(stat.mtimeMs));
  return Number(info.lastInsertRowid);
}

export function projectRoot(db: DB, projectId: number): string {
  const row = db
    .prepare<{ root: string }>("SELECT root FROM projects WHERE id = ?")
    .get(projectId) as { root: string };
  return row.root;
}
