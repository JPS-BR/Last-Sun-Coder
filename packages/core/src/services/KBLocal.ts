// packages/core/src/services/KBLocal.ts
import { DB } from "./DB.js";
import * as crypto from "node:crypto";
import type { UnknownRecord } from "../types";
import type { RunResult } from "better-sqlite3";

export type InsertedChunk = {
  id: number;
  start_line: number;
  end_line: number;
  path: string;
};

export function migrateKB(db: DB): void {
  const sql = `
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
  md5 TEXT NOT NULL,
  tokens INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY(file_id)    REFERENCES files(id)    ON DELETE SET NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS kb_chunks_fts
USING fts5(content, tokenize='unicode61');

CREATE TRIGGER IF NOT EXISTS kb_chunks_ai AFTER INSERT ON kb_chunks BEGIN
  INSERT INTO kb_chunks_fts(rowid, content) VALUES (new.id, new.content);
END;
CREATE TRIGGER IF NOT EXISTS kb_chunks_au AFTER UPDATE ON kb_chunks BEGIN
  UPDATE kb_chunks_fts SET content = new.content WHERE rowid = new.id;
END;
CREATE TRIGGER IF NOT EXISTS kb_chunks_ad AFTER DELETE ON kb_chunks BEGIN
  DELETE FROM kb_chunks_fts WHERE rowid = old.id;
END;

CREATE TABLE IF NOT EXISTS kb_embeddings (
  chunk_id INTEGER PRIMARY KEY,
  dim INTEGER NOT NULL,
  norm REAL NOT NULL,
  vector BLOB NOT NULL,
  FOREIGN KEY(chunk_id) REFERENCES kb_chunks(id) ON DELETE CASCADE
);
`;
  db.exec(sql);
}

export function insertChunk(
  db: DB,
  projectId: number,
  fileId: number | null,
  path: string,
  lang: string | null,
  start_line: number,
  end_line: number,
  content: string
): InsertedChunk {
  const md5 = crypto.createHash("md5").update(content, "utf8").digest("hex");
  const info = db
    .prepare(
      "INSERT INTO kb_chunks(project_id,file_id,path,lang,start_line,end_line,content,md5) VALUES(?,?,?,?,?,?,?,?)"
    )
    .run(projectId, fileId || null, path, lang || null, start_line, end_line, content, md5);

  const infoRun = info as RunResult | UnknownRecord | undefined;
  const lastIdRaw =
    infoRun && typeof (infoRun as RunResult).lastInsertRowid !== "undefined"
      ? (infoRun as RunResult).lastInsertRowid
      : (infoRun as UnknownRecord)?.lastInsertRowid;
  const lastId = typeof lastIdRaw === "number" ? lastIdRaw : Number(lastIdRaw);
  return { id: lastId, start_line, end_line, path };
}

// Placeholder de embedding local (trocar depois por @xenova/transformers)
async function computeEmbedding(_text: string): Promise<Float32Array> {
  const dim = 384;
  const arr = new Float32Array(dim);
  // referencia _text para evitar lint de variável não usada
  if (_text.length >= 0) {
    arr[0] = 1;
  }
  return arr;
}

export async function upsertEmbeddingForChunk(db: DB, chunkId: number, text: string): Promise<void> {
  const exists = db
    .prepare<{ chunk_id: number }>("SELECT chunk_id FROM kb_embeddings WHERE chunk_id=?")
    .get(chunkId) as { chunk_id?: number } | undefined;
  if (exists?.chunk_id) return;

  const vec = await computeEmbedding(text);
  const norm = Math.hypot(...vec);
  const buf = Buffer.from(vec.buffer);
  db.prepare("INSERT INTO kb_embeddings(chunk_id, dim, norm, vector) VALUES(?,?,?,?)").run(
    chunkId,
    vec.length,
    norm,
    buf
  );
}