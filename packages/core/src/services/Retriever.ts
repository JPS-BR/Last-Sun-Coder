// packages/core/src/services/Retriever.ts
import { DB } from "./DB.js";

export type Retrieved = {
  chunk_id: number;
  path: string;
  start_line: number;
  end_line: number;
  score: number;
  reason: "bm25" | "vector" | "hybrid";
  content: string;
};

export function bm25(db: DB, projectId: number, query: string, k = 8): Retrieved[] {
  const rows = db.all<{ chunk_id: number; path: string; start_line: number; end_line: number; content: string; score: number }>(
    `
SELECT c.id as chunk_id, c.path, c.start_line, c.end_line, c.content,
       bm25(kb_chunks_fts) AS score
FROM kb_chunks_fts
JOIN kb_chunks c ON c.id = kb_chunks_fts.rowid
WHERE c.project_id = ?
  AND kb_chunks_fts MATCH ?
ORDER BY score ASC
LIMIT ?`,
    projectId,
    query,
    k
  );

  // Em FTS5, menor bm25 é melhor — invertendo p/ "maior é melhor".
  return rows.map((r) => ({
    chunk_id: r.chunk_id,
    path: r.path,
    start_line: r.start_line,
    end_line: r.end_line,
    content: r.content,
    score: -r.score,
    reason: "bm25" as const,
  }));
}

function cosine(a: Float32Array, b: Float32Array, an: number, bn: number): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return an && bn ? dot / (an * bn) : 0;
}

// Overloads p/ compat:
//  - vector(db, queryVec, queryNorm, k?)
//  - vector(db, projectId, queryVec, queryNorm, k?)
export function vector(db: DB, queryVec: Float32Array, queryNorm: number, k?: number): Retrieved[];
export function vector(db: DB, projectId: number, queryVec: Float32Array, queryNorm: number, k?: number): Retrieved[];
export function vector(db: DB, a: number | Float32Array, b: Float32Array | number, c?: number, d?: number): Retrieved[] {
  let projectId: number | undefined;
  let queryVec: Float32Array;
  let queryNorm: number;
  let k = 8;

  if (a instanceof Float32Array) {
    projectId = undefined;
    queryVec = a;
    queryNorm = b as number;
    if (typeof c === "number") k = c;
  } else {
    projectId = a as number;
    queryVec = b as Float32Array;
    queryNorm = c as number;
    if (typeof d === "number") k = d;
  }

  type Row = { chunk_id: number; dim?: number; norm: number; vector: Buffer; path: string; start_line: number; end_line: number; content: string };

  const rows = projectId != null
    ? db.all<Row>(
        `SELECT e.chunk_id, e.dim, e.norm, e.vector, c.path, c.start_line, c.end_line, c.content
           FROM kb_embeddings e
           JOIN kb_chunks c ON c.id = e.chunk_id
          WHERE c.project_id = ?`,
        projectId
      )
    : db.all<Row>(
        `SELECT e.chunk_id, e.dim, e.norm, e.vector, c.path, c.start_line, c.end_line, c.content
           FROM kb_embeddings e
           JOIN kb_chunks c ON c.id = e.chunk_id`
      );

  const scored = rows.map((r) => {
    const buf: Buffer = r.vector as unknown as Buffer;
    const vec = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
    const score = cosine(queryVec, vec, queryNorm, r.norm);
    return {
      chunk_id: r.chunk_id,
      path: r.path,
      start_line: r.start_line,
      end_line: r.end_line,
      content: r.content,
      score,
      reason: "vector" as const,
    } as Retrieved;
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

export function hybrid(
  db: DB,
  projectId: number,
  textQuery: string,
  queryVec: Float32Array,
  queryNorm: number,
  k = 8
): Retrieved[] {
  const a = bm25(db, projectId, textQuery, k * 2);
  const b = vector(db, projectId, queryVec, queryNorm, k * 4);

  const map = new Map<number, Retrieved & { w: number }>();
  const add = (xs: Retrieved[], w: number) => {
    for (const x of xs) {
      const cur = map.get(x.chunk_id);
      if (!cur) map.set(x.chunk_id, { ...x, w });
      else map.set(x.chunk_id, { ...cur, score: cur.score + x.score * w, reason: "hybrid" as const });
    }
  };
  add(a, 1.0);
  add(b, 1.0);
  const out = Array.from(map.values());
  out.sort((x, y) => y.score - x.score);
  return out.slice(0, k);
}