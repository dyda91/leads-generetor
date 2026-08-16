## Context

The private system has a single administrator in the MVP. `security-foundation` delivered the API shell (fail-fast config, health, headers/CSP/HSTS, CORS allowlist, body limits, ValidationPipe, centralized error envelope, global rate limit, server-generated request ID, graceful shutdown) but no user, session, or credential. PostgreSQL is provisioned for development at `127.0.0.1:5433` (compose, loopback-only) and `DATABASE_URL` is reserved. This change adds authentication/authorization on that shell. See `proposal.md` — Why and `specs/authentication-and-authorization/spec.md` for the behavior contract.

## Goals / Non-Goals

**Goals:**
- Private, single-admin authentication with a secure interactive first-admin bootstrap (no default credentials).
- A single opaque server-side session per user, with cookie transport and DB-hashed tokens.
- Authorization guard (role `ADMIN`, status `ACTIVE`, deny by default) that future lead routes reuse for ownership.
- Argon2id password hashing, length-based policy, rehash support.
- A complete CSRF synchronizer-token flow and credentialed CORS restricted to exact origins.
- Tests on an isolated PostgreSQL test database (no SQLite, no dev DB).

**Non-Goals:**
- Public signup, email flows, password reset, OAuth, MFA, multiple organizations, admin user management, Google Places, leads, frontend, payments, Redis, deploy, full logging/audit (→ `audit-and-observability`).

## Decisions

1. **Session strategy — opaque server-side session, single session per user.** The client holds a random CSPRNG token (`crypto.randomBytes(32)`) only in an `HttpOnly` cookie; the DB stores only hashes. **Single active session:** a successful login atomically revokes the user's previous sessions and creates a new session token + new CSRF token (transaction), which prevents session fixation and keeps the MVP simple. Logout revokes the current session; password change revokes all sessions and decides explicitly on the current one (below). **JWT (access+refresh) was evaluated and rejected:** its statelessness is unnecessary here and it requires solving revocation, rotation, secure storage (localStorage is forbidden), and key management — all solved simply by the DB-backed session. No refresh endpoint.

2. **Token hashing with distinct contexts.** `sha256('sess_v1:' + sessionToken)` for the session and `sha256('csrf_v1:' + csrfToken)` for the CSRF token, using separate functions and the distinct prefix so a value from one domain is never confused with the other. Tokens are high-entropy random (not low-entropy), so keyless SHA-256 is appropriate; comparisons use the hashed lookup (unique index) and constant-time comparison for the CSRF token.

3. **CSRF synchronizer token — full flow.** The CSRF token is generated with `crypto.randomBytes(32)`, stored only as `csrfTokenHash` (unique), and compared with a constant-time comparison. Delivery: `POST /auth/login` returns it in the response body after success; `GET /auth/me` returns/rotates it so the frontend can recover after a reload. The token is NOT in the `HttpOnly` cookie (the frontend must send it in a header), is kept only in frontend memory (never localStorage/sessionStorage), and is sent as `X-CSRF-Token` on protected mutations. CORS allows that header only for authorized origins. Login and `me` responses use `Cache-Control: no-store`. Rotation happens on login, on session rotation, and on password change (any event that creates a new session token). Behaviors: missing/invalid/other-session/stale-after-rotation → 403; expired/revoked session → 401. **Origin is mandatory on all authentication mutations** (`login`, `logout`, `change-password`): an absent, `null`, malformed or non-allowlisted `Origin` is rejected with 403; a `Referer`, when present, must agree and never substitutes a missing `Origin`. Read endpoints (`GET /health`, `GET /auth/me`) remain usable without `Origin`. **Deterministic `/auth/me` rotation:** because the DB stores only the CSRF hash, `/me` must rotate; it uses optimistic compare-and-set on the hash observed during session validation. Under concurrent `/me` calls exactly one request persists its hash and returns 200 with a token; the loser returns a controlled 409 (stable `CONFLICT`) without a token and no retry invalidates the winner's token. Logout and change-password require session + exact Origin + valid CSRF; login (login CSRF) also requires the exact Origin.

4. **Session policy — single active session (chosen).** One session per user; login revokes prior sessions atomically; logout revokes the current one; password change revokes all and, by decision, **keeps and rotates the current session** (new session + new CSRF token) so the administrator stays signed in after changing their password. Multi-session support is explicitly out of scope for the MVP (would require listing/limits/revocation UX). No old session remains valid.

