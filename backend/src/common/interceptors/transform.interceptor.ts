import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';

export interface ApiResponse<T> {
  statusCode: number;
  message: string;
  data: T;
  meta?: Record<string, unknown>;
  timestamp: string;
  path: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest<Request>();
    const path = request.url;

    if (path.includes('/health')) {
      return next.handle() as unknown as Observable<ApiResponse<T>>;
    }

    return next.handle().pipe(
      map((data) => {
        if (data && typeof data === 'object' && 'data' in data && 'meta' in data) {
          return {
            statusCode: context.switchToHttp().getResponse().statusCode,
            message: 'Success',
            data: (data as { data: T }).data,
            meta: (data as { meta: Record<string, unknown> }).meta,
            timestamp: new Date().toISOString(),
            path,
          };
        }

        return {
          statusCode: context.switchToHttp().getResponse().statusCode,
          message: 'Success',
          data,
          timestamp: new Date().toISOString(),
          path,
        };
      }),
    );
  }
}
