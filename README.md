# Last Sun Coder — Esqueleto_PT1

Esqueleto do monorepo conforme o PDF **Last Sun Coder-esqueleto Pt1**.

- **Sem HUD implementada** (apenas placeholder em `packages/app/HUD/`).
- **Somente estrutura** do repositório e contratos do motor/SDK.

## Estrutura

- `packages/core` — motor/orquestrador (Node/TypeScript)
- `packages/indexer` — indexação local (embeddings + FTS)
- `packages/runner` — validações/execuções locais (format/lint/build/test)
- `packages/server` — (opcional) IPC/HTTP/WebSocket p/ HUD
- `packages/cli` — harness mínimo (debug do motor)
- `packages/app` — HUD (apenas placeholder)
- `resources/` — migrações SQL, esquemas, exemplos
- `scripts/` — build/release/dev
