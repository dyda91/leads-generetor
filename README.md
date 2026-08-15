# Leads Generator

Sistema de geração de leads empresariais: busca de empresas por segmento e localização (via Google Places API, somente pelo backend), organização de leads, listas de prospecção, exportação em CSV/XLSX e auditoria de ações sensíveis.

> Status: fundação do monorepo em construção. Recursos de negócio serão adicionados em mudanças planejadas via OpenSpec.

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
docker compose -f infrastructure/docker-compose.dev.yml up -d
```

## Comandos

| Comando            | Descrição                                    |
| ------------------ | -------------------------------------------- |
| `pnpm dev`         | Inicia web e api em modo desenvolvimento     |
| `pnpm build`       | Build de todos os workspaces                 |
| `pnpm lint`        | ESLint em todos os workspaces                |
| `pnpm typecheck`   | Verificação de tipos                         |
| `pnpm test`        | Testes de todos os workspaces                |
| `pnpm format`      | Formata o código com Prettier                |
| `pnpm format:check`| Verifica a formatação                        |
| `pnpm check`       | lint + typecheck + test + build              |

## Segurança

- A chave da Google Places API existe **somente no backend**, carregada por variável de ambiente. Nunca chega ao frontend, a respostas da API, a logs ou a testes.
- Arquivos `.env` reais são ignorados pelo git; apenas `.env.example` (placeholders não secretos) é versionado.
- O PostgreSQL de desenvolvimento expõe a porta somente em loopback (`127.0.0.1:5432`); em produção nenhuma porta do banco é publicada.

Detalhes: `docs/architecture/` e `docs/security/`.
