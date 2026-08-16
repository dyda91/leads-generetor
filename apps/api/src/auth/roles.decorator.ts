import { SetMetadata } from '@nestjs/common';

export const ROLES_METADATA = 'auth:requiredRoles';

/**
 * Declares the roles allowed to access a route. The AuthGuard defaults to
 * `['ADMIN']` when no metadata is present; an explicit value is used by tests
 * and future routes to prove the 403 path without inventing domain roles.
 */
export const RequireRoles = (...roles: readonly string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_METADATA, roles);
