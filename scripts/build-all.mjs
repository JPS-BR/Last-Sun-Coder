import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const PKGS_DIR = "packages";

// coleta pastas de packages/
const dirs = readdirSync(PKGS_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

// lista de pacotes que têm script build
const entries = [];
for (const dir of dirs) {
  try {
    const pkgJsonPath = join(PKGS_DIR, dir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    if (pkg?.scripts?.build) {
      entries.push({ name: pkg.name || dir, dir });
    }
  } catch {
    // ignora pastas sem package.json válido
  }
}

// prioridade: core -> runner -> cli -> resto (A..Z)
const priority = ["core", "runner", "cli"];
entries.sort((a, b) => {
  const ai = priority.indexOf(a.dir);
  const bi = priority.indexOf(b.dir);
  if (ai !== -1 && bi !== -1) return ai - bi;
  if (ai !== -1) return -1;
  if (bi !== -1) return 1;
  return a.dir.localeCompare(b.dir);
});

// executa builds em série
for (const e of entries) {
  const wsPath = join(PKGS_DIR, e.dir);
  console.log(`\n=== Building ${e.name} (${wsPath}) ===`);
  const res = spawnSync("npm", ["run", "-w", wsPath, "build"], {
    stdio: "inherit",
    shell: true
  });
  if (res.status !== 0) {
    console.error(`Build falhou em ${e.name}`);
    process.exit(res.status || 1);
  }
}
