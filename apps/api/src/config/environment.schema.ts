import { z } from 'zod';

import type { Environment, EnvironmentIssue, NodeEnv } from './environment.types';

export const nodeEnvValues = ['development', 'test', 'production'] as const;

export const DEFAULT_BODY_LIMIT_BYTES = 100_000;
export const MIN_BODY_LIMIT_BYTES = 1_000;
export const MAX_BODY_LIMIT_BYTES = 1_000_000;

const nonEmptyString = z.string('required').trim().min(1, { message: 'required' });

const nodeEnvSchema = nonEmptyString.pipe(z.enum(nodeEnvValues, { message: 'invalid' }));

const portSchema = nonEmptyString
  .transform((value) => Number(value))
  .pipe(z.number('invalid').int('invalid').min(1, 'out_of_range').max(65535, 'out_of_range'));

const emptyStringToUndefined = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional(),
);

const bodyLimitBytesSchema = emptyStringToUndefined
  .transform((value) => (value === undefined ? undefined : Number(value)))
  .pipe(
    z
      .number('invalid')
      .int('invalid')
      .min(MIN_BODY_LIMIT_BYTES, 'out_of_range')
      .max(MAX_BODY_LIMIT_BYTES, 'out_of_range')
      .optional(),
  )
  .transform((value) => value ?? DEFAULT_BODY_LIMIT_BYTES);

const corsOriginsSchema = emptyStringToUndefined.transform((value) => {
  if (value === undefined) {
    return [];
  }
  return value.split(',').map((origin) => origin.trim());
});

function validateCorsEntry(entry: string, nodeEnv: NodeEnv, context: z.RefinementCtx): void {
  const reject = (code: string): void => {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CORS_ORIGINS'],
      message: code,
    });
  };

  if (entry.length === 0) {
    reject('invalid');
    return;
  }
  if (entry.includes('*')) {
    reject(nodeEnv === 'production' ? 'wildcard_forbidden_in_production' : 'invalid');
    return;
  }

  let url: URL;
  try {
    url = new URL(entry);
  } catch {
    reject('invalid');
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    reject('invalid');
    return;
  }
  if (url.username !== '' || url.password !== '') {
    reject('invalid');
    return;
  }
  if (url.search !== '' || url.hash !== '') {
    reject('invalid');
    return;
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    reject('invalid');
    return;
  }
  if (nodeEnv === 'production' && url.protocol !== 'https:') {
    reject('https_required_in_production');
    return;
  }
}

function normalizeCorsOrigins(entries: readonly string[]): string[] {
  const normalized = new Set<string>();
  for (const entry of entries) {
    try {
      normalized.add(new URL(entry).origin);
    } catch {
      // Entries already rejected during validation; unreachable values are skipped.
    }
  }
  return [...normalized];
}

export const environmentSchema = z
  .object({
    NODE_ENV: nodeEnvSchema,
    PORT: portSchema,
    CORS_ORIGINS: corsOriginsSchema,
    BODY_LIMIT_BYTES: bodyLimitBytesSchema,
  })
  .superRefine((environment, context) => {
    for (const entry of environment.CORS_ORIGINS) {
      validateCorsEntry(entry, environment.NODE_ENV, context);
    }
  })
  .transform((environment) => ({
    ...environment,
    CORS_ORIGINS: normalizeCorsOrigins(environment.CORS_ORIGINS),
  }));

const controlledCodes = new Set([
  'required',
  'invalid',
  'out_of_range',
  'wildcard_forbidden_in_production',
  'https_required_in_production',
]);

const guidanceByCode: Readonly<Record<string, string>> = {
  required: 'This variable is required and was not provided.',
  invalid: 'The provided value is not valid for this variable.',
  out_of_range: 'The value is outside the allowed range.',
  wildcard_forbidden_in_production: 'A wildcard origin is not allowed in production.',
  https_required_in_production: 'HTTP origins are not allowed in production.',
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
