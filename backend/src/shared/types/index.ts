export interface ApiResponse<T> {
  statusCode: number;
  message: string;
  data: T;
  meta?: PaginationMeta;
  timestamp: string;
  path: string;
}

export interface PaginationMeta {
  total: number;
  skip: number;
  take: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
  iat?: number;
  exp?: number;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface RequestContext {
  userId: string;
  email: string;
  roles: string[];
  ip?: string;
  userAgent?: string;
}

export interface PaginatedQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  filters?: Record<string, unknown>;
}

export interface BulkOperationResult {
  success: number;
  failed: number;
  errors: string[];
}

export interface FileUpload {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  template?: string;
  context?: Record<string, unknown>;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export interface NotificationOptions {
  userId: string;
  title: string;
  message: string;
  type: 'EMAIL' | 'SMS' | 'PUSH' | 'IN_APP';
  data?: Record<string, unknown>;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface CacheOptions {
  ttl?: number;
  key?: string;
}

export interface LogContext {
  userId?: string;
  requestId?: string;
  action?: string;
  resource?: string;
  resourceId?: string;
  ip?: string;
  userAgent?: string;
}
