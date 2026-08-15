import { z } from 'zod';

import type { Environment, EnvironmentIssue } from './environment.types';

export const nodeEnvValues = ['development', 'test', 'production'] as const;

const nonEmptyString = z.string('required').trim().min(1, { message: 'required' });

const nodeEnvSchema = nonEmptyString.pipe(z.enum(nodeEnvValues, { message: 'invalid' }));

const portSchema = nonEmptyString
  .transform((value) => Number(value))
  .pipe(z.number('invalid').int('invalid').min(1, 'out_of_range').max(65535, 'out_of_range'));

const emptyStringToUndefined = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional(),
);

const corsOriginsSchema = emptyStringToUndefined.transform((value) =>
  value === undefined
    ? []
    : value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
);

export const environmentSchema = z
  .object({
    NODE_ENV: nodeEnvSchema,
    PORT: portSchema,
    CORS_ORIGINS: corsOriginsSchema,
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === 'production' && environment.CORS_ORIGINS.includes('*')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGINS'],
        message: 'wildcard_forbidden_in_production',
      });
    }
  });

const controlledCodes = new Set([
  'required',
  'invalid',
  'out_of_range',
  'wildcard_forbidden_in_production',
]);

const guidanceByCode: Readonly<Record<string, string>> = {
  required: 'This variable is required and was not provided.',
  invalid: 'The provided value is not valid for this variable.',
  out_of_range: 'The value must be an integer between 1 and 65535.',
  wildcard_forbidden_in_production: 'A wildcard origin is not allowed in production.',
};

const genericGuidance = 'The provided value is not valid for this variable.';

function resolveCode(issue: z.ZodIssue): string {
  if (controlledCodes.has(issue.message)) {
    return issue.message;
  }
  if (issue.code === z.ZodIssueCode.invalid_type) {
    return issue.input === undefined ? 'required' : 'invalid';
  }
  return 'invalid';
}

export function describeEnvironmentIssues(error: z.ZodError): EnvironmentIssue[] {
  return error.issues.map((issue) => {
    const field = issue.path.map(String).join('.') || 'environment';
    const code = resolveCode(issue);
    return { field, code, message: guidanceByCode[code] ?? genericGuidance };
  });
}

export class EnvironmentValidationError extends Error {
  readonly issues: readonly EnvironmentIssue[];

  constructor(zodError: z.ZodError) {
    const issues = describeEnvironmentIssues(zodError);
    super(
      `Invalid environment configuration: ${issues.map((issue) => `${issue.field} (${issue.code})`).join(', ')}.`,
    );
    this.name = 'EnvironmentValidationError';
    this.issues = issues;
  }
}

export function parseEnvironment(source: Record<string, string | undefined>): Environment {
  const result = environmentSchema.safeParse(source);
  if (!result.success) {
    throw new EnvironmentValidationError(result.error);
  }
  return result.data;
}
