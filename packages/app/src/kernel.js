import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
/* --------- utils locais (sem dependÃƒÆ’Ã‚Âªncias externas) ---------- */
function detectLangByExt(file) {
    const ext = path.extname(file).toLowerCase();
    if (!ext)
        return null;
    const map = {
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
    if (Object.prototype.hasOwnProperty.call(map, ext))
        return map[ext];
    return null;
}
function md5String(s) {
    const h = crypto.createHash("md5");
    h.update(s, "utf8");
    return h.digest("hex");
}
function* walkFiles(root, exts, ignore) {
    const stack = [root];
    while (stack.length > 0) {
        const dir = stack.pop();
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (ignore.has(entry.name))
                    continue;
                stack.push(full);
            }
            else if (entry.isFile()) {
                const e = path.extname(entry.name).toLowerCase().replace(/^\./, "");
                if (exts.size === 0 || exts.has(e)) {
                    yield full;
                }
            }
        }
    }
}
/* ---------------- Kernel (in-process) ---------------- */
export async function createKernel(opts, deps) {
    const log = typeof opts.logger === "function" ? opts.logger : (_) => { };
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
        : (_db, _id) => root;
    async function index(local) {
        const chosenExts = (local && Array.isArray(local.exts) ? local.exts : defaultExts);
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
                if (text.trim().length === 0)
                    continue;
                const ins = deps.insertChunk(db, proj.id, fileId, rel, lang, start, end, text);
                chunks++;
                if (typeof deps.upsertEmbeddingForChunk === "function") {
                    if (useStrict) {
                        await deps.upsertEmbeddingForChunk(db, ins.id, text);
                    }
                    else {
                        // nÃƒÆ’Ã‚Â£o bloqueia em modo normal
                         
                        deps.upsertEmbeddingForChunk(db, ins.id, text);
                    }
                }
                else if (useStrict) {
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
        searchBM25(query, k) {
            const kk = typeof k === "number" && isFinite(k) ? k : 8;
            return deps.bm25(db, proj.id, query, kk);
        },
        searchVector(queryVec, norm, k) {
            const kk = typeof k === "number" && isFinite(k) ? k : 8;
            return deps.vector(db, queryVec, norm, kk);
        },
        searchHybrid(textQuery, queryVec, norm, k) {
            const kk = typeof k === "number" && isFinite(k) ? k : 8;
            return deps.hybrid(db, proj.id, textQuery, queryVec, norm, kk);
        },
    };
}
