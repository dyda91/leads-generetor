## Why

The system is private and has a single administrator in the MVP, but today no user, session, or credential exists — the API shell (`security-foundation`) has no authentication. Private authentication and authorization for that administrator are required before any business resources (leads, lists) exist, so ownership and access control are in place from the start.

## What Changes

- Introduce PostgreSQL persistence via Prisma with the minimal schema for authentication: `User` and `Session`.
- Add a secure, interactive command to bootstrap the first administrator (no default credentials, no seed with fixed credentials, TTY-only, no password via CLI argument or env var).
- Hash passwords with Argon2id (configurable memory/time/parallelism), length-based password policy, and rehash on parameter change.
- Implement a single opaque server-side session per user: cryptographically random token sent only in an `HttpOnly` cookie (per-environment attributes); the database stores only hashes of the session token and the CSRF token; absolute and inactivity expiration with throttled activity updates; rotation; immediate revocation on logout and password change.
- Add a complete CSRF synchronizer-token flow: token returned in the login and `me` bodies, sent via `X-CSRF-Token` on protected mutations, rotated on login/session rotation/password change.
- Add the authentication endpoints: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password`. No public signup, no email, no OAuth, no MFA in this phase.
- Add an `AuthGuard` with a typed `CurrentUser`, role `ADMIN`, status `ACTIVE`, and deny-by-default for private routes; `GET /health` stays public.
- Revise CORS to allow `credentials: true` and the `X-CSRF-Token` header only for exact authorized origins (never wildcard) and document the server-to-server (no-Origin) decision.
- Add stricter-than-global rate limiting on authentication endpoints.
- Add an isolated test PostgreSQL service (own loopback port, `tmpfs`, `DATABASE_URL_TEST`) so tests never touch the development database.
- Reuse the existing error envelope with 400/401/403/409/429/500; never leak stacks, Prisma errors, hashes, tokens, or user existence.

## Capabilities

### New Capabilities

- `authentication-and-authorization`: private administrator authentication and authorization — first-admin bootstrap, Argon2id password hashing, opaque server-side sessions in cookies, login/logout/me/change-password, AuthGuard with role/status authorization, CSRF protection, credentialed CORS for exact origins, and safe authentication error responses.

### Modified Capabilities

- `security-foundation`: the CORS requirement currently forbids `credentials` ("Credentials não habilitada sem necessidade"); this change modifies that behavior to allow `credentials: true` for exact authorized origins when a need (cookie authentication) exists, and adds 401/403/409 to the error envelope contract.

## Impact

- `apps/api`: new runtime deps (Prisma ORM, `@prisma/client`, `argon2`) and schema/migrations; `DATABASE_URL` becomes required at runtime; new env vars for sessions, cookies, CSRF, and the auth rate limit.
- CORS configuration changes from `credentials: false` to credentialed only for exact authorized origins.
- Development now uses the local PostgreSQL (`127.0.0.1:5433`); tests require an isolated test database on PostgreSQL (no SQLite).
- Adds `prisma` CLI commands and a `bootstrap-admin` script; Prisma Studio is not exposed.
- Future changes (`leads`, lists) will read the authenticated user from the request context instead of trusting client-provided identity.
