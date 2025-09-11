PRAGMA foreign_keys = ON;

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
