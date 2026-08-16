export class OriginRejectedError extends Error {
  constructor() {
    super('The request origin is not allowed.');
    this.name = 'OriginRejectedError';
  }
}

function normalizeOriginHeader(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    throw new OriginRejectedError();
  }
}

/**
 * Strict Origin validation for authentication endpoints. An exact, allowlisted
 * Origin is required; an absent, `null`, malformed, look-alike or non-allowlisted
 * Origin is rejected (mapped to 403 upstream). A `Referer`, when present, must
 * agree with the Origin — it is never a substitute for a missing Origin. `Host`
 * is never trusted. No prefix/suffix matching is used; normalization goes through
 * URL parsing so `app.example.com.evil.com` is rejected.
 */
export class OriginValidator {
  constructor(private readonly allowedOrigins: ReadonlySet<string>) {}

  validate(originHeader: string | undefined, refererHeader: string | undefined): string {
    if (originHeader === undefined || originHeader.length === 0) {
      throw new OriginRejectedError();
    }
    const origin = normalizeOriginHeader(originHeader);
    if (!this.allowedOrigins.has(origin)) {
      throw new OriginRejectedError();
    }
    if (refererHeader !== undefined && refererHeader.length > 0) {
      const referer = normalizeOriginHeader(refererHeader);
      if (referer !== origin) {
        throw new OriginRejectedError();
      }
    }
    return origin;
  }
}
