import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_LOCAL = 'requestId';

export interface RequestLocals {
  requestId: string;
}

export function requestIdMiddleware(_req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  res.setHeader(REQUEST_ID_HEADER, requestId);
  res.locals[REQUEST_ID_LOCAL] = requestId;
  next();
}

export function getRequestId(res: Response): string | undefined {
  const requestId = (res.locals as Partial<RequestLocals>).requestId;
  return typeof requestId === 'string' ? requestId : undefined;
}
