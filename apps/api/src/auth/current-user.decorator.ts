import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

import type { SafePrincipal } from './session/session.types';
import type { AuthenticatedRequest } from './auth.types';

/**
 * Returns the authenticated principal attached by the AuthGuard. Throws 401
 * (via the guard) when the route is not protected; never trusts client input.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SafePrincipal => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user === undefined) {
      throw new Error('CurrentUser requires the AuthGuard on the route.');
    }
    return request.user;
  },
);
