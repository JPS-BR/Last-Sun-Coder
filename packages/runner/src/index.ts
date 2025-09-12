#!/usr/bin/env node
// packages/runner/src/index.ts
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
// type-only imports from built core package
import type { MigrationDB } from "@lsc/core";
// type DB = DBType<UnknownRecord>;

type IndexProject = (opts: {
  root: string; name?: string; exts?: string[]; ignoreDirs?: string[]; chunkLines?: number; strict?: boolean; logger?: (m: string) => void;
}, deps: {
  openOrCreateProject: (root: string, name?: string) => { db: unknown; project: { id: number; root: string } };
  upsertFile: (db: unknown, projectId: number, projectRoot: string, filePath: string, lang: string | null, hash: string) => number;
  insertChunk: (db: unknown, projectId: number, fileId: number | null, relPath: string, lang: string | null, startLine: number, endLine: number, content: string) => { id: number };
  upsertEmbeddingForChunk?: (db: unknown, chunkId: number, text: string) => Promise<void>;
  runMigrations?: (db: unknown) => Promise<void> | void; // << ADICIONADO
}) => Promise<{ projectId: number; files: number; chunks: number }>;

function hereDir() {
  const __filename = fileURLToPath(import.meta.url);
  return path.dirname(__filename);
}
function exists(p: string) { try { return fs.existsSync(p); } catch { return false; } }
function repoRoot() {
  let dir = hereDir();
  for (let i = 0; i < 6; i++) {
    const parent = path.resolve(dir, "..");
    if (exists(path.join(parent, "packages"))) return parent;
    dir = parent;
  }
  return path.resolve(hereDir(), "..", "..", "..");
}
async function tryImport(spec: string) { try { return await import(spec); } catch { return null; } }
async function importFirst(cands: string[], asFile = true) {
  for (const c of cands) {
    const spec = asFile ? pathToFileURL(c).href : c;
    const m = await tryImport(spec);
    if (m) return m;
  }
  throw new Error("Module not found: " + cands.join(" | "));
}
function ensureBuilt(pkgDir: string) {
  const root = repoRoot();
  const pkgPath = path.join(root, "packages", pkgDir);
  const distPath = path.join(pkgPath, "dist");
  if (exists(distPath)) return;
  const res = spawnSync("npm", ["run", "-w", pkgPath, "build"], { stdio: "inherit", shell: true });
  if (res.status !== 0) throw new Error("Build failed for " + pkgDir);
  if (!exists(distPath)) throw new Error("No dist/ folder for " + pkgDir + " after build");
}
function parseArgs(argv: string[]) {
  const out: { cmd: string; flags: Record<string, string | boolean> } = { cmd: "help", flags: {} };
  const rest = argv.slice(2);
  if (rest.length > 0 && !rest[0].startsWith("-")) out.cmd = rest.shift() as string;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = i + 1 < rest.length ? rest[i + 1] : undefined;
      if (typeof next === "string" && !next.startsWith("-")) { out.flags[key] = next; i++; }
      else { out.flags[key] = true; }
    }
  }
  return out;
}
function getFlagStr(flags: Record<string, string | boolean>, name: string, dflt?: string) {
  if (Object.prototype.hasOwnProperty.call(flags, name)) {
    const v = flags[name];
    if (typeof v === "string") return v;
    if (typeof v === "boolean") return v ? "" : (dflt || undefined);
  }
  return dflt;
}
function getFlagBool(flags: Record<string, string | boolean>, name: string, dflt: boolean) {
  if (Object.prototype.hasOwnProperty.call(flags, name)) {
    const v = flags[name];
    if (typeof v === "boolean") return v;
    if (typeof v === "string") {
      const s = v.toLowerCase();
      if (s === "1" || s === "true" || s === "yes") return true;
      if (s === "0" || s === "false" || s === "no") return false;
      return true;
    }
  }
  return dflt;
}
function printHelp() {
  const txt = [
    "Usage: lsc <command> [options]",
    "",
    "Commands:",
    "  index  --root <dir>   Index the project at <dir> (use --strict to fail on embeddings)",
    "  doctor               Validate OpenAI API key / network / quota",
    "  help                  Show this help",
    "",
    "Options (index):",
    "  --root <dir>          Project root (default: cwd)",
    "  --name <name>         Friendly project name",
    "  --strict              Await embeddings and require embedding deps",
    "  --chunkLines <n>      Chunk size in lines (default: 120)",
    "  --exts \"ts,js,md\"    File extensions to include",
    "  --ignore \".git,dist\" Directories to ignore",
  ].join("\n");
  process.stdout.write(txt + "\n");
}
async function wireIndexer(): Promise<IndexProject> {
  ensureBuilt("indexer");
  const root = repoRoot();
  const entry = path.join(root, "packages", "indexer", "dist", "index.js");
  const m = await importFirst([entry]);
  if (!m.indexProject) throw new Error("indexProject not exported from indexer/dist/index.js");
  return m.indexProject as IndexProject;
}
async function wireCoreDeps() {
  ensureBuilt("core");
  const root = repoRoot();
  const coreEntry = path.join(root, "packages", "core", "dist", "index.js");
  const core = await importFirst([coreEntry]);

  const {
    openOrCreateProject,
    upsertFile,
    projectRoot,
    insertChunk,
    upsertEmbeddingForChunk,
    bm25,
    vector,
    hybrid,
    runMigrations, // << do core
  } = core;

  if (typeof openOrCreateProject !== "function") throw new Error("openOrCreateProject not found in core/dist/index.js");
  if (typeof upsertFile !== "function")         throw new Error("upsertFile not found in core/dist/index.js");
  if (typeof insertChunk !== "function")        throw new Error("insertChunk not found in core/dist/index.js");
  if (typeof bm25 !== "function" || typeof vector !== "function" || typeof hybrid !== "function")
    throw new Error("Retriever methods (bm25/vector/hybrid) not found in core/dist/index.js");

  // PRIORIDADE: <repo>/resources/sql (fallback: packages/core/sql)
  let sqlDir = path.join(root, "resources", "sql");
  if (!exists(sqlDir)) {
    const fallback = path.join(root, "packages", "core", "sql");
    if (exists(fallback)) sqlDir = fallback;
  }

  return {
    openOrCreateProject,
    upsertFile,
    insertChunk,
    upsertEmbeddingForChunk: typeof upsertEmbeddingForChunk === "function" ? upsertEmbeddingForChunk : undefined,
    bm25,
    vector,
    hybrid,
    projectRoot: typeof projectRoot === "function" ? projectRoot : undefined,
    runMigrations: typeof runMigrations === "function" ? (db: unknown) => runMigrations(db as MigrationDB, sqlDir) : undefined,
  };
}
async function cmdIndex(flags: Record<string, string | boolean>) {
  const rootFlag = getFlagStr(flags, "root", "");
  const name = getFlagStr(flags, "name", undefined);
  const strict = getFlagBool(flags, "strict", false);
  const chunkStr = getFlagStr(flags, "chunkLines", undefined);
  const extsStr = getFlagStr(flags, "exts", undefined);
  const ignoreStr = getFlagStr(flags, "ignore", undefined);

  const root = (rootFlag && rootFlag.length > 0) ? path.resolve(rootFlag) : process.cwd();
  const chunkLines = (typeof chunkStr === "string" && /^[0-9]+$/.test(chunkStr)) ? parseInt(chunkStr, 10) : undefined;
  const exts = (typeof extsStr === "string") ? extsStr.split(",").map((s) => s.trim()).filter((s) => s.length > 0) : undefined;
  const ignoreDirs = (typeof ignoreStr === "string") ? ignoreStr.split(",").map((s) => s.trim()).filter((s) => s.length > 0) : undefined;

  const indexProject = await wireIndexer();
  const deps = await wireCoreDeps();

  const res = await indexProject(
    { root, name, chunkLines, exts, ignoreDirs, strict, logger: (m: string) => process.stdout.write(m + "\n") },
    deps
  );
  process.stdout.write("[runner] indexed project=" + res.projectId + " files=" + res.files + " chunks=" + res.chunks + "\n");
}
import { runDoctor } from "./commands/doctor.js";
async function main() {
  const args = parseArgs(process.argv);
  if (args.cmd === 'help') { printHelp(); return; }
  if (args.cmd === 'index') { await cmdIndex(args.flags); return; }
  if (args.cmd === 'doctor') { await runDoctor(); return; }
  printHelp(); process.exitCode = 1;
}
main().catch((e: unknown) => {
  let msg = String(e);
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string') msg = (e as { message: string }).message;
  process.stderr.write("[runner] error: " + msg + "\n");
  process.exit(1);
});
