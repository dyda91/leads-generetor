## Why

The repository has a foundation with no executable backend. The runtime security controls intentionally moved out of `project-foundation` (fail-fast configuration, minimal health check, secure HTTP bootstrap, strict validation, safe error handling, rate limiting, request ID) need a minimal NestJS API to become real, tested behavior. No authentication, leads, Google Places, or business rules are introduced here.

## What Changes

- Create the minimal `apps/api` scaffold with NestJS 11 and strict TypeScript (shared configs, `@leads/typescript-config` and `@leads/eslint-config`), with real `dev`, `build`, `lint`, `typecheck`, and `test` scripts.
- Implement fail-fast environment validation at boot (zod): required/invalid/unsafe configuration terminates the process before accepting traffic; error messages never print the received values; production rejects insecure configurations.
- Add a minimal public health endpoint returning only status, without revealing database, memory, hostname, versions, environment, or dependencies; disallowed methods are rejected.
- Secure HTTP bootstrap: Helmet headers (CSP as a restrictive policy for a non-HTML API, never disabled globally; HSTS only in production), no `X-Powered-By`, explicit CORS allowlist (wildcard forbidden in production, origins compared by full normalized origin, credentials off), explicit JSON/URL-encoded body-size limits.
- Global `ValidationPipe` (`transform`, `whitelist`, `forbidNonWhitelisted`); rejected values never appear in logs or responses.
- Centralized error handling with a consistent contract; messages come from controlled codes (never raw `exception.message` of unexpected errors); `details` only field names and violation types, never received values; 413/429/404/validation share the envelope when technically possible; pre-NestJS body-parser errors normalized; no stack traces in production; request ID for correlation.
- Global rate limiting (`429` on excess) without sensitive headers; in-memory limiter is single-instance only; `trust proxy` off with no `X-Forwarded-For` heuristics.
- Request ID for correlation (always server-generated via `crypto.randomUUID()`; never trusts, reuses, or echoes client-supplied IDs; never containing user data).
- Graceful shutdown on termination signals; distinct safe configuration per environment (development/test/production); Swagger absent or disabled in production.
- Unit, integration, and negative security tests; documentation of the created public surface.

Spec summary: 9 requirements, 43 scenarios.

## Capabilities

### New Capabilities

- `security-foundation`: runtime security and operational controls of the minimal backend shell — fail-fast configuration, minimal public health check, secure HTTP bootstrap (headers, CORS, payload limit), strict input validation, centralized safe error handling, rate limiting, request ID correlation, and orderly startup/shutdown.

### Modified Capabilities

(none — new capability)

## Impact

- New workspace `apps/api`; runtime deps (`@nestjs/*`, `zod`, `helmet`, `@nestjs/throttler`) and dev deps (Jest, supertest, typescript) added.
- Introduces the executable backend shell; does NOT introduce authentication, authorization, Google Places, leads, or business Prisma schema.
- Constrains future changes: `authentication-and-authorization` builds on the secure bootstrap; `audit-and-observability` adds rich structured logs/audit on top of safe errors; `production-hardening-and-deployment` handles proxy/trust and multi-instance rate limiting.
