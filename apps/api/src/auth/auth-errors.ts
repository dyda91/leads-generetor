import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';

import { ERROR_CATALOG } from '../http/error-response';

function catalogBody(catalogEntry: { error: string; message: string }): {
  error: string;
  message: string;
} {
  return { error: catalogEntry.error, message: catalogEntry.message };
}

export function unauthorizedException(): UnauthorizedException {
  return new UnauthorizedException(catalogBody(ERROR_CATALOG.UNAUTHORIZED));
}

export function forbiddenException(): ForbiddenException {
  return new ForbiddenException(catalogBody(ERROR_CATALOG.FORBIDDEN));
}

export function conflictException(): ConflictException {
  return new ConflictException(catalogBody(ERROR_CATALOG.CONFLICT));
}
