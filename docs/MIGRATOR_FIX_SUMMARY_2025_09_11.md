MIGRATOR FIX SUMMARY - 2025-09-11

Resumo do que foi feito para normalizar a invocação do DB nativo no migrator e tornar o smoke test estável.

1) O que foi corrigido (high level)
- Aplicar invocações qualificadas no DB nativo quando houver wrapper com .db; passar a usar o objeto nativo diretamente para exec/prepare/run, sem destruturar.
- Adicionar noop seguro: PRAGMA foreign_keys = ON antes das migrações para detectar binding cedo.
- Manter consumo de tipos a partir de core/dist (@lsc/core) e não apontar para src directly.
- Garantir o smoke test: runner index funciona com local-tests/sample-project.

2) Mudanças por arquivo/módulo
- core/src/types.ts
  - Adicionado MigrationDB e DTOs (JsonValue, JsonObject, JsonArray, UnknownRecord, etc.).
  - Exportado para uso em migrator e demais módulos.
- core/src/services/Migrator.ts
  - applyMigrations agora usa o DB nativo quando disponível (wrapper com .db).
  - Chamadas qualificadas: native.exec/native.prepare/runtime; evitar destruturacao.
  - Noop inicial: PRAGMA foreign_keys = ON antes das migrações.
  - Tratamento de q.all com binding seguro (usar .bind quando necessário).
- core/src/services/KBLocal.ts
  - Retorno de insertChunk tipado com RunResult quando possível; extração de lastInsertRowid sem casting agressivo.
- core/src/services/DB.ts
  - Engine de DB tipado: prepare/run/get/all refatorados para usar UnknownRecord e unknown, evitando any direto.
- core/src/services/ProjectRegistry.ts
  - Tipagem e uso de DTOs (Project, FileRecord etc.) com UnknownRecord/JsonValue conforme necessidade; redução de usos de any.
- indexer/src/parser.ts
  - Introduzidos TSNode e isNode para evitar uso de any desnecessário; tipos locais para lang/util.
- indexer/src/index.ts / runner/src/index.ts
  - Migrado para consumo de dist via @lsc/core; troca de imports para type-only com migração gradual, e remoção de dependências do src direto.
- app/src/kernel.ts
  - Tipagem de handlers com DTOs do core; usar unknown/guards antes de acessar campos; evita qualquer direto no fluxo controlador.

3) Smoke test realizado
- Build final: node scripts/build-all.mjs --phases=build — OK em todos os pacotes (core dist + .d.ts gerados).
- Runner help: node packages/runner/dist/index.js --help — OK.
- Smoke simple: node packages/runner/dist/index.js index --root ".\local-tests\sample-project" — OK; mostra uso correto e processa compromissos de indexação.
- Indexação real de um sample-project dentro local-tests: rodado com sucesso no fluxo; logs mostraram project id, files, chunks.

4) Observações de ambiente e guardrails
- Mantido consumo de core via core/dist (dist) conforme regra.
- Não houve alterações no module/moduleResolution por design.
- Querys de tipo via TypeScript 4/5 com guards — adotadas para evitar regressões com o runtime do driver.
- Em pontos inevitáveis de no-explicit-any, adicionei disable por linha com justificativa curta.

5) Próximos passos sugeridos
- Abrir PR com o título e a descrição sugeridos no seu commit body, incluindo o resumo acima.
- Rodar npx eslint . e npm run -w packages/* typecheck para validar 0 erros de linting e typecheck (favor manter no pipeline CI).
- Manter o core dist atualizado para consumo pelos demais pacotes.

Observação final
- O smoke test com o indexer em local-tests/sample-project mostrou sucesso de runtime (quando executado com migrator corrigido); se desejar, posso incrementar o teste com um pequeno script de verificação automatizada que valida contagens de arquivos e chunks de forma determinística.

Deseja que eu prepare o PR com o corpo completo já pronto para colar no GitHub, ou prefere que eu gere o conteúdo do PR body em um arquivo separado para anexar?