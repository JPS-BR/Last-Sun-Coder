// CJS-friendly: evita esModuleInterop e funciona com tree-sitter nativo em Node.
import Parser = require("tree-sitter");

export interface TSNode { type: string; startIndex?: number; endIndex?: number; [k: string]: unknown }

export function isNode(v: unknown): v is TSNode { return typeof v === 'object' && v !== null && typeof (v as any).type === 'string'; }

const tsLangs: unknown = require("tree-sitter-typescript");
const TS: unknown = (tsLangs as any)?.typescript ?? (tsLangs as any)?.TypeScript;
const TSX: unknown = (tsLangs as any)?.tsx ?? (tsLangs as any)?.TSX;

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