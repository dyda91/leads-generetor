# Design — visual-foundation-and-layout

## Context

See proposal.md — Why. The backend (`authentication-and-authorization`, archived) exposes `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`, `POST /auth/change-password`, `GET /health`. Session = HttpOnly cookie (`leads_session` in dev/test, `__Host-leads_session` in prod); CSRF is returned in the body of login/me (raw token, in-memory only) and required as `X-CSRF-Token` on protected mutations; `GET /auth/me` rotates the CSRF and returns 409 on a concurrent rotation (compare-and-set). The API requires an exact `Origin` on auth mutations and runs with `CORS_ORIGINS=http://127.0.0.1:5173`. `apps/web` does not exist yet; shared configs (`@leads/typescript-config`, `@leads/eslint-config`) and `apps/e2e` (Playwright) exist. CORS must be exactly `http://127.0.0.1:5173` (never mix `localhost` with `127.0.0.1`).

## Goals / Non-Goals

**Goals:** A secure, professional, responsive React shell integrated with the existing auth contract; in-memory session/CSRF state; session restoration with single-flight and controlled 409/retry; protected routing without open redirect; login, dashboard shell, password change, logout; accessibility; unit/integration + E2E coverage on the isolated test DB.

**Non-Goals (design-level):** Business features (search, leads, lists, export); new backend endpoints; real charts; PWA/deploy/analytics; complex dark mode (deferred); global state library unless a proven need appears during implementation.

## Decisions

