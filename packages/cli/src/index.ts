#!/usr/bin/env node
import { Command } from "commander";
import * as path from "node:path";
import * as fs from "node:fs";
import OpenAI from "openai";
import { Secrets, Project, Symbols } from "@lsc/core";

async function resolveApiKey(): Promise<string | null> {
  const v = await Secrets.getOpenAIKey();
  if (v && v.trim()) return v.trim();
  const e = process.env.OPENAI_API_KEY;
  if (e && e.trim()) return e.trim();
  return null;
}

const program = new Command();
program.name("lsc").description("Last Sun Coder - CLI (MVP Parte A)").version("0.1.0");

program
  .command("setup-key")
  .description("Salva a OPENAI_API_KEY no cofre do SO")
  .requiredOption("--key <key>", "API key da OpenAI")
  .action(async (opts) => {
    await Secrets.setOpenAIKey(opts.key);
    console.log("OK: chave salva com segurança.");
  });

program
  .command("init")
  .description("Cria/abre projeto no diretório raiz e inicializa o banco local")
  .requiredOption("--root <path>", "Diretório raiz do projeto")
  .option("--name <name>", "Nome do projeto")
  .action((opts) => {
    const root = path.resolve(opts.root);
    if (!fs.existsSync(root)) throw new Error("Diretório inexistente.");
    const { db, project } = Project.openOrCreateProject(root, opts.name);
    console.log(`Projeto: ${project.name}`);
    console.log(`DB inicializado.`);
    db.close();
  });

program
  .command("whitelist")
  .description("Define a whitelist de pastas (separadas por vírgula)")
  .requiredOption("--root <path>", "Diretório raiz do projeto")
  .requiredOption("--paths <csv>", "Ex.: src,packages,docs")
  .action((opts) => {
    const { db, project } = Project.openOrCreateProject(path.resolve(opts.root));
    const arr = String(opts.paths).split(",").map((s) => s.trim()).filter(Boolean);
    Project.setWhitelist(db, project.id, arr);
    db.close();
    console.log("Whitelist atualizada:", arr.join(", "));
  });

program
  .command("index-file")
  .description("Indexa símbolos de um arquivo TS/JS")
  .requiredOption("--root <path>", "Diretório raiz do projeto")
  .requiredOption("--file <path>", "Caminho do arquivo (abs ou relativo ao root)")
  .action((opts) => {
    const { db, project } = Project.openOrCreateProject(path.resolve(opts.root));
    const abs = path.isAbsolute(opts.file)
      ? opts.file
      : path.join(Project.projectRoot(db, project.id), opts.file);
    if (!fs.existsSync(abs)) throw new Error("Arquivo não encontrado.");
    Symbols.indexFile(db, project.id, abs);
    db.close();
    console.log("Indexado:", abs);
  });

program
  .command("models")
  .description("Lista modelos disponíveis (via OpenAI SDK). Requer API key (vault ou env).")
  .action(async () => {
    const key = await resolveApiKey();
    if (!key) {
      console.error(
        "API key não configurada.\nOpções:\n1) Defina OPENAI_API_KEY só nesta sessão\n2) Rode: lsc setup-key --key <KEY>"
      );
      process.exit(1);
    }
    const client = new OpenAI({ apiKey: key });
    const models = await client.models.list();
    console.log(models.data.map((m) => m.id).join("\n"));
  });

program.parseAsync().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
