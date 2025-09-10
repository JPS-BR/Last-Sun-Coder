import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["node_modules/**", "**/dist/**", ".lastsun/**", "**/*.d.ts"] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

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

  // Se tiver arquivos CommonJS, liberamos os globals só neles
  {
    files: ["**/*.cjs", "**/*.cts"],
    languageOptions: {
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
