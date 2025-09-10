#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

// importa tudo do bundle do core (tsup gera dist/index.js)
import * as core from "../packages/core/dist/index.js";
const { DB, migrateKB, insertChunk, upsertEmbeddingForChunk } = core;

function chunkByLines(p, text, linesPerChunk = 200) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i += linesPerChunk) {
    const start = i + 1;
    const end = Math.min(i + linesPerChunk, lines.length);
    out.push({ path: p, start_line: start, end_line: end, content: lines.slice(i, end).join("\n") });
  }
  return out;
}

// bm25 direto via FTS5 (evita depender do export do Retriever no script)
function bm25(db, projectId, query, k = 8) {
  const rows = db.all(
    `
    SELECT c.id as chunk_id, c.path, c.start_line, c.end_line, c.content,
           bm25(kb_chunks_fts) AS score
    FROM kb_chunks_fts
    JOIN kb_chunks c ON c.id = kb_chunks_fts.rowid
    WHERE c.project_id = ? AND kb_chunks_fts MATCH ?
    ORDER BY score ASC
    LIMIT ?`,
    projectId,
    query,
    k
  );
  return rows.map((r) => ({
    chunk_id: r.chunk_id,
    path: r.path,
    start_line: r.start_line,
    end_line: r.end_line,
    content: r.content,
    score: -r.score, // menor é melhor no bm25 do SQLite; invertido para score maior=melhor
  }));
}

const args = process.argv.slice(2);
let root = ".";
let file = null;
let query = "function OR class";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--root") {
    root = args[++i];
    continue;
  }
  if (args[i] === "--file") {
    file = args[++i];
    continue;
  }
  if (args[i] === "--query") {
    query = args[++i];
    continue;
  }
}

const dbPath = path.resolve(root, ".lastsun/lastsun.db");
const db = new DB(dbPath);

// garante schema KB
try {
  migrateKB(db);
} catch {}

// pega o primeiro projeto cadastrado
const proj = db.prepare("SELECT id, root FROM projects ORDER BY id LIMIT 1").get();
if (!proj) {
  console.error('Nenhum projeto encontrado. Rode: npm run lsc -- init --root "."');
  process.exit(2);
}
const projectId = proj.id;

let content = "";
let targetPath = "";
if (file) {
  targetPath = path.resolve(file);
  content = await fs.readFile(targetPath, "utf8");
} else {
  targetPath = "SAMPLE.txt";
  content = [
    "Sample file for KB validation",
    "function add(a,b){ return a+b }",
    "class Calc { mul(a,b){ return a*b } }",
  ].join("\n");
}

// cria/atualiza chunks e embeddings
const chunks = chunkByLines(targetPath, content, 200);
let inserted = 0;
for (const c of chunks) {
  const row = insertChunk(db, projectId, null, c.path, undefined, c.start_line, c.end_line, c.content);
  await upsertEmbeddingForChunk(db, row.id, c.content);
  inserted++;
}
console.log(`OK: ${inserted} chunks upserted into KB`);

// sanity check de busca
const results = bm25(db, projectId, query, 5);
if (results.length === 0) {
  console.error("ERRO: bm25 não retornou resultados. Tente outra query.");
  process.exit(3);
}
console.log("OK: bm25 retornou", results.length, "itens");
for (const r of results) {
  const preview = r.content.split("\n")[0];
  console.log(` - ${r.path}:${r.start_line}-${r.end_line}  score=${r.score.toFixed(3)}  "${preview}"`);
}
process.exit(0);