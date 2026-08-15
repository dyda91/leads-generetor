## 1. Repositório e estrutura

- [ ] 1.1 Inicializar o repositório git e criar `.gitignore` raiz (node_modules, dist, coverage, playwright-report, test-results, etc.)
- [ ] 1.2 Adicionar ao `.gitignore` as regras de ambiente: `**/.env`, `**/.env.*`, `!**/.env.example`
- [ ] 1.3 Criar a estrutura de diretórios: apps/web, apps/api, apps/e2e, packages/contracts, packages/eslint-config, packages/typescript-config, infrastructure, docs/architecture, docs/security, docs/decisions, scripts, openspec
- [ ] 1.4 Criar `package.json` raiz com `packageManager: "pnpm@11.21.0"` e scripts (dev, build, lint, typecheck, test, format, check)
- [ ] 1.5 Criar `pnpm-workspace.yaml` listando os workspaces
- [ ] 1.6 Criar `README.md` raiz (visão geral, stack, setup, comandos)

## 2. Configuração compartilhada

- [ ] 2.1 packages/typescript-config: `tsconfig.base.json` (strict), `tsconfig.web.json`, `tsconfig.api.json` e metadados do pacote
- [ ] 2.2 packages/eslint-config: configs flat base/react/node + integração Prettier
- [ ] 2.3 Prettier raiz (`.prettierrc`, `.prettierignore`) e script `format:check`

## 3. Qualidade

- [ ] 3.1 Configurar husky + lint-staged (pre-commit: eslint --fix e prettier --write nos arquivos alterados)
- [ ] 3.2 Criar config base do Playwright em apps/e2e
- [ ] 3.3 Criar scripts raiz de verificação (lint, typecheck, test, build)

## 4. Configuração e segredos

- [ ] 4.1 Criar `.env.example` em apps/api e apps/web com apenas placeholders não secretos
- [ ] 4.2 Criar `scripts/check-secrets` (varredura de padrões de segredo em arquivos versionados) e incluí-lo nos gates
- [ ] 4.3 Confirmar com `git check-ignore` que `.env` é ignorado e `.env.local` é ignorado
- [ ] 4.4 Confirmar com `git check-ignore` que `.env.example` NÃO é ignorado

## 5. Docker de desenvolvimento

- [ ] 5.1 Criar `infrastructure/docker-compose.dev.yml` com PostgreSQL (imagem fixada, usuário não-root, healthcheck, rede interna)
- [ ] 5.2 Publicar a porta do PostgreSQL somente em loopback: `127.0.0.1:5432:5432` (nunca 0.0.0.0)
- [ ] 5.3 Adicionar volume nomeado de persistência e documentar que o acesso é apenas local
- [ ] 5.4 Documentar no README que em produção o PostgreSQL não possui porta publicamente publicada

## 6. Documentação

- [ ] 6.1 docs/architecture/README.md (visão arquitetural, limites frontend/backend, fluxo Google Places backend-only)
- [ ] 6.2 docs/security/README.md (princípios de segurança e mapa dos requisitos por mudança)
- [ ] 6.3 docs/decisions: ADR-0001 monorepo pnpm, ADR-0002 Google Places backend-only, ADR-0003 validação fail-fast de config, ADR-0004 stack de testes, ADR-0005 Docker dev e redes (loopback-only)

## 7. Validação da fundação

- [ ] 7.1 `pnpm install` + lockfile; `pnpm lint`, `pnpm typecheck` e build dos pacotes sem erros
- [ ] 7.2 Verificação manual: nenhum segredo versionado, `.env` ignorado, `.env.example` versionado, porta do Postgres em loopback, containers não-root
- [ ] 7.3 Revisão dos contratos da spec app-foundation versus implementação
