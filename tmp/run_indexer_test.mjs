import path from 'node:path';
const root = path.resolve('local-tests/sample-project');
try {
  const indexer = await import('../packages/indexer/dist/index.js');
  const core = await import('../packages/core/dist/index.js');
  const indexProject = indexer.indexProject;
  if (typeof indexProject !== 'function') throw new Error('indexProject not exported');

  const deps = {
    openOrCreateProject: core.openOrCreateProject,
    upsertFile: core.upsertFile,
    insertChunk: core.insertChunk,
    upsertEmbeddingForChunk: typeof core.upsertEmbeddingForChunk === 'function' ? core.upsertEmbeddingForChunk : undefined,
    bm25: core.bm25,
    vector: core.vector,
    hybrid: core.hybrid,
    projectRoot: typeof core.projectRoot === 'function' ? core.projectRoot : undefined,
    runMigrations: typeof core.runMigrations === 'function' ? core.runMigrations : undefined,
  };

  console.log('[test] calling indexProject root=', root);
  const res = await indexProject({ root, logger: (m) => console.log('[indexer]', m) }, deps);
  console.log('[test] result:', res);
} catch (e) {
  console.error('[test] ERROR:', e);
  if (e && e.stack) console.error(e.stack);
  process.exit(1);
}
