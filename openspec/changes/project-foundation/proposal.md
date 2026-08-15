## Why

The repository is empty: no structure, tooling, conventions, or security baseline exists. Without a defined foundation, the planned changes (security-foundation, authentication-and-authorization, places-search, lead-management, lead-lists-and-pipeline, lead-export, audit-and-observability, production-hardening-and-deployment) would be built inconsistently and require rework. This change establishes the monorepo skeleton, quality gates, configuration and secrets strategy, development infrastructure, documentation, and the frontend/backend responsibility boundary that every later change must honor.

## What Changes

- Create a pnpm-workspaces monorepo with `apps/web`, `apps/api`, `apps/e2e`, `packages/contracts`, `packages/eslint-config`, `packages/typescript-config`, `infrastructure`, `docs`, `scripts`, and `openspec`.
- Define code, formatting, and commit conventions; add ESLint (flat config), Prettier, lint-staged, and husky.
- Establish a configuration and secrets strategy: per-app `.env` files gitignored (`**/.env`, `**/.env.*`); `.env.example` explicitly allowed (`!**/.env.example`) and committed with non-secret placeholders only; fail-fast validation of environment variables at backend startup.
- Add development Docker: PostgreSQL pinned image, non-root, healthcheck, internal network, port published to the host loopback only (`127.0.0.1:5432:5432`); production must not publish the database port publicly.
- Document architecture, security principles, and initial architectural decisions (ADRs).
- Declare the frontend/backend responsibility boundary: Google Places is accessed only by the backend; the API key never reaches the frontend.

## Capabilities

### New Capabilities

- `app-foundation`: persistent behavioral contracts the whole system must uphold — fail-fast configuration validation, secrets never committed, Google Places key backend-only, PostgreSQL not publicly exposed, minimal public health check, and structured sanitized logs.

### Modified Capabilities

(none — greenfield repository; no existing specs)

## Impact

- Greenfield: no existing code to migrate.
- Dev-only dependencies; tool versions pinned via the pnpm lockfile and `packageManager` field.
- Repository-level config files, the OpenSpec change artifacts, and a local Postgres compose file.
- Contracts defined here constrain authentication-and-authorization, security-foundation, places-search, audit-and-observability, and production-hardening-and-deployment.
