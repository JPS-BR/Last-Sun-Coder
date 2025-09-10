import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

export interface IndexerDeps {
  openOrCreateProject: (root: string, name?: string) =>
    { db: unknown; project: { id: number; root: string } };
  upsertFile: (
    db: any,
    projectId: number,
    projectRoot: string,
    filePath: string,
    lang: string | null,
    hash: string
  ) => number;
  insertChunk: (
    db: any,
    projectId: number,
    fileId: number | null,
    relPath: string,
    lang: string | null,
    startLine: number,
    endLine: number,
    content: string
  ) => { id: number; start_line: number; end_line: number; path: string };
  upsertEmbeddingForChunk?: (db: any, chunkId: number, text: string) => Promise<void>;
  runMigrations?: (db: any) => Promise<void> | void;
}

export interface IndexOptions {
  root: string;
  name?: string;
  exts?: string[];
  ignoreDirs?: string[];
  chunkLines?: number;
  strict?: boolean;
  logger?: (msg: string) => void;
}

function detectLangByExt(file: string): string | null {
  const ext = path.extname(file).toLowerCase();
  if (!ext) return null;
  const map: Record<string, string> = {
    ".ts": "typescript", ".tsx": "tsx",
    ".js": "javascript", ".jsx": "jsx",
    ".mjs": "javascript", ".cjs": "javascript",
    ".json": "json", ".css": "css", ".scss": "scss",
    ".md": "markdown", ".sql": "sql",
    ".py": "python", ".go": "go", ".rs": "rust",
    ".java": "java", ".cs": "csharp",
  };
  return Object.prototype.hasOwnProperty.call(map, ext) ? map[ext] : null;
}

function* walkFiles(root: string, exts: Set<string>, ignore: Set<string>): Generator<string> {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop() as string;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignore.has(entry.name)) continue;
        stack.push(full);
      } else if (entry.isFile()) {
        const e = path.extname(entry.name).toLowerCase().replace(/^\./, "");
        if (exts.size === 0 || exts.has(e)) yield full;
      }
    }
  }
}

function md5(buf: Buffer | string) {
  const h = crypto.createHash("md5");
  if (typeof buf === "string") h.update(buf, "utf8"); else h.update(buf);
  return h.digest("hex");
}

function chunkContent(content: string, chunkLines: number) {
  const lines = content.split(/\r?\n/);
  const chunks: { start: number; end: number; text: string }[] = [];
  for (let i = 0; i < lines.length; i += chunkLines) {
    const start = i + 1;
    const end = Math.min(i + chunkLines, lines.length);
    const text = lines.slice(i, end).join("\n");
    if (text.trim().length > 0) chunks.push({ start, end, text });
  }
  return chunks;
}

export async function indexProject(opts: IndexOptions, deps: IndexerDeps) {
  const log = typeof opts.logger === "function" ? opts.logger : (_: string) => {};
  const root = path.resolve(opts.root);

  const rawExts = Array.isArray(opts.exts) && opts.exts.length > 0
    ? opts.exts
    : ["ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "md", "sql"];
  const exts = new Set(rawExts.map((x) => String(x).toLowerCase()));

  const rawIgnore = Array.isArray(opts.ignoreDirs) && opts.ignoreDirs.length > 0
    ? opts.ignoreDirs
    : ["node_modules", ".git", ".lastsun", "dist", "build"];
  const ignore = new Set(rawIgnore.map((x) => String(x)));

  const chunkLines = (typeof opts.chunkLines === "number" && isFinite(opts.chunkLines))
    ? Math.max(20, Math.min(400, opts.chunkLines))
    : 120;

  const strict = !!opts.strict;
  if (strict) log("[indexer] STRICT mode enabled");

  const opened = deps.openOrCreateProject(root, opts.name);
  const db = opened.db;
  const project = opened.project;
  if (typeof deps.runMigrations === "function") {
    await Promise.resolve(deps.runMigrations(db));
  }
  log("[indexer] project id=" + project.id);

  let filesCount = 0;
  let chunksCount = 0;

  for (const filePath of walkFiles(root, exts, ignore)) {
    const rel = path.relative(root, filePath).replace(/\\/g, "/");
    const lang = detectLangByExt(filePath);
    const content = fs.readFileSync(filePath, "utf8");
    const hash = md5(content);

    const fileId = deps.upsertFile(db, project.id, root, filePath, lang, hash);
    filesCount++;

    const chunks = chunkContent(content, chunkLines);
    for (const ch of chunks) {
      const ins = deps.insertChunk(db, project.id, fileId, rel, lang, ch.start, ch.end, ch.text);
      const chunkId = ins.id;
      chunksCount++;

      if (typeof deps.upsertEmbeddingForChunk === "function") {
        if (strict) {
          await deps.upsertEmbeddingForChunk(db, chunkId, ch.text);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          deps.upsertEmbeddingForChunk(db, chunkId, ch.text);
        }
      } else if (strict) {
        throw new Error("upsertEmbeddingForChunk dependency is required in strict mode");
      }
    }
  }

  log(`[indexer] done. files=${filesCount}, chunks=${chunksCount}`);
  return { projectId: project.id, files: filesCount, chunks: chunksCount };
}