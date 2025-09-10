export * as DB from "./services/DB";
export * as Project from "./services/ProjectRegistry";
export * as Secrets from "./services/SecretsManager";
export * as Symbols from "./services/SymbolIndex";

// Exports diretos usados por runner / app
export { openOrCreateProject, upsertFile, projectRoot } from "./services/ProjectRegistry";
export { insertChunk, upsertEmbeddingForChunk } from "./services/KBLocal";
export { bm25, vector, hybrid } from "./services/Retriever";

// Ponte para migrações (chama o que existir no Migrator), priorizando <repo>/sql
import * as Migrator from "./services/Migrator";
import * as path from "node:path";
import * as fs from "node:fs";

/**
 * Executa as migrações do esquema.
 * @param db Conexão do DB
 * @param sqlDir Caminho da pasta com .sql (opcional). Se não passar, usa <repo>/sql; fallback: packages/core/sql.
 */
export async function runMigrations(db: any, sqlDir?: string): Promise<void> {
  const m: any = Migrator;

  let dir = sqlDir;
  if (!dir || dir.length === 0) {
    const repoRoot = process.cwd();
    const p1 = path.join(repoRoot, "sql");
    const p2 = path.join(repoRoot, "packages", "core", "sql");
    dir = fs.existsSync(p1) ? p1 : (fs.existsSync(p2) ? p2 : repoRoot);
  }

  if (typeof m.applyMigrations === "function") { await m.applyMigrations(db, dir); return; }
  if (typeof m.runMigrations === "function")  { await m.runMigrations(db, dir);  return; }
  if (typeof m.migrateAll === "function")     { await m.migrateAll(db, dir);     return; }
  if (typeof m.migrate === "function")        { await m.migrate(db, dir);        return; }
  // se não houver migrador, não faz nada
}