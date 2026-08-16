# security-foundation

Create the minimal executable NestJS backend foundation with runtime security controls: fail-fast environment validation, minimal public health check, secure HTTP headers (Helmet with restrictive CSP, HSTS only in production, no X-Powered-By), explicit CORS allowlist, JSON/URL-encoded body size limits, global ValidationPipe, centralized error handling, rate limiting, server-generated request ID correlation, and graceful shutdown.

Spec summary: 9 requirements, 43 scenarios.
