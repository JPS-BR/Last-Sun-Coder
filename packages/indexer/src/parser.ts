// CJS-friendly: evita esModuleInterop e funciona com tree-sitter nativo em Node.
import Parser = require("tree-sitter");
const tsLangs: any = require("tree-sitter-typescript");

const TS = tsLangs.typescript;
const TSX = tsLangs.tsx;

/**
 * Cria um parser do Tree-sitter para TypeScript ou TSX.
 * Mantém compatibilidade com o pacote indexer em CommonJS.
 */
export function makeParser(useTsx = false) {
  const p = new Parser();
  p.setLanguage((useTsx ? TSX : TS) as any);
  return p;
}

export { TS as typescript, TSX as tsx };