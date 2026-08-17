# Proposal: places-search

## Why

The product's first real business capability is searching companies by text ("oficinas mecânicas em Campinas SP"). Google Places Text Search (New) is the data source, accessed **exclusively by the backend** (ADR-0002), with strict cost control, a secure internal API and an accessible frontend — without yet persisting leads.

## What Changes

- **Backend — provider Google (`places-search` adapter):** `PlacesProvider` interface + `GooglePlacesProvider` over Node `fetch`, fixed upstream `https://places.googleapis.com/v1/places:searchText`, `X-Goog-Api-Key` only in the header, fixed minimal `X-Goog-FieldMask`, short timeout, redirects rejected, runtime response validation, response size limit, no raw upstream body/`exception.message` in logs/errors, no auto-retry.
- **Backend — internal API:** `POST /places/search` (authenticated, CSRF + exact Origin) returning a sanitized contract of its own (requestId, controlled status/enum, sanitized results) — never raw Google JSON, key, pageToken or quota details.
- **Backend — validation:** strict `textQuery` contract (required, min/max, no control characters, no unknown properties); `languageCode=pt-BR` and `regionCode=BR` fixed server-side; `pageSize` fixed at 10 (backend-only, no pagination and no auto-loading); no arbitrary parameters passed to Google.
- **Backend — cost/abuse control:** per-user + global rate limits, per-instance daily/monthly budget (configurable), fail-closed when exhausted, concurrent-identical-request dedup, explicit submit only (no auto-search, debounce is not a cost control), no auto-retry.
- **Backend — configuration:** `GOOGLE_PLACES_API_KEY` (empty placeholder in `.env.example`), integration enable flag, timeouts, search/budget/rate-limit limits, configurable Enterprise contact fields (`nationalPhoneNumber`, `websiteUri`, `rating`, `userRatingCount`) **OFF by default in development/test/production** with explicit confirmation required in production — fail-fast, errors never print values; production rejects insecure/placeholder values.
- **Frontend:** protected search route with explicit input + button, loading/error/empty/results states, accessibility, no auto-search, no duplicate submit, cancel on unmount, no Google key, no local storage, Google Maps links opened with `rel="noopener noreferrer"`.
- **Tests:** unit (schema, adaptor mocked, field mask exact, key absent, timeout/abort/redirect/invalid JSON/oversize, errors, rate limit, budget, dedup, malicious query, sanitized logs), frontend (no key/storage), E2E with an injected **fake provider** (never real Google, zero external calls, zero API credits).
- **Documentation:** run/local setup, Cloud Console key restrictions (API restriction to Places API + server application restriction, quotas/alerts), key rotation, cost table (field → SKU), SKU impact for Enterprise fields **without asserting unverified prices**, caching policy, non-goals.

## Capabilities

### New Capabilities

- `places-search`: Functional business search powered by Google Places Text Search (New), exclusively backend-side, with strict query validation, layered cost/abuse controls, a secure authenticated internal endpoint, an accessible single-page search UI (fixed single page of 10 results, no pagination in the MVP), and safe data/caching/privacy handling.

### Modified Capabilities

<!-- None: only consumes the archived authentication/security contracts and the archived visual foundation. -->

## Impact

- **Code:** new backend module (provider, schema, controller/service, budget/rate-limit, config), new frontend route + page + client method, tests (API/web/E2E).
- **API:** consumes only `places:searchText` (New). Internal surface adds `POST /places/search` (protected). No change to auth endpoints, CORS, error envelope or the existing guard.
- **Dependencies:** none new unless justified in design (Node native `fetch`); no new runtime packages for the provider. No migrations.
- **Environment:** `GOOGLE_PLACES_API_KEY` **only in `apps/api`** (never `VITE_*`, bundle, responses, logs or tests); `PLACES_*` limits/budget/timeouts; integration explicitly enabled. `.env.example` keeps only empty placeholders.
- **Cost:** every request maps to a documented SKU via a fixed field mask; no wildcard; no pagination in MVP (fixed 10 results, no auto-loading); explicit budgets; Enterprise fields only when explicitly enabled (cost approved). **No Google API credits consumed by development or CI.**
- **Out of scope:** lead persistence, lists, notes/status, export, pagination (MVP), site scraping, email harvesting, enrichment, messaging, automation, multiple real providers, payments, deploy.
