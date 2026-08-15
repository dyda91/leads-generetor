## Context

Greenfield repository; nothing to migrate. The decisions here constrain every later change. Motivation is in proposal.md — Why; the behavioral contracts are in specs/app-foundation/spec.md. In development the apps run on the host, so the development database must be reachable from the host without being exposed beyond it.

## Goals / Non-Goals

**Goals:**
- A reproducible pnpm-workspaces monorepo with strict TypeScript, shared configs, and per-app isolation.
- Quality gates (lint, format, typecheck, tests, build) runnable from the root.
- A safe configuration and secrets strategy with fail-fast validation at backend startup.
- A local development database via Docker: non-root, pinned image, internal network, loopback-only published port.
- Documentation set (architecture, security, ADRs) and a declared frontend/backend boundary.

**Non-Goals:**
- No application features (authentication, search, leads, export) — later changes.
- No production containers or deployment — production-hardening-and-deployment.
- No Google Places integration — places-search.
- No persistence schema — security-foundation/authentication define the data model.

## Decisions

1. **pnpm workspaces (no Turborepo yet):** build caching is not a bottleneck at this stage. The `packageManager` field pins `pnpm@11.21.0`. Alternative (Turborepo/Nx) rejected for added complexity; revisit only if build caching becomes a real bottleneck.
2. **Strict TypeScript everywhere:** `packages/typescript-config` provides `tsconfig.base.json`, `tsconfig.web.json`, and `tsconfig.api.json`; no implicit `any`. `packages/contracts` holds framework-agnostic contracts for the API/web boundary.
3. **NestJS 11 with a global ValidationPipe (runtime obligation — `security-foundation`):** `transform` + `whitelist` + `forbidNonWhitelisted` (rejects unknown properties — security requirement 3); environment variables validated at boot with fail-fast termination on invalid or unsafe configuration. Not implemented in this change; the API will deliver it and `security-foundation` will own the normative spec.
4. **React 19 + Vite 7 + Tailwind CSS + shadcn/ui (runtime obligation — `visual-foundation-and-layout`):** CSP-compatible build; no secret ever reaches the runtime. Not implemented in this change.
5. **Shared `eslint-config` (flat) for base/react/node + Prettier; lint-staged + husky on pre-commit.** Implemented in this change.
6. **Testing structure:** Vitest (web), Jest (api), Playwright (apps/e2e); unit tests colocated with modules; integration tests against the API; negative tests (authorization, validation, rate limiting) defined per change. In this change the runner configs and quality gates are implemented; real tests land with the features that own them.
7. **Development Docker — loopback-only database:** `infrastructure/docker-compose.dev.yml` runs PostgreSQL (pinned image, non-root user, healthcheck) on an internal network. Because the apps run on the host, the port is published **only on loopback**: host port `5433` mapped to the container port `5432` (`127.0.0.1:5433:5432`). `0.0.0.0` is never used for the database. This permits local access only and keeps the database off every external interface. In production the database has no published port at all (spec: "PostgreSQL não exposto publicamente"). Alternative (fully containerized apps) rejected for slow DX; alternative (publishing to `0.0.0.0`) rejected for exposing the database beyond the host.
8. **Secrets:** per-app `.env` files are gitignored with `**/.env` and `**/.env.*`; `.env.example` is explicitly un-ignored (`!**/.env.example`) and committed with non-secret placeholders only. `scripts/check-secrets` guards against accidental commits. Verified with `git check-ignore` (spec: "Segredos nunca versionados").
9. **Ownership (spec contracts vs future runtime):** the `app-foundation` spec holds ONLY contracts implemented and verifiable in this change — secret hygiene, repository-level Google Places key placement, PostgreSQL exposure, foundation gates, and shared strict TypeScript configurations. Runtime behaviors are owned by future changes, which will create their own normative specs: `security-foundation` (fail-fast configuration runtime, minimal health check, input validation, rate limiting, CSRF, token rotation), `audit-and-observability` (sanitized runtime logs, audit trail), and `places-search` (Google Places runtime: provider abstraction, backend-only calls, normalized responses). The `app-foundation` spec MUST NOT contain runtime requirements that are not implemented in this change.

## Risks / Trade-offs

- Scope creep into later changes → explicit Non-Goals; each change stays small and traceable.
- Baseline-spec overlap with security-foundation → ownership declared above; security-foundation deepens, never contradicts.
- Tooling version drift → lockfile, `packageManager` pin, and pinned Docker image tags (digests later in production).
- Un-pinned `npx`-based OpenSpec → add `@fission-ai/openspec` as a root devDependency.
- Loopback-only database port → host-only tooling that needs direct DB access works locally; CI/e2e use the compose network accordingly.
- Env-file patterns must not accidentally ignore `.env.example` → explicit negation rule and `git check-ignore` verification tasks.
