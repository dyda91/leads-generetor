import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

import type { ErrorDetail } from './error-response';

const CONSTRAINT_TYPES: Readonly<Record<string, string>> = {
  whitelistValidation: 'unknown_property',
  unknownValue: 'invalid_type',
  isDefined: 'required',
  isNotEmpty: 'required',
  isString: 'invalid_type',
  isNumber: 'invalid_type',
  isInt: 'invalid_type',
  isBoolean: 'invalid_type',
  isDate: 'invalid_type',
  isEnum: 'invalid_type',
  isEmail: 'invalid_format',
  isUUID: 'invalid_format',
  isUrl: 'invalid_format',
  isMobilePhone: 'invalid_format',
};

function constraintType(constraint: string): string {
  return CONSTRAINT_TYPES[constraint] ?? 'invalid';
}

function flattenValidationErrors(errors: readonly ValidationError[], path = ''): ErrorDetail[] {
  const details: ErrorDetail[] = [];
  for (const error of errors) {
    const field = path === '' ? error.property : `${path}.${error.property}`;
    if (error.constraints !== undefined) {
      for (const constraint of Object.keys(error.constraints)) {
        details.push({ field, type: constraintType(constraint) });
      }
    } else if (error.children !== undefined && error.children.length > 0) {
      details.push(...flattenValidationErrors(error.children, field));
    }
  }
  return details;
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    stopAtFirstError: false,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: (errors) => {
      return new BadRequestException({
        error: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: flattenValidationErrors(errors),
      });
    },
  });
}
