# Leads Generator

Sistema de geração de leads empresariais: busca de empresas por segmento e localização (via Google Places API, somente pelo backend), organização de leads, listas de prospecção, exportação em CSV/XLSX e auditoria de ações sensíveis.

> Status: fundação + shell de API NestJS seguro com **autenticação do administrador único** (sessão opaca por cookie, Argon2id, CSRF, CORS com credenciais, rate limit reforçado) sobre PostgreSQL. Recursos de negócio serão adicionados em mudanças planejadas via OpenSpec. Superfície pública e limites: [`docs/architecture/api.md`](docs/architecture/api.md).

## Stack

- Monorepo: pnpm workspaces
- Frontend: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- Backend: NestJS + TypeScript (estrito) + Prisma + PostgreSQL
- Testes: Vitest (web), Jest (api), Playwright (e2e)
- Qualidade: ESLint, Prettier, lint-staged, husky
- Infra: Docker Compose (desenvolvimento)

## Estrutura

```
apps/
  web/          Frontend (React + Vite)
  api/          Backend (NestJS)
  e2e/          Testes end-to-end (Playwright)
packages/
  contracts/    Contratos compartilhados entre API e web
  eslint-config/ Configurações ESLint compartilhadas
  typescript-config/ Configurações TypeScript compartilhadas
infrastructure/ Docker Compose e infraestrutura local
docs/
  architecture/ Visão arquitetural
  security/     Princípios de segurança
  decisions/    Decisões arquiteturais (ADRs)
scripts/        Scripts utilitários
openspec/       Especificações e mudanças (Spec-Driven Development)
```

## Pré-requisitos

- Node.js >= 22
- pnpm 11.x (via Corepack: `corepack enable`)
- Docker (para o PostgreSQL de desenvolvimento)

## Setup

```bash
corepack enable
pnpm install
```

## Desenvolvimento (PostgreSQL)

O banco de desenvolvimento roda via Docker Compose (`infrastructure/docker-compose.dev.yml`). A API será executada no host durante o desenvolvimento, por isso a porta é publicada **somente em loopback** — porta do host `5433` apontando para a porta interna do container `5432` (`127.0.0.1:5433:5432`) — nunca `0.0.0.0`. **Em produção o PostgreSQL não possui porta publicada.**

1. Configure os valores locais sem expor segredos no Git (o `.env` é ignorado):
   ```bash
   cp infrastructure/.env.example infrastructure/.env
   # edite infrastructure/.env com credenciais locais de desenvolvimento
   ```
2. Suba o banco:
   ```bash
   docker compose -f infrastructure/docker-compose.dev.yml up -d postgres
   ```
3. Pare ao terminar:
   ```bash
   docker compose -f infrastructure/docker-compose.dev.yml down
   ```

Diagnóstico:

```bash
docker compose -f infrastructure/docker-compose.dev.yml ps
docker compose -f infrastructure/docker-compose.dev.yml logs postgres
docker compose -f infrastructure/docker-compose.dev.yml exec postgres pg_isready -U leads_dev -d leads_dev
```

O processo do PostgreSQL executa sem root (entrypoint oficial). Os dados persistem em volume nomeado (`leads-postgres-data`). A API lê as variáveis do **ambiente do processo** (não carrega `.env` automaticamente — ver [`docs/architecture/api.md`](docs/architecture/api.md)); `DATABASE_URL` é **obrigatória** e a aplicação conecta ao banco no boot.

### Criar o primeiro administrador (bootstrap)

Não há credencial padrão. O primeiro admin é criado por comando **interativo** (exige TTY, sem eco, com confirmação):

```bash
DATABASE_URL=postgresql://…@127.0.0.1:5433/leads_dev \
  pnpm --filter @leads/api bootstrap-admin
```

A senha não é aceita via argumento de CLI nem variável de ambiente; o comando recusa um segundo admin (409) e nunca imprime senha, hash ou e-mail.

### Banco de testes isolado (porta 5434)

