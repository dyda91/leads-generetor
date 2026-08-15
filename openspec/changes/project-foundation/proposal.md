## Why

The repository is empty: no structure, tooling, conventions, or security baseline exists. Without a defined foundation, the planned changes (security-foundation, authentication-and-authorization, places-search, lead-management, lead-lists-and-pipeline, lead-export, audit-and-observability, production-hardening-and-deployment) would be built inconsistently and require rework. This change establishes the monorepo skeleton, quality gates, configuration and secrets strategy, development infrastructure, documentation, and the frontend/backend responsibility boundary that every later change must honor.

## What Changes

- Create a pnpm-workspaces monorepo with `apps/web`, `apps/api`, `apps/e2e`, `packages/contracts`, `packages/eslint-config`, `packages/typescript-config`, `infrastructure`, `docs`, `scripts`, and `openspec`.
- Define code, formatting, and commit conventions; add ESLint (flat config), Prettier, lint-staged, and husky.
- Establish a configuration and secrets strategy: per-app `.env` files gitignored (`**/.env`, `**/.env.*`); `.env.example` explicitly allowed (`!**/.env.example`) and committed with non-secret placeholders only. Runtime fail-fast validation is an obligation of `security-foundation`.
- Add development Docker: PostgreSQL pinned image, non-root, healthcheck, internal network, port published to the host loopback only (`127.0.0.1:5433:5432` — host port 5433, container port 5432); production must not publish the database port publicly.
- Document architecture, security principles, and initial architectural decisions (ADRs).
- Declare the frontend/backend responsibility boundary at repository level: `GOOGLE_PLACES_API_KEY` is declared only in the backend template; runtime Google Places calls/responses are owned by `places-search`.
- Register future ownership explicitly: runtime fail-fast configuration and the minimal health check belong to `security-foundation`; runtime sanitized logs belong to `audit-and-observability`; Google Places runtime (backend-only calls, provider abstraction, normalized responses) belongs to `places-search`.

This change establishes the repository structure, quality gates, secret hygiene, and an isolated local development database. It does **not** deliver runtime fail-fast configuration validation, a health endpoint, a runtime logger, or Google Places runtime calls.

## Capabilities

### New Capabilities

- `app-foundation`: persistent behavioral contracts implemented and verifiable in this change — secret hygiene (secrets never committed, `.env.example` placeholders, secret detection in gates), Google Places key declared only in the backend at repository level, PostgreSQL not publicly exposed (loopback in development; no published port in production), reproducible foundation gates, and shared strict TypeScript configurations. Runtime behaviors (fail-fast configuration, minimal health check, sanitized runtime logs, Google Places runtime calls/responses) are owned by future changes (`security-foundation`, `audit-and-observability`, `places-search`).

### Modified Capabilities

(none — greenfield repository; no existing specs)

## Impact

- Greenfield: no existing code to migrate.
- Dev-only dependencies; tool versions pinned via the pnpm lockfile and `packageManager` field.
- Repository-level config files, the OpenSpec change artifacts, and a local Postgres compose file.
- Contracts defined here constrain authentication-and-authorization, security-foundation, places-search, audit-and-observability, and production-hardening-and-deployment.
