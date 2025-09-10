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
    const dist = path.join(root, "packages", "core", "dist");
    const projMod = await importFirst([
        path.join(dist, "services", "ProjectRegistry.js"),
        path.join(dist, "src", "services", "ProjectRegistry.js"),
        path.join(dist, "cjs", "services", "ProjectRegistry.js"),
        path.join(dist, "esm", "services", "ProjectRegistry.js"),
    ]);
    const kbMod = await importFirst([
        path.join(dist, "services", "KBLocal.js"),
        path.join(dist, "src", "services", "KBLocal.js"),
        path.join(dist, "cjs", "services", "KBLocal.js"),
        path.join(dist, "esm", "services", "KBLocal.js"),
    ]);
    const rMod = await importFirst([
        path.join(dist, "services", "Retriever.js"),
        path.join(dist, "src", "services", "Retriever.js"),
        path.join(dist, "cjs", "services", "Retriever.js"),
        path.join(dist, "esm", "services", "Retriever.js"),
    ]);
    if (!projMod.openOrCreateProject)
        throw new Error("openOrCreateProject not found");
    if (!projMod.upsertFile)
        throw new Error("upsertFile not found");
    if (!kbMod.insertChunk)
        throw new Error("insertChunk not found");
    if (!rMod.bm25 || !rMod.vector || !rMod.hybrid)
        throw new Error("Retriever methods not found");
    const deps = {
        openOrCreateProject: projMod.openOrCreateProject,
        upsertFile: projMod.upsertFile,
        insertChunk: kbMod.insertChunk,
        upsertEmbeddingForChunk: typeof kbMod.upsertEmbeddingForChunk === "function" ? kbMod.upsertEmbeddingForChunk : undefined,
        bm25: rMod.bm25,
        vector: rMod.vector,
        hybrid: rMod.hybrid,
        projectRoot: typeof projMod.projectRoot === "function" ? projMod.projectRoot : undefined,
    };
    return deps;
}
