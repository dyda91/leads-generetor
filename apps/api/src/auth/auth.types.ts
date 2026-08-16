import type { Request } from 'express';

import type { SafePrincipal } from './session/session.types';

/** Safe user surface exposed to clients — never hashes or raw models. */
export interface AuthUser {
  id: string;
  email: string;
  role: 'ADMIN';
  status: 'ACTIVE' | 'INACTIVE';
}

export interface LoginResponse {
  user: AuthUser;
  csrfToken: string;
}

export interface MeResponse {
  user: AuthUser;
  csrfToken: string;
}

export interface AuthenticatedRequest extends Request {
  user?: SafePrincipal;
  /** Internal compare-and-set expected value for CSRF rotation; never exposed. */
  expectedCsrfTokenHash?: string;
}

export function authUserFromPrincipal(principal: SafePrincipal): AuthUser {
  return {
    id: principal.userId,
    email: principal.email,
    role: principal.role,
    status: principal.status,
  };
}
