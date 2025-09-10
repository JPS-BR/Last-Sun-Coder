import * as fs from "node:fs";
import * as path from "node:path";

export function applyMigrations(db: any, migrationsDir: string): void {
  if (!fs.existsSync(migrationsDir)) return;

  // tabela de controle
  const ensure = "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)";
  if (typeof db.exec === "function") db.exec(ensure); else db.run(ensure);

  const applied = new Set<string>();
  const q = (db.prepare?.("SELECT id FROM schema_migrations") ?? { all: () => [] });
  for (const row of q.all()) applied.add(row.id);

  const files = fs.readdirSync(migrationsDir)
    .filter(f => /^\d+_.*\.sql$/i.test(f))
    .sort((a, b) => a.localeCompare(b, "en"));

  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, f), "utf8");
    if (typeof db.exec === "function") db.exec(sql); else db.run(sql);
    const stmt = db.prepare?.("INSERT INTO schema_migrations(id, applied_at) VALUES(?, strftime('%s','now'))");
    if (stmt) stmt.run(f);
  }
}