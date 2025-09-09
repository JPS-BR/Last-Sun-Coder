import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: false,
  external: [
    // Deixar fora do bundle para evitar "Dynamic require of 'fs'":
    "typescript",
    "better-sqlite3",
    "keytar",
    "openai",
    // Built-ins (tsup normalmente já externaliza, mas garantimos):
    "fs",
    "path",
    "os",
    "crypto",
    "util"
  ]
});
