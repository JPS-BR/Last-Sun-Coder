export * as DB from "./services/DB";
export * as Project from "./services/ProjectRegistry";
export * as Secrets from "./services/SecretsManager";
export * as Symbols from "./services/SymbolIndex";
export * from './types';

// Exports diretos usados por runner / app
export { openOrCreateProject, upsertFile, projectRoot } from "./services/ProjectRegistry";
export { insertChunk, upsertEmbeddingForChunk } from "./services/KBLocal";
export { bm25, vector, hybrid } from "./services/Retriever";
export { getOpenAIKey, setOpenAIKey, clearOpenAIKey } from "./secrets";

// Ponte para migrações (chama o que existir no Migrator), priorizando <repo>/sql
import * as Migrator from "./services/Migrator";
import * as path from "node:path";
import * as fs from "node:fs";
import type { MigrationDB } from './types';
import type { DB as DBType } from "./services/DB";

type MigratorLike = Partial<{
  applyMigrations: (db: MigrationDB, dir: string) => void;
  runMigrations: (db: MigrationDB, dir: string) => void | Promise<void>;
  migrateAll: (db: MigrationDB, dir: string) => void | Promise<void>;
  migrate: (db: MigrationDB, dir: string) => void | Promise<void>;
}>;

export async function runMigrations(db: DBType | MigrationDB, sqlDir?: string): Promise<void> {
  const m = Migrator as unknown as MigratorLike;

  let dir = sqlDir;
  if (!dir || dir.length === 0) {
    const repoRoot = process.cwd();
    const p1 = path.join(repoRoot, "sql");
    const p2 = path.join(repoRoot, "packages", "core", "sql");
    dir = fs.existsSync(p1) ? p1 : (fs.existsSync(p2) ? p2 : repoRoot);
  }

  if (typeof m.applyMigrations === "function") { await m.applyMigrations(db as MigrationDB, dir); return; }
  if (typeof m.runMigrations === "function")  { await m.runMigrations(db as MigrationDB, dir);  return; }
  if (typeof m.migrateAll === "function")     { await m.migrateAll(db as MigrationDB, dir);     return; }
  if (typeof m.migrate === "function")        { await m.migrate(db as MigrationDB, dir);        return; }
}