5. **Cookie per environment.** Production: name `__Host-leads_session`, `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, no `Domain`. Development/test: name `leads_session`, `HttpOnly`, `SameSite=Strict`, `Path=/`, no `Domain`, `Secure` disabled only because local HTTP runs on loopback. The app rejects a configuration that would emit a non-`Secure` cookie in production, never emits both cookies, only ever sets/clears the cookie of the current environment, and ignores a cookie whose name belongs to another environment. No token is returned in JSON. Same-site requirement for `SameSite=Strict` is documented: API and frontend must stay on the same site; a future cross-site split requires a new analysis.

6. **Expiration and activity.** Configurable with safe limits: absolute expiration default 7 days (range 1h–30d); inactivity timeout default 30 min (range 5min–24h); `lastUsedAt` write throttle default 5 min (range 1–60 min). Inactivity is verified on every authenticated request; `lastUsedAt` is updated atomically only when the throttle interval has elapsed (avoids a DB write per request). Absolute expiration is never extended; revoked/expired sessions are never reactivated; a session whose `createdAt` is before the user's `passwordChangedAt` is invalid. All timestamps are UTC, and the clock is centralized and injectable for tests.

7. **Data model (final).**
   - `User`: `id` (cuid), `email` (unique, normalized lowercase), `passwordHash`, `role` (`ADMIN`), `status` (`ACTIVE`/`INACTIVE`), `passwordChangedAt`, `createdAt`, `updatedAt`.
   - `Session`: `id` (cuid), `userId` (FK), `tokenHash` (unique), `csrfTokenHash` (unique), `expiresAt`, `lastUsedAt`, `revokedAt`, `createdAt`.
   - Enums are minimal (`ADMIN`, `ACTIVE`/`INACTIVE`) — no fictional roles. Unique indexes on `email`, `tokenHash`, `csrfTokenHash`. No physical user deletion in this change; user deactivation revokes/prevents sessions (FK cascade only for sessions when a user is logically removed, never a hard delete of users). The "revoke previous sessions + create new" operation runs in a transaction.

8. **Password hashing — Argon2id via `argon2` (node-argon2).** Parameters (OWASP baseline, configurable): memory 19456 KiB, time 2, parallelism 1. Rehash transparently on next successful login when stored params differ. Password policy length-based: min 12, max 128 bytes (bounded before hashing to prevent DoS); common-password rejection only if a maintained, offline-safe solution is adopted (deferred). Passwords are never normalized silently, never logged, hashes never returned. **Timing anti-enumeration:** every syntactically valid login attempt performs exactly one Argon2id verification. Unknown e-mails and INACTIVE users verify against an in-memory dummy Argon2id hash generated at boot with the current parameters from a CSPRNG input (never stored, never logged, per-instance). A malformed stored hash is treated as an invalid credential: it falls back to a dummy verification (timing uniform) and rejects with the uniform 401, never leaking the cause. No artificial sleep, no manual comparison, and the response remains identical across all failure conditions.

9. **Isolated test database (concrete).** A dedicated `postgres-test` service in the Docker Compose file, on its own loopback host port `127.0.0.1:5434` (distinct from 5433), separate database/user, and a `tmpfs` volume (test data need not persist). `DATABASE_URL_TEST` is separate; tests refuse to run unless the configured URL matches the expected test database (name/port guard), and cleanup targets only the test database — `prisma migrate reset` is never run against the development database. No SQLite, no Testcontainers (unnecessary here), no public port, no versioned secrets. Commands:
   - Start test DB: `docker compose -f infrastructure/docker-compose.dev.yml up -d postgres-test`
   - Apply migration: `DATABASE_URL_TEST=postgresql://…@127.0.0.1:5434/leads_test pnpm --filter @leads/api exec prisma migrate deploy`
   - Run tests: `DATABASE_URL_TEST=… pnpm --filter @leads/api test` (guard refuses non-test URLs)
   - Clean test data: truncate only test tables (script guarded to the test DB)
   - Stop only the test service: `docker compose -f infrastructure/docker-compose.dev.yml down postgres-test`

10. **Prisma.** Exact versions are pinned after consulting the official docs at implementation time, ensuring Node 24 and PostgreSQL 17 compatibility and the current client-generation strategy (`prisma generate`). Schema location is explicit (`apps/api/prisma/schema.prisma`); migrations are versioned and non-destructive; Prisma Studio is not exposed; Prisma errors are never returned to clients (mapped to the generic 500 envelope); the Prisma client is closed on shutdown. **Boot/DB availability decision:** `DATABASE_URL` is required — missing/invalid blocks boot without printing its value (fail-fast, consistent with ADR-0003 and the shell). At startup the app connects and verifies the DB; if unreachable, it fails to start. **After boot**, a transient DB outage does not crash the process: authenticated operations return a generic 500 while `GET /health` (which never touches the DB) stays responsive. This combines fail-fast at boot (catches misconfiguration immediately) with graceful runtime degradation.

