## Context

The repository has a foundation with no executable backend. The runtime security controls owned by this change (see proposal — Why) need a minimal NestJS shell in `apps/api`. The shared strict TypeScript configs, ESLint config, gates, and secret detection from `project-foundation` are in place. Requirements are in specs/security-foundation/spec.md.

## Goals / Non-Goals

**Goals:**
- A minimal, executable NestJS backend that boots securely and shuts down cleanly.
- Fail-fast environment validation; production rejects insecure configurations.
- Secure HTTP bootstrap: headers, CORS allowlist, body-size limit.
- Strict input validation and centralized safe error handling with a consistent contract.
- Global rate limiting and request ID correlation.
- Unit, integration, and negative security tests; documented public surface.

**Non-Goals:**
- No authentication, authorization, users, or roles (→ `authentication-and-authorization`).
- No Google Places (→ `places-search`), leads, or business Prisma schema/migrations.
- No Redis, queues, export, frontend, or production deployment.
- No rich structured logs or audit trail (→ `audit-and-observability`).
- No public Swagger or detailed diagnostic endpoints.

## Decisions

1. **Express (NestJS default), no silent swap:** NestJS's default HTTP adapter is kept. Helmet and CORS middleware are mature and well-integrated with Express. Alternative (Fastify) rejected to avoid churn without a stated need; revisit only if a measurable requirement appears.
2. **Environment validation with `zod`:** a single zod schema validates all environment variables at boot; per-`NODE_ENV` rules make production stricter. Rationale: strict TypeScript, type-safe parse, consistent with the shared contracts approach. Alternatives: Joi (mature, less type-driven) and ad-hoc checks (rejected — inconsistent).
3. **Request ID — always server-generated:** the backend generates `crypto.randomUUID()` for every request and never trusts, validates-for-reuse, reuses, or echoes a client-supplied `X-Request-Id` as the internal identifier. The backend returns its own ID in the `X-Request-Id` response header and attaches it to logs/errors for correlation. This prevents identifier collisions, log confusion, and client-manipulated correlation. Correlation with external identifiers (e.g. `traceparent`) is deferred to `audit-and-observability`.
4. **Error contract:** a single envelope `{ requestId, statusCode, error, message, details? }`. `message` always comes from controlled codes/messages; `exception.message` of unexpected errors is never returned directly. `details` may contain field names and violation types — never received values. 413, 429, 404, and validation errors follow the same envelope when technically possible. Exceptions raised before NestJS takes over the request (e.g. body parser rejecting a payload) are normalized to the same contract and documented. Stack traces are suppressed in production; the format is environment-aware. This is the boundary for `audit-and-observability`: safe, minimal error output now; rich structured logs/audit later.
5. **Rate limiting — `@nestjs/throttler` global:** in-memory token bucket serves single-instance usage only (documented). `trust proxy` remains OFF and no `X-Forwarded-For` heuristics are implemented. Multi-instance/proxy deployments require their own configuration in `production-hardening-and-deployment`. Response headers carry only standard, non-sensitive fields.
6. **CORS allowlist:** origins come from the `CORS_ORIGINS` environment variable (comma-separated) and are compared by full, normalized origin (no partial matching). Wildcard is forbidden in production (fail-fast rejects it) and `credentials` stays disabled in this change unless a need arises (wildcard + credentials would never combine). Requests without an `Origin` header are allowed and consciously documented: CORS does not authenticate nor protect non-browser clients — server-to-server access is controlled by network/auth in later changes.
7. **Payload limit:** explicit JSON and URL-encoded body parser limits (default 100 KB each), configurable via `BODY_LIMIT` with an upper cap enforced by the schema, so limits cannot be silently raised to unsafe values. Parsers are not duplicated; the number and size of parameters are bounded when applicable. The query parser uses a simple, documented strategy (Express `query parser: 'simple'`).
8. **Proxy configuration:** `trust proxy` is OFF by default (direct connections). When the app is deployed behind a known proxy, the correct trust setting is configured explicitly for the hosting environment (env-driven, documented) — enabling it indiscriminately is rejected, and no `X-Forwarded-For` heuristics are implemented in this change.
9. **Boundary security vs. future authentication:** this change delivers bootstrap-level protection (headers, CORS, validation, rate limiting, safe errors). Authentication/authorization, CSRF for cookies, and user concepts belong to `authentication-and-authorization`, which will build on this shell.
10. **Graceful shutdown and Swagger:** `enableShutdownHooks()` handles SIGTERM/SIGINT with orderly server and connection shutdown. Swagger is not added; if ever added, it must be disabled in production.
11. **CSP — restrictive policy for a non-HTML API:** since the API does not serve HTML, CSP is configured with a restrictive policy instead of being disabled wholesale, considering at minimum `default-src 'none'`, `frame-ancestors 'none'`, and `base-uri 'none'`. Directive values are only fixed after verifying real compatibility with the pinned Helmet version. Tests assert presence and expected values. If a directive must be disabled, that requires a specific documented justification and a corresponding test — never a global disablement.
12. **HSTS — production only:** the HSTS header is emitted only in the `production` environment; development and test never send it. In production, TLS terminates at the proxy; `trust proxy` is NOT enabled automatically for that reason (kept OFF, see decision 8).

## Risks / Trade-offs

- In-memory rate limiter is not shared across instances → explicit single-instance dev/test usage; coordinated strategy documented for multi-instance production.
- `trust proxy` mistakes could break IP-based limiting → disabled by default; set explicitly and tested per hosting; no `X-Forwarded-For` heuristics.
- Strict validation (including `exactOptionalPropertyTypes`) can be verbose for DTOs → explicit DTOs with unit tests; do not weaken strictness.
- Helmet defaults (e.g., CSP) are aimed at HTML apps → CSP is configured as a restrictive API-appropriate policy (not disabled globally) and verified against the pinned Helmet version.
- Error/observability boundary → minimal safe errors now; server-generated request ID bridges future structured logs without exposing internals or trusting client-supplied IDs.

## Migration Plan

Greenfield: no existing data to migrate. The new `apps/api` lands alongside the existing workspace; the shared gates (`pnpm check`, `check:workspaces`, `check:secrets`) cover it once its scripts exist.

## Open Questions

- None that would change the specs or the task breakdown. (Cookie vs. bearer token transport is a decision for `authentication-and-authorization`.)