Os testes usam um PostgreSQL isolado em `tmpfs` (`postgres-test`, porta loopback `127.0.0.1:5434`, banco/usuário `leads_test`), nunca o banco de desenvolvimento:

```bash
docker compose -f infrastructure/docker-compose.dev.yml up -d postgres-test
DATABASE_URL_TEST=postgresql://…@127.0.0.1:5434/leads_test \
  pnpm --filter @leads/api exec prisma migrate deploy
DATABASE_URL_TEST=postgresql://…@127.0.0.1:5434/leads_test \
  pnpm --filter @leads/api test
docker compose -f infrastructure/docker-compose.dev.yml down postgres-test
```

Os testes recusam rodar se `DATABASE_URL_TEST` não corresponder ao banco de teste esperado; `prisma migrate reset` nunca é executado contra o banco de desenvolvimento.

## Comandos

| Comando                                    | Descrição                                                            |
| ------------------------------------------ | -------------------------------------------------------------------- |
| `pnpm dev`                                 | Inicia web e api em modo desenvolvimento                             |
| `pnpm build`                               | Build de todos os workspaces                                         |
| `pnpm lint`                                | ESLint em todos os workspaces                                        |
| `pnpm typecheck`                           | Verificação de tipos                                                 |
| `pnpm test`                                | Testes de todos os workspaces (api exige `DATABASE_URL_TEST`)        |
| `pnpm format`                              | Formata o código com Prettier                                        |
| `pnpm format:check`                        | Verifica a formatação                                                |
| `pnpm check`                               | Gate completo: format + workspaces + lint + typecheck + test + build |
| `pnpm --filter @leads/api bootstrap-admin` | Cria o primeiro administrador (interativo, TTY)                      |

## Qualidade

- **Pre-commit (Husky + lint-staged):** executa `eslint --fix` e `prettier --write` apenas nos arquivos staged (extensões compatíveis). Não roda build nem E2E. Falhas bloqueiam o commit.
- **Contratos de scripts por workspace:** ao criar um app, ele **deve** declarar `lint`, `typecheck` e `test` (`dev` e `build` obrigatórios para web/api). O gate `pnpm check:workspaces` falha se um workspace implementado não declarar os scripts obrigatórios. Pacotes de config/contracts (`*-config`, `@leads/contracts`) são isentos.

## Segurança

- A chave da Google Places API existe **somente no backend**, carregada por variável de ambiente. Nunca chega ao frontend, a respostas da API, a logs ou a testes.
- Arquivos `.env` reais são ignorados pelo git; apenas `.env.example` (placeholders não secretos) é versionado. O frontend não possui `GOOGLE_PLACES_API_KEY` e nenhuma variável `VITE_*` contém segredo.
- **Detecção de segredos (secretlint):** `pnpm check:secrets` varre arquivos versionados/staged; o pre-commit também verifica os staged. Nenhuma ferramenta garante detecção total — revisão humana adicional é recomendada.
- O PostgreSQL de desenvolvimento expõe a porta somente em loopback (`127.0.0.1:5433` no host → `5432` no container); em produção nenhuma porta do banco é publicada.
- **Autenticação:** sessão opaca única por cookie (`HttpOnly`/`SameSite=Strict`, nome por ambiente), senha Argon2id, CSRF synchronizer token, CORS com credenciais apenas para origens exatas, **`Origin` obrigatória nas mutações de autenticação**, anti-enumeração temporal (exatamente uma verificação Argon2 por tentativa, com hash dummy para inexistente/inativo) e rate limit reforçado em login/troca de senha. Sem credencial padrão — o primeiro admin é criado pelo `bootstrap-admin` interativo. Detalhes e decisões: [`docs/architecture/api.md`](docs/architecture/api.md) e [`docs/decisions/ADR-0006-session-authentication.md`](docs/decisions/ADR-0006-session-authentication.md).

Detalhes: `docs/architecture/` e `docs/security/`.