11. **Admin bootstrap command (secure input).** An interactive CLI script (`bootstrap-admin`) requiring a TTY: reads the password with echo disabled (`readline` with muted output), asks for confirmation, validates the policy, runs in a transaction with uniqueness, and fails (409) if an admin already exists without altering data. The password is not accepted via CLI argument or a common env var; in a non-interactive environment the command fails safely. Ctrl+C clears password buffers and closes the DB connection. The command never prints the password, hash, or e-mail. A separate administrative change/recovery command is a future option, not implemented now.

12. **Authorization:** `AuthGuard` reads the session cookie, looks up the hashed token, validates expiration/inactivity/revocation and the user's `ACTIVE` status, and attaches a typed `CurrentUser`. Role `ADMIN` is the only role in MVP. Deny by default: missing/invalid session → 401; valid session without permission → 403. `GET /health` stays public; identity never comes from client-supplied fields.

13. **Rate limiting:** authentication endpoints (`login`, `change-password`) get a stricter `@Throttle` than the global default with a distinct name; 429 uses the existing envelope.

14. **Error contract:** reuse the existing envelope; add controlled codes for 401 (`UNAUTHORIZED`), 403 (`FORBIDDEN`), 409 (`CONFLICT`). Never return Prisma errors, table/SQL names, hashes, tokens, cookies, or user existence.

15. **Session-uniqueness concurrency guarantee.** Two concurrent logins in `READ COMMITTED` could each revoke the existing sessions, both observe no active session, and both insert a new session. The concrete mechanism: a **partial unique index** created explicitly in the migration SQL —

   ```sql
   CREATE UNIQUE INDEX "Session_single_active_user"
     ON "Session" ("userId")
     WHERE "revokedAt" IS NULL;
   ```

   Prisma Schema does not represent partial indexes, so the custom SQL is preserved in the versioned migration (documented); the Prisma model carries only the plain fields and the runtime relies on the SQL index. The login flow runs in a single transaction: (a) `UPDATE Session SET revokedAt = now() WHERE userId = $1 AND revokedAt IS NULL` — revokes every non-revoked session, **including expired-but-not-revoked ones** (required, because the partial index counts them as active and would otherwise block a new row); (b) `INSERT` the new session (new session token + new CSRF token). The index alone is **not sufficient** with the expired-session policy — the revoke-first step clears expired rows; the index then enforces the pure-insert race.

   **Conflict handling (explicit decision):** when the INSERT violates the partial unique index (a concurrent transaction already committed), the transaction rolls back and retries **at most once** (bounded, safe), re-running revoke+create so a legitimate simultaneous login is not randomly rejected; if the retry still conflicts, the response is a **generic 409** — never a Prisma error, index name, table, or SQL. The "last login wins" semantic is intentional: the surviving transaction's revoke invalidates the earlier cookie, leaving exactly one active session. Password-change rotation uses the same transactional revoke+create path, so the same guarantee holds; a concurrent authenticated request that read the session before the commit may complete in the tiny window, after which it is invalid.

   This resolves the scenario where both transactions observe "no active session": the partial unique index serializes the insert, and the retry (max 1) lets the losing login take over safely.

## Risks / Trade-offs

- Cookie-based auth requires CORS `credentials: true` → kept strictly to exact origins; wildcard remains impossible in production.
- DB-backed sessions add a DB dependency to every authenticated request → mitigated by the unique `tokenHash` index and single lookup; outage → generic 500.
- Single-session policy means logging in elsewhere ends the previous session → explicit decision for the private MVP.
- `argon2` has native bindings → pinned version with prebuilt binaries; add to `allowBuilds` with justification only if pnpm flags its build.
- SameSite=Strict requires same-site frontend/API → documented; CSRF token remains the real defense.
- Tests now require the test PostgreSQL service → documented commands; no SQLite divergence; the dev DB is never reset.

## Migration Plan

Greenfield for auth data. Add Prisma, create the initial non-destructive migration, make `DATABASE_URL` required, add the `postgres-test` service and test commands, and document `bootstrap-admin`. Rollback = stop serving authenticated routes; the migration only adds tables.

## Open Questions

- None that change the specs, the approach, or the task breakdown. (Exact Prisma/argon2 versions and precise Argon2id defaults are pinned at implementation time after consulting official docs.)
