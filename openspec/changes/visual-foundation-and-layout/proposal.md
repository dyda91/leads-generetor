# Proposal: visual-foundation-and-layout

## Why

The backend already provides secure single-admin authentication (login, opaque session via cookie, CSRF, me, logout, change-password). There is no frontend yet: the product has no usable, professional interface to log in, restore the session, navigate and change the account password. This change delivers the React/Vite application shell that turns the API into an operable tool, without yet adding any business feature (leads, search, lists).

## What Changes

- Scaffold the `apps/web` React + TypeScript (strict) + Vite workspace with the required scripts (`dev`, `build`, `lint`, `typecheck`, `test`) and shared configs (`@leads/typescript-config`, `@leads/eslint-config`).
- Add a visual design system (design tokens, base components) using Tailwind CSS + shadcn/ui primitives and Lucide icons: professional, responsive, light theme, deep blue primary, green/turquoise accents, neutral backgrounds, moderate borders/shadows, readable type, widescreen-safe layout.
- Add a centralized API client (`VITE_API_BASE_URL`, `credentials: include`, CSRF header only on protected mutations, AbortController timeout, defensive parsing).
- Add an in-memory authentication/session store (never localStorage/sessionStorage; session cookie HttpOnly untouched by JS; CSRF kept in memory only).
- Add session restoration on load via `GET /auth/me` with single-flight, stable loading, 401 → `/login`, 500 → recoverable error with controlled retry, concurrent 409 handled with at most one retry.
- Add routes: `/login`, `/` (protected dashboard shell), `/settings/security` (protected password change), and a frontend 404; public/protected route guards with internal-destination validation (no open redirect).
- Add a responsive app layout: desktop sidebar (logo, Dashboard, future items clearly "em breve", Settings, logout, minimal admin identity), mobile header with accessible drawer (focus control, Escape, scroll lock, keyboard navigation).
- Add an empty-state dashboard (greeting, system status, "no search yet", future CTA disabled, "Next steps", no invented numbers).
- Add protected password change and logout flows (CSRF in memory, no duplicate submission, controlled errors, no auto-retry of mutations).
- Add Vitest + Testing Library unit/integration coverage and Playwright E2E against the real API on the isolated test PostgreSQL (admin seeded via a secure helper, never the interactive CLI; never touching 5433).

## Capabilities

### New Capabilities

- `visual-foundation-and-layout`: The React application foundation: professional responsive UI, design tokens and base components, centralized API client, in-memory session/auth state with secure CSRF handling, session restoration with single-flight and controlled 409/retry, public/protected routing with open-redirect protection, login, dashboard shell, responsive layout (desktop sidebar + mobile drawer), password change, logout, empty/loading/error states, accessibility, and frontend security rules (no tokens in storage/logs/URLs).

### Modified Capabilities

<!-- None: no spec-level behavior of an existing capability changes. The backend surface stays as archived in authentication-and-authorization; this change only consumes it. -->

## Impact

- **Code:** new `apps/web` (Vite React app); `apps/e2e` tests extended with real-API auth flows; `infrastructure/docker-compose.dev.yml` unchanged (CORS on the API already allows `http://127.0.0.1:5173`; the API binds to 127.0.0.1).
- **API:** consumed, not modified — `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`, `POST /auth/change-password`, `GET /health`. Requires the API to run with `CORS_ORIGINS=http://127.0.0.1:5173`.
- **Dependencies:** React, Vite, Tailwind CSS, shadcn/ui primitives, React Router, TanStack Query (only if justified for server state), Lucide, Vitest, Testing Library, Playwright (already present in `apps/e2e`). No Redux/Zustand unless a proven need appears.
- **Environment:** `VITE_API_BASE_URL` public variable (no secrets); no `.env` with real values.
- **Out of scope:** Google Places, search, leads, lists, export, charts, signup, password recovery, user management, MFA, complex dark mode, PWA, deploy, analytics.
