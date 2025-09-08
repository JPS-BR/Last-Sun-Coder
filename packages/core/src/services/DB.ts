import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";

// Interface mínima, suficiente pro nosso uso,
// evita exportar BetterSqlite3.Statement no .d.ts
export interface Stmt<T = unknown> {
  run(...args: any[]): any;
  get(...args: any[]): T;
  all(...args: any[]): T[];
}

export class DB {
  private db: Database.Database;
  readonly filePath: string;

  constructor(dbFile: string) {
    const dir = path.dirname(dbFile);
    fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(dbFile);
    this.filePath = dbFile;
  }

  run(sql: string): void {
    this.db.exec(sql);
  }

  // ⬇️ aqui a mudança importante
  prepare<T = unknown>(sql: string): Stmt<T> {
    return this.db.prepare(sql) as unknown as Stmt<T>;
  }

  close(): void {
    this.db.close();
  }

  migrateBase(): void {
    const sql = `
CREATE TABLE IF NOT EXISTS projects(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  root TEXT NOT NULL,
  prefs_json TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_root ON projects(root);

CREATE TABLE IF NOT EXISTS chats(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  title TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  tags_json TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS files(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  path TEXT NOT NULL,
  lang TEXT,
  hash TEXT,
  size INTEGER,
  mtime INTEGER,
  FOREIGN KEY(project_id) REFERENCES files(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_files_project_path ON files(project_id, path);

CREATE TABLE IF NOT EXISTS symbols(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  sig TEXT,
  FOREIGN KEY(file_id) REFERENCES files(id)
);
`;
    this.run(sql);
  }
}
