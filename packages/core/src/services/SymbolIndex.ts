import ts from "typescript";
import * as fs from "node:fs";
import * as path from "node:path";
import { DB } from "./DB.js";

export type SymbolItem = {
  kind: "function" | "class" | "import";
  name: string;
  start_line: number;
  end_line: number;
  sig?: string;
};

export function parseTsJs(filePath: string): SymbolItem[] {
  const code = fs.readFileSync(filePath, "utf8");
  const source = ts.createSourceFile(filePath, code, ts.ScriptTarget.ES2022, true);
  const out: SymbolItem[] = [];

  function add(kind: SymbolItem["kind"], name: string, start: number, end: number, sig?: string) {
    const { line: s } = source.getLineAndCharacterOfPosition(start);
    const { line: e } = source.getLineAndCharacterOfPosition(end);
    out.push({ kind, name, start_line: s + 1, end_line: e + 1, sig });
  }

  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const sig = node.getText(source).slice(0, 200);
      add("function", node.name.getText(source), node.getStart(source), node.getEnd(), sig);
    }
    if (ts.isClassDeclaration(node) && node.name) {
      add("class", node.name.getText(source), node.getStart(source), node.getEnd());
    }
    if (ts.isImportDeclaration(node)) {
      const moduleText = (node.moduleSpecifier as ts.StringLiteral).text;
      add("import", `from:${moduleText}`, node.getStart(source), node.getEnd());
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return out;
}

export function indexFile(db: DB, projectId: number, absPath: string): void {
  const ext = path.extname(absPath).toLowerCase();
  const lang = ext === ".ts" || ext === ".tsx" ? "ts" : ext === ".js" || ext === ".jsx" ? "js" : "other";
  const fileId = require("./ProjectRegistry.js").upsertFile(db, projectId, absPath, lang);

  if (lang === "ts" || lang === "js") {
    const symbols = parseTsJs(absPath);
    db.prepare("DELETE FROM symbols WHERE file_id = ?").run(fileId);
    const stmt = db.prepare(
      "INSERT INTO symbols(file_id, kind, name, start_line, end_line, sig) VALUES (?,?,?,?,?,?)"
    );
    db.prepare("BEGIN").run();
    try {
      for (const s of symbols) {
        stmt.run(fileId, s.kind, s.name, s.start_line, s.end_line, s.sig || null);
      }
      db.prepare("COMMIT").run();
    } catch (e) {
      db.prepare("ROLLBACK").run();
      throw e;
    }
  }
}
