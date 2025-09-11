import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";

type Logger = (msg: string) => void;

/** DependÃªncias trazidas do core/indexer via DI (nada de import cruzado). */
export interface KernelDeps {
  openOrCreateProject: (root: string, name?: string) => {
    db: any;
    project: { id: number; root: string };
  };

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

  // Retriever (somente chamadas, implementaÃ§Ã£o fica no core)
  bm25: (db: any, projectId: number, query: string, k?: number) => Retrieved[];
  vector: (db: any, queryVec: Float32Array, queryNorm: number, k?: number) => Retrieved[];
  hybrid: (
    db: any,
    projectId: number,
    textQuery: string,
    queryVec: Float32Array,
    queryNorm: number,
    k?: number
  ) => Retrieved[];

  // util opcional
  projectRoot?: (db: any, projectId: number) => string;
}

/** OpÃ§Ãµes do Kernel (em processo, sem servidor). */
export interface KernelOptions {
  root: string;
  name?: string;
  logger?: Logger;

  // IndexaÃ§Ã£o
  chunkLines?: number;        // padrÃ£o: 120
  exts?: string[];            // padrÃ£o: ts,tsx,js,jsx,mjs,cjs,json,md,sql
  ignoreDirs?: string[];      // padrÃ£o: node_modules,.git,.lastsun,dist,build
  strict?: boolean;           // aguarda embeddings e exige dep
}

/** Retorno de buscas (espelha o core). */
export type Retrieved = {
  chunk_id: number;
  path: string;
  start_line: number;
  end_line: number;
  score: number;
  reason: "bm25" | "vector" | "hybrid";
  content: string;
};

export interface Kernel {
  projectId: number;
  projectRoot: string;
  index: (opts?: {
    chunkLines?: number;
    exts?: string[];
    ignoreDirs?: string[];
    strict?: boolean;
  }) => Promise<{ files: number; chunks: number }>;
  searchBM25: (query: string, k?: number) => Retrieved[];
  searchVector: (queryVec: Float32Array, norm: number, k?: number) => Retrieved[];
  searchHybrid: (textQuery: string, queryVec: Float32Array, norm: number, k?: number) => Retrieved[];
}

/* --------- utils locais (sem dependÃªncias externas) ---------- */

function detectLangByExt(file: string): string | null {
  const ext = path.extname(file).toLowerCase();
  if (!ext) return null;
  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "jsx",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".json": "json",
    ".css": "css",
    ".scss": "scss",
    ".md": "markdown",
    ".sql": "sql",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".cs": "csharp",
  };
  if (Object.prototype.hasOwnProperty.call(map, ext)) return map[ext];
  return null;
}

function md5String(s: string): string {
  const h = crypto.createHash("md5");
  h.update(s, "utf8");
  return h.digest("hex");
}

function* walkFiles(root: string, exts: Set<string>, ignore: Set<string>): Generator<string> {
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignore.has(entry.name)) continue;
        stack.push(full);
      } else if (entry.isFile()) {
        const e = path.extname(entry.name).toLowerCase().replace(/^\./, "");
        if (exts.size === 0 || exts.has(e)) {
          yield full;
        }
      }
    }
  }
}

/* ---------------- Kernel (in-process) ---------------- */

export async function createKernel(opts: KernelOptions, deps: KernelDeps): Promise<Kernel> {
  const log: Logger = typeof opts.logger === "function" ? opts.logger : (_: string) => {};

  const root = path.resolve(opts.root);
  const opened = deps.openOrCreateProject(root, opts.name);
  const db = opened.db;
  const proj = opened.project;

  const defaultExts = Array.isArray(opts.exts) && opts.exts.length > 0
    ? opts.exts.slice()
    : ["ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "md", "sql"];

  const defaultIgnore = Array.isArray(opts.ignoreDirs) && opts.ignoreDirs.length > 0
    ? opts.ignoreDirs.slice()
    : ["node_modules", ".git", ".lastsun", "dist", "build"];

  const defaultChunkLines = typeof opts.chunkLines === "number" && isFinite(opts.chunkLines)
    ? Math.max(20, Math.min(400, opts.chunkLines))
    : 120;

  const strict = !!opts.strict;

  const rootGetter = typeof deps.projectRoot === "function"
    ? deps.projectRoot
    : (_db: any, _id: number) => root;

  async function index(local?: {
    chunkLines?: number;
    exts?: string[];
    ignoreDirs?: string[];
    strict?: boolean;
  }): Promise<{ files: number; chunks: number }> {
    const chosenExts = Array.isArray(local) && false ? defaultExts : (local && Array.isArray(local.exts) ? local.exts : defaultExts);
    const chosenIgnore = local && Array.isArray(local.ignoreDirs) ? local.ignoreDirs : defaultIgnore;
    const chosenChunkLines = local && typeof local.chunkLines === "number" && isFinite(local.chunkLines)
      ? Math.max(20, Math.min(400, local.chunkLines))
      : defaultChunkLines;
    const useStrict = local && typeof local.strict === "boolean" ? !!local.strict : strict;

    const extsSet = new Set(chosenExts.map((x) => String(x).toLowerCase()));
    const ignoreSet = new Set(chosenIgnore.map((x) => String(x)));

    let files = 0;
    let chunks = 0;

    for (const filePath of walkFiles(root, extsSet, ignoreSet)) {
      const rel = path.relative(root, filePath).replace(/\\/g, "/");
      const lang = detectLangByExt(filePath);
      const content = fs.readFileSync(filePath, "utf8");
      const hash = md5String(content);

      const fileId = deps.upsertFile(db, proj.id, root, filePath, lang, hash);
      files++;

      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += chosenChunkLines) {
        const start = i + 1;
        const end = Math.min(i + chosenChunkLines, lines.length);
        const text = lines.slice(i, end).join("\n");
        if (text.trim().length === 0) continue;

        const ins = deps.insertChunk(db, proj.id, fileId, rel, lang, start, end, text);
        chunks++;

        if (typeof deps.upsertEmbeddingForChunk === "function") {
          if (useStrict) {
            await deps.upsertEmbeddingForChunk(db, ins.id, text);
          } else {
            // nÃ£o bloqueia em modo normal
             
            deps.upsertEmbeddingForChunk(db, ins.id, text);
          }
        } else if (useStrict) {
          throw new Error("upsertEmbeddingForChunk dependency is required in strict mode");
        }
      }
    }

    log("[kernel] indexed files=" + files + " chunks=" + chunks);
    return { files, chunks };
  }

  const projRoot = rootGetter(db, proj.id);

  return {
    projectId: proj.id,
    projectRoot: projRoot,

    index,

    searchBM25(query: string, k?: number): Retrieved[] {
      const kk = typeof k === "number" && isFinite(k) ? k : 8;
      return deps.bm25(db, proj.id, query, kk);
    },

    searchVector(queryVec: Float32Array, norm: number, k?: number): Retrieved[] {
      const kk = typeof k === "number" && isFinite(k) ? k : 8;
      return deps.vector(db, queryVec, norm, kk);
    },

    searchHybrid(textQuery: string, queryVec: Float32Array, norm: number, k?: number): Retrieved[] {
      const kk = typeof k === "number" && isFinite(k) ? k : 8;
      return deps.hybrid(db, proj.id, textQuery, queryVec, norm, kk);
    },
  };
}
