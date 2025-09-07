// CJS-friendly: evita esModuleInterop
import Parser = require('tree-sitter');
const tsLangs: any = require('tree-sitter-typescript');

const TS = tsLangs.typescript;
const TSX = tsLangs.tsx;

export function makeParser(useTsx = false) {
  const p = new Parser();
  p.setLanguage((useTsx ? TSX : TS) as any);
  return p;
}

export { TS as typescript, TSX as tsx };
