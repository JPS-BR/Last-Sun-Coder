import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
export * from "./kernel.js"; // reexporta createKernel e tipos
// utilidades locais
function hereDir() {
    const __filename = fileURLToPath(import.meta.url);
    return path.dirname(__filename);
}
function repoRoot() { return path.resolve(hereDir(), "..", ".."); }
function exists(p) { try {
    return fs.existsSync(p);
}
catch {
    return false;
} }
async function tryImport(spec) { try {
    return await import(spec);
}
catch {
    return null;
} }
async function importFirst(cands, asFile = true) {
    for (const c of cands) {
        const spec = asFile ? pathToFileURL(c).href : c;
        const m = await tryImport(spec);
        if (m)
            return m;
    }
    throw new Error("Module not found: " + cands.join(" | "));
}
/** Resolve dependências do core para uso com o Kernel (sem servidor). */
export async function wireKernelDeps() {
    const root = repoRoot();
    const coreEntry = path.join(root, "packages", "core", "dist", "index.js");
    const core = await importFirst([coreEntry]);
    const { openOrCreateProject, upsertFile, projectRoot, insertChunk, upsertEmbeddingForChunk, bm25, vector, hybrid, } = core;
    if (typeof openOrCreateProject !== "function")
        throw new Error("openOrCreateProject not found");
    if (typeof upsertFile !== "function")
        throw new Error("upsertFile not found");
    if (typeof insertChunk !== "function")
        throw new Error("insertChunk not found");
    if (typeof bm25 !== "function" || typeof vector !== "function" || typeof hybrid !== "function")
        throw new Error("Retriever methods not found");
    const deps = {
        openOrCreateProject,
        upsertFile,
        insertChunk,
        upsertEmbeddingForChunk: typeof upsertEmbeddingForChunk === "function" ? upsertEmbeddingForChunk : undefined,
        bm25,
        vector,
        hybrid,
        projectRoot: typeof projectRoot === "function" ? projectRoot : undefined,
    };
    return deps;
}
