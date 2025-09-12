import * as fs from "node:fs";
import * as path from "node:path";
import type { MigrationDB } from "../types";

export function applyMigrations(db: MigrationDB, migrationsDir: string): void {
  if (!fs.existsSync(migrationsDir)) return;

  // Prefer underlying native DB object when available (e.g. db.db in our DB wrapper)
  const native = (db && (db as any).db && typeof (db as any).db.prepare === 'function') ? (db as any).db : (db as any);

  // quick noop to validate native binding early
  try {
    if (typeof native.exec === 'function') native.exec("PRAGMA foreign_keys = ON");
    else if (typeof native.run === 'function') native.run("PRAGMA foreign_keys = ON");
  } catch (e) {
    // ignore and let migration logic handle failures later
  }

  // tabela de controle
  const ensure = "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)";
  if (typeof native.exec === "function") native.exec(ensure);
  else if (typeof native.run === 'function') native.run(ensure as unknown as string);

  const applied = new Set<string>();
  const q = typeof native.prepare === 'function' ? native.prepare("SELECT id FROM schema_migrations") : undefined;
  const allFn = q && typeof q.all === 'function' ? (q.all as Function).bind(q) : (() => [] as { id: string }[]);
  for (const row of allFn()) {
    const id = (row as { id?: unknown }).id;
    if (typeof id === 'string') applied.add(id);
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => /^\d+_.*\.sql$/i.test(f))
    .sort((a, b) => a.localeCompare(b, "en"));

  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, f), "utf8");
    if (typeof native.exec === "function") native.exec(sql);
    else if (typeof native.run === 'function') native.run(sql as unknown as string);

    const stmt = typeof native.prepare === 'function' ? native.prepare("INSERT INTO schema_migrations(id, applied_at) VALUES(?, strftime('%s','now'))") : undefined;
    if (stmt && typeof stmt.run === "function") stmt.run(f as unknown as string);
  }
}
