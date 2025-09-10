// packages/core/src/services/SymbolIndex.ts
import ts from "typescript";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { DB } from "./DB.js";
import { upsertFile, projectRoot } from "./ProjectRegistry.js";

export type SymbolItem = {
  kind: "function" | "class" | "import";
  name: string;
  start_line: number;
  end_line: number;
  sig?: string;
};

function lineOf(sf: ts.SourceFile, pos: number): number {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

export function parseSymbols(sf: ts.SourceFile): SymbolItem[] {
  const out: SymbolItem[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const start_line = lineOf(sf, node.getStart(sf));
      const end_line = lineOf(sf, node.getEnd());
      const text = node.getText(sf);
      const firstLine = text.split(/\r?\n/, 1)[0];
      out.push({ kind: "function", name: node.name.text, start_line, end_line, sig: firstLine });
    } else if (ts.isClassDeclaration(node) && node.name) {
      const start_line = lineOf(sf, node.getStart(sf));
      const end_line = lineOf(sf, node.getEnd());
      const text = node.getText(sf);
      const firstLine = text.split(/\r?\n/, 1)[0];
      out.push({ kind: "class", name: node.name.text, start_line, end_line, sig: firstLine });
    } else if (ts.isImportDeclaration(node)) {
      const mod = (node.moduleSpecifier as ts.StringLiteral).text;
      const start_line = lineOf(sf, node.getStart(sf));
      const end_line = lineOf(sf, node.getEnd());
      out.push({ kind: "import", name: mod, start_line, end_line });
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return out;
}

export function indexFile(db: DB, projectId: number, absPath: string): void {
  const ext = path.extname(absPath).toLowerCase();
  const lang =
    ext === ".ts" || ext === ".tsx" ? "ts" : ext === ".js" || ext === ".jsx" ? "js" : "other";

  const content = fs.readFileSync(absPath, "utf8");
  const hash = crypto.createHash("md5").update(content, "utf8").digest("hex");

  const root = projectRoot(db, projectId);
  const fileId = upsertFile(db, projectId, root, absPath, lang, hash);

  const scriptKind =
    ext === ".tsx" ? ts.ScriptKind.TSX :
    ext === ".jsx" ? ts.ScriptKind.JSX :
    ext === ".ts"  ? ts.ScriptKind.TS  :
    ts.ScriptKind.JS;

  const sf = ts.createSourceFile(absPath, content, ts.ScriptTarget.Latest, true, scriptKind);
  const items = parseSymbols(sf);

  db.transaction((trxDb) => {
    trxDb.prepare("DELETE FROM symbols WHERE file_id = ?").run(fileId);
    const stmt = trxDb.prepare(
      "INSERT INTO symbols(project_id, file_id, kind, name, start_line, end_line, signature) VALUES(?,?,?,?,?,?,?)"
    );
    for (const s of items) {
      stmt.run(projectId, fileId, s.kind, s.name, s.start_line, s.end_line, s.sig || null);
    }
  });
}