import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { applyMigrations } from "./Migrator.js";

export interface Stmt<T = unknown> {
  run(...args: any[]): any;
  get(...args: any[]): T;
  all(...args: any[]): T[];
}

export class DB {
  public readonly filePath: string;
  private db: Database.Database;

  constructor(filePath: string) {
    this.filePath = filePath;

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(filePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("foreign_keys = ON");
  }

  prepare<T = any>(sql: string): Stmt<T> {
    return this.db.prepare(sql) as unknown as Stmt<T>;
  }

  run(sql: string, ...params: any[]): void {
    this.db.prepare(sql).run(...params);
  }

  get<T = any>(sql: string, ...params: any[]): T {
    return this.db.prepare(sql).get(...params) as T;
  }

  all<T = any>(sql: string, ...params: any[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  transaction<T>(fn: (db: DB) => T): T {
    const trx = this.db.transaction(() => fn(this));
    return trx();
  }

  close(): void {
    this.db.close();
  }

  /**
   * Esquema base mínimo (fallback quando não há migrações).
   */
  migrateBase(): void {
    const sql = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  root TEXT NOT NULL UNIQUE,
  name TEXT,
  prefs_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

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

CREATE TABLE IF NOT EXISTS symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  file_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  signature TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY(file_id)    REFERENCES files(id)    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_symbols_proj_name ON symbols(project_id, name);
CREATE INDEX IF NOT EXISTS ix_symbols_file       ON symbols(file_id);
`;
    this.exec(sql);
  }

  /**
   * Aplica migrações do diretório resources/sql (se existir).
   */
  migrateFromResources(dir?: string): void {
    const baseDir =
      dir ??
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../resources/sql"
      );
    if (fs.existsSync(baseDir)) {
      applyMigrations(this, baseDir);
    }
  }
}

export default DB;