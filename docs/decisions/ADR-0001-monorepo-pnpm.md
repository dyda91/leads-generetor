# ADR-0001 — Monorepo com pnpm workspaces

- **Status:** Accepted
- **Data:** 2026-08-15

## Contexto

O sistema abrange frontend, backend, testes E2E e pacotes compartilhados de configuração e contratos. É necessário organizar esses componentes em um único repositório com dependências resolvidas de forma consistente e reprodutível.

## Decisão

Adotar um monorepo com **pnpm workspaces** (`apps/*` e `packages/*`), sem Turborepo/Nx nesta fase. A versão do gerenciador é fixada no campo `packageManager` (pnpm 11) e as dependências são travadas no `pnpm-lock.yaml`.

## Alternativas consideradas

- **Turborepo/Nx:** poderoso para cache e orquestração de builds, porém adiciona complexidade e configuração sem necessidade atual.
- **Repositórios separados (polyrepo):** aumenta o custo de sincronização de contratos e configurações compartilhadas.

## Consequências positivas

- Simplicidade e baixo custo de manutenção nesta fase.
- Um único lockfile e instalação consistente.
- Compartilhamento trivial de configs e contratos entre workspaces.

## Consequências negativas / trade-offs

- Sem cache de build distribuído; builds podem ser repetidos.
- Dependência do pnpm (bloqueio de scripts de build exige allowlist explícita).

## Impacto de segurança

- Controle de build scripts centralizado via `allowBuilds` no `pnpm-workspace.yaml` (apenas dependências aprovadas).
- Um lockfile permite auditoria única de dependências (`pnpm audit`).

## Critérios para reavaliar

- Quando o cache de build ou a orquestração de tarefas se tornar gargalo mensurável; quando o número de workspaces crescer significativamente; quando houver necessidade de grafo de dependências entre apps.
