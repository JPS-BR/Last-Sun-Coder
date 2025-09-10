-- KB: chunks + FTS + embeddings
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS kb_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  file_id INTEGER,
  path TEXT NOT NULL,
  lang TEXT,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  content TEXT NOT NULL,
  md5 TEXT,
  tokens INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE SET NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS kb_chunks_fts
USING fts5(content, tokenize='unicode61');

-- Mantém FTS em sincronia
CREATE TRIGGER IF NOT EXISTS kb_chunks_ai AFTER INSERT ON kb_chunks BEGIN
  INSERT INTO kb_chunks_fts(rowid, content) VALUES (new.id, new.content);
END;
CREATE TRIGGER IF NOT EXISTS kb_chunks_au AFTER UPDATE ON kb_chunks BEGIN
  UPDATE kb_chunks_fts SET content = new.content WHERE rowid = new.id;
END;
CREATE TRIGGER IF NOT EXISTS kb_chunks_ad AFTER DELETE ON kb_chunks BEGIN
  DELETE FROM kb_chunks_fts WHERE rowid = old.id;
END;

-- Armazena embedding local (vetor em Float32)
CREATE TABLE IF NOT EXISTS kb_embeddings (
  chunk_id INTEGER PRIMARY KEY,
  dim INTEGER NOT NULL,
  norm REAL NOT NULL,
  vector BLOB NOT NULL,
  FOREIGN KEY(chunk_id) REFERENCES kb_chunks(id) ON DELETE CASCADE
);