1. **Scaffold — Vite + React + TypeScript strict in `apps/web`.** Uses `@leads/typescript-config` (`tsconfig.web.json`, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`) and `@leads/eslint-config` (react). The workspace declares the required scripts (`dev`, `build`, `lint`, `typecheck`, `test`) enforced by `check:workspaces`. Alternative considered: Next.js — rejected (deploy target is a separate SPA; routing is small and covered by React Router). Test runner: **Vitest** (matches ADR-0004; backend stays on Jest).

2. **Styling — Tailwind CSS + shadcn/ui primitives, customized, Lucide icons.** shadcn/ui is a copy-in base (button, input, card, label, dialog/drawer, skeleton, form) not a runtime dependency, so it stays composable with our tokens. Light theme first; dark mode deferred to avoid scope growth. No generated images/assets.

3. **Design tokens (light theme).** Deep blue primary (`#0F2B5B`-family, chosen at implementation for AA), green/turquoise for actions/indicators, neutral grays for backgrounds/borders, plus spacing/radius/shadow scales and explicit hover/focus/disabled/error/success states. Focus ring is always visible. Token values live in a single tokens module (Tailwind theme + CSS variables).

4. **Routing — React Router.** Routes: `/login` (public), `/` (protected dashboard shell), `/settings/security` (protected), `*` (frontend 404). `ProtectedRoute` waits for session resolution (loading state), redirects unauthenticated → `/login` with an internal destination query, and redirects authenticated visits to `/login` → dashboard. Destination is validated (pathname-only, internal); external URLs rejected (no open redirect). 401 on a private route clears state and redirects; 403 and 500 do NOT auto-logout.

5. **Auth/session state — lightweight React context + reducer, in-memory only.** No Redux/Zustand: the state is tiny (user + csrfToken + status) and scoped to one subtree. `localStorage`/`sessionStorage`/`document.cookie` are forbidden for session/CSRF/password (tested). **TanStack Query is optional and only if server-state needs justify it** (e.g., future data fetching); for this change a plain client is sufficient — decision deferred until implementation if it grows.

6. **API client — single module.** `VITE_API_BASE_URL` (public, no credentials), `fetch` with `credentials: include`, controlled `Content-Type`, `X-CSRF-Token` only on protected mutations (never login), timeout via `AbortController`, defensive JSON parsing, and normalized controlled errors (never raw backend messages/stacks; `requestId` may be shown in a controlled technical error). No auto-retry of login/logout/change-password; no silent mutation retries.

7. **Session restoration with single-flight.** A module-level in-flight promise dedupes concurrent bootstrap calls. `GET /auth/me`: 200 → store user+csrf in memory, mark ready; 401 → clear, redirect `/login`; 500 → recoverable error state with a retry button (no auto-logout); 409 (concurrent rotation) → exactly one controlled retry, then surface conflict; only the winning token is kept, the previous is discarded. No `/me` triggered by navigation after ready.

8. **CSRF lifecycle.** Set by login response and by `/me` (restoration); kept only in memory; sent on logout and change-password; replaced by the change-password response; cleared on logout/401. Login never sends CSRF.

9. **Layout — desktop sidebar + mobile drawer.** Desktop: centered sidebar with logo, Dashboard, future items disabled/"em breve", Settings, logout, minimal admin identity; content centered with a max-width container. Mobile: header + accessible drawer (focus trap, Escape close, scroll lock, keyboard nav). No functional links to non-existent resources.

10. **Dashboard shell.** Honest empty states: greeting, system status, "no search yet", disabled future CTA, "Next steps" block, no invented numbers. API health only if useful, no aggressive polling.

11. **Change password + logout.** Protected page (CSRF in memory, local confirmation, policy requirements shown, no normalization/logging, no duplicate submission, inputs cleared). Logout: CSRF required, no auto-retry, success clears memory and redirects; network failure offers local state clear without claiming server revocation; 401 clears state.

12. **Testing.** Unit/integration: Vitest + Testing Library for the API client (credentials/CSRF-only-mutations/timeout/defensive parsing), auth store (single-flight, 409 retry ≤1, no persistence), ProtectedRoute (open-redirect), login (401/403/429/500), layout (desktop/mobile, focus, 404), change-password, logout. E2E (Playwright, `apps/e2e`) against the real API on the isolated `postgres-test` (port 5434): **admin seeded via a secure helper** (bootstrap-admin service in-process, not the interactive CLI), login, reload-preserves-session (cookie), `/me` recovers CSRF, protected route, logout, change-password (old password stops working), expired session, no tokens in storage, no secrets in screenshots/traces. Never touches 5433.

13. **Frontend security.** No `dangerouslySetInnerHTML`, `eval`, or external-HTML interpolation; no `VITE_*` secrets; no auth responses logged; no stacks shown; open-redirect guard; minimal deps; evaluate public source maps; CSP-compatible markup (no inline scripts/styles beyond what Vite injects in dev — production CSP handled at deploy).

## Risks / Trade-offs

- **CSRF in memory only** → lost on full reload; `/me` restores it. Risk: a reload mid-flow loses the token → Mitigation: session restoration always re-fetches CSRF via `/me` before any mutation.
- **Concurrent `/me` 409** → one request wins, loser 409 → Mitigation: single-flight + one controlled retry; never keep a token from a rejected response.
- **Strict TS (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)** → more verbose code → Mitigation: accepted cost for safety; shared config already enforces it.
- **No global state library** → risk if app grows during this change → Mitigation: extract a small provider; revisit TanStack Query only if real server-state complexity appears (documented decision point).
- **E2E on real API** → needs `postgres-test` + API running with `CORS_ORIGINS=http://127.0.0.1:5173` → Mitigation: documented commands; guard prevents 5433/dev-db use; helper seeds admin.
- **Tailwind + shadcn copy-in** → version skew vs upstream → Mitigation: pin exact versions; minimal customization surface.
- **SameSite=Strict cookie** → requires same-site API/frontend (documented in ADR-0006) → Mitigation: dev runs both on 127.0.0.1; CORS exact origin `http://127.0.0.1:5173`.

## Migration Plan

Greenfield frontend: scaffold `apps/web`, add configs/scripts, implement features per tasks. Rollback = stop serving the web app; the backend and its CORS allowlist are untouched by this change (CORS already allows `http://127.0.0.1:5173`). No database or migration changes. E2E uses only the isolated test database.

## Open Questions

- Whether TanStack Query is needed for this change — only if dashboard/server-state patterns grow beyond a plain client; otherwise deferred. This does not change specs or the approach.
- Exact Tailwind/shadcn version set — pinned at implementation time after consulting official docs (consistent with prior changes).
