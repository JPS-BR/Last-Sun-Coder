import tseslint from "typescript-eslint";

// Flat config ESLint 9
export default tseslint.config(
  // Ignorar pastas/arquivos
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/packages/*/tsup.config.ts",
    ],
  },

  // Regras recomendadas de TS-ESLint
  ...tseslint.configs.recommended,

  // Overrides para o indexer (CommonJS + require permitido)
  {
    files: ["packages/indexer/**/*.{ts,tsx,js,cjs,mjs}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off"
    }
  },

  // Regras globais (MVP)
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_"
      }],
      "@typescript-eslint/no-explicit-any": "warn",        // <- fecha a maioria agora
      "no-constant-condition": ["error", { "checkLoops": false }],
      "no-empty": ["error", { "allowEmptyCatch": true }]
    }
  }
);
