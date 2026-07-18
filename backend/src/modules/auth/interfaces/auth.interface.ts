export interface TokenPayload {
  sub: string;
  sid: string;
  type: string;
  role: string;
  cid?: string;
  mid?: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedPrincipal {
  userId: string;
  sessionId: string;
  activeCompanyId?: string;
  membershipId?: string | null;
  role: string;
  permissions: string[];
}
