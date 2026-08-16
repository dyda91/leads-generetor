import { z } from 'zod';

/**
 * Runtime validation for API responses and the error envelope. The frontend
 * never trusts TypeScript casts alone; every recognized response is parsed
 * defensively. Schemas are NOT shared with the backend's class-validator DTOs.
 */
export const authUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1),
  role: z.literal('ADMIN'),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const loginResponseSchema = z.object({
  user: authUserSchema,
  csrfToken: z.string().min(1),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const meResponseSchema = loginResponseSchema;
export type MeResponse = LoginResponse;

export const errorDetailSchema = z.object({
  field: z.string().min(1),
  type: z.string().min(1),
});
export type ErrorDetail = z.infer<typeof errorDetailSchema>;

export const errorEnvelopeSchema = z.object({
  requestId: z.string().min(1).optional(),
  statusCode: z.number().int(),
  error: z.string().min(1),
  message: z.string(),
  details: z.array(errorDetailSchema).optional(),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
