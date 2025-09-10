#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const PKGS_DIR = "packages";

// Fases padrão: executa tudo que existir em cada pacote
const argv = process.argv.slice(2);
const phases = (() => {
  const arg = argv.find((a) => a.startsWith("--phases="));
  if (arg) {
    return arg
      .split("=")[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  // padrão: roda todas que existirem
  return ["clean", "typecheck", "build"];
})();

// Coleta pacotes (subpastas de packages/ com package.json válido)
const dirs = readdirSync(PKGS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const entries = [];
for (const dir of dirs) {
  try {
    const pkgJsonPath = join(PKGS_DIR, dir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    entries.push({ name: pkg.name || dir, dir, scripts: pkg.scripts || {} });
  } catch {
    // Sem package.json válido: ignora
  }
}

// Ordem de build (prioriza dependências prováveis)
const priority = ["core", "indexer", "app", "runner", "cli", "hud"];
entries.sort((a, b) => {
  const ai = priority.indexOf(a.dir);
  const bi = priority.indexOf(b.dir);
  if (ai !== -1 && bi !== -1) return ai - bi;
  if (ai !== -1) return -1;
  if (bi !== -1) return 1;
  return a.dir.localeCompare(b.dir);
});

// Executa em série por pacote e por fase
for (const e of entries) {
  const wsPath = join(PKGS_DIR, e.dir);

  for (const phase of phases) {
    if (!e.scripts || !e.scripts[phase]) {
      // fase não definida neste pacote -> pula
      continue;
    }

    console.log(`\n=== ${e.name} — ${phase} (${wsPath}) ===`);
    const res = spawnSync("npm", ["run", "-w", wsPath, phase], {
      stdio: "inherit",
      shell: true // compatível com PowerShell 5.1
    });

    if (res.status !== 0) {
      console.error(`\n✖ Falhou em ${e.name} — ${phase}`);
      process.exit(res.status || 1);
    }
  }
}

console.log(`\n✔ build-all concluído. Fases: [${phases.join(", ")}]; Pacotes: ${entries.length}.`);