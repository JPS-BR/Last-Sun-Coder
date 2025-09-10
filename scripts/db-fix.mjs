#!/usr/bin/env node
import path from "node:path";
import * as core from "../packages/core/dist/index.js";
const { DB } = core;

const args = process.argv.slice(2);
let root = ".";
for (let i = 0; i < args.length; i++) if (args[i] === "--root") root = args[++i];

const dbPath = path.resolve(root, ".lastsun/lastsun.db");
const db = new DB(dbPath);

// garante esquema base antes de tentar alterar colunas/índices
try {
  if (typeof db.migrateBase === "function") db.migrateBase();
  if (typeof db.migrateFromResources === "function") db.migrateFromResources();
} catch {}

// verifica colunas atuais (se tabela não existir, PRAGMA retorna lista vazia)
const cols = (db.all("PRAGMA table_info(projects)") || []).map((r) => r.name) || [];
if (!cols.includes("name")) {
  db.prepare("ALTER TABLE projects ADD COLUMN name TEXT").run();
}
if (!cols.includes("prefs_json")) {
  db.prepare("ALTER TABLE projects ADD COLUMN prefs_json TEXT").run();
}

// garante UNIQUE em root (se não houver)
try {
  db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS ux_projects_root ON projects(root)").run();
} catch {}

// preenche name vazio com basename do root
const rows = db.all("SELECT id, root, name FROM projects");
for (const r of rows) {
  if (!r.name || r.name === "") {
    const base = path.basename(path.resolve(r.root));
    db.prepare("UPDATE projects SET name=? WHERE id=?").run(base, r.id);
  }
}
console.log("DB fix ok.");