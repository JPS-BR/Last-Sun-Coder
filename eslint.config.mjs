import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["node_modules/**", "**/dist/**", ".lastsun/**", "**/*.d.ts"] },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...(tseslint.configs["recommended-type-checked"] ? tseslint.configs["recommended-type-checked"] : []),

  // Habilita checagem baseada em tipo para TS (regras "type-checked")
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      // ativa o serviço de projeto do TypeScript (project: true) — útil em monorepos
      parserOptions: {
        project: true
      }
    }
  },

  {
    // regras/opts gerais (ESM)
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly"
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off"
    }
  },

  // Se tiver arquivos CommonJS, liberamos os globals só neles e forçamos sourceType script
  {
    files: ["**/*.cjs", "**/*.cts"],
    languageOptions: {
      sourceType: "script",
      globals: {
        require: "readonly",
        module: "readonly",
        exports: "readonly",
        __dirname: "readonly",
        __filename: "readonly"
      }
    }
  }
];
