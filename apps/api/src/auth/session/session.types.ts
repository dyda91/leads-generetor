/** The safe principal returned to callers — never hashes, tokens, or raw models. */
export interface SafePrincipal {
  userId: string;
  email: string;
  role: 'ADMIN';
  status: 'ACTIVE' | 'INACTIVE';
  sessionId: string;
}
