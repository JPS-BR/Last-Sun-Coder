// CJS-friendly: evita esModuleInterop e funciona com tree-sitter nativo em Node.
import Parser = require("tree-sitter");

export interface TSNode { type: string; startIndex?: number; endIndex?: number; [k: string]: unknown }

export function isNode(v: unknown): v is TSNode { return typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string'; }

const tsLangsRaw: unknown = require("tree-sitter-typescript");
const tsLangsObj = typeof tsLangsRaw === 'object' && tsLangsRaw !== null ? (tsLangsRaw as Record<string, unknown>) : {};
const TS: unknown = tsLangsObj.typescript ?? tsLangsObj.TypeScript;
const TSX: unknown = tsLangsObj.tsx ?? tsLangsObj.TSX;

/**
 * Cria um parser do Tree-sitter para TypeScript ou TSX.
 * Mantém compatibilidade com o pacote indexer em CommonJS.
 */
export function makeParser(useTsx = false) {
  const p = new Parser();
  const lang = useTsx ? TSX : TS;
  // p.setLanguage expects the language object from the native binding; runtime shape only. Disable eslint for this specific cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Tree-sitter language object is native/untyped at runtime
  p.setLanguage(lang as any);
  return p;
}

export { TS as typescript, TSX as tsx };