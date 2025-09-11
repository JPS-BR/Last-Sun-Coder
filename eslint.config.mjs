import tseslint from "typescript-eslint";

// Flat config (ESLint 9)  sem type-checking global (evita erro do tsup.config.ts)
// Regras ajustadas: _ como prefixo para ignorar "unused", loops constantes permitidos, catch vazio permitido.
// Ignora "tsup.config.ts" e artefatos de build.
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/packages/*/tsup.config.ts", // evita "parserOptions.project" nesse arquivo
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_"
      }],
      "no-constant-condition": ["error", { "checkLoops": false }],
      "no-empty": ["error", { "allowEmptyCatch": true }]
    }
  }
);
