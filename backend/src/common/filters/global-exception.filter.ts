import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { RequestWithId } from '../types/request.types';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();
    const requestId = request.requestId || request.id || 'unknown';
    const timestamp = new Date().toISOString();
    const path = request.url;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorCode = 'INTERNAL_SERVER_ERROR';
    const details: unknown = undefined;
    let structuredConflicts: unknown[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        errorCode = this.httpStatusToErrorCode(status);
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        message =
          typeof resp.message === 'string'
            ? resp.message
            : Array.isArray(resp.message)
              ? resp.message.join(', ')
              : message;
        errorCode =
          typeof resp.code === 'string' && resp.code.length > 0
            ? resp.code
            : typeof resp.errorCode === 'string' && resp.errorCode.length > 0
              ? resp.errorCode
              : this.httpStatusToErrorCode(status);
        // Structured extra fields (e.g. interview slot conflicts) pass through
        // so clients can render them without parsing free-form messages.
        if (errorCode === 'INTERVIEW_SLOT_CONFLICT' && Array.isArray(resp.conflicts)) {
          structuredConflicts = resp.conflicts.map((conflict) => {
            const item = conflict as Record<string, unknown>;
            return {
              kind: item.kind === 'PARTICIPANT' ? 'PARTICIPANT' : 'CANDIDATE',
              scheduledAt: typeof item.scheduledAt === 'string' ? item.scheduledAt : undefined,
              durationMinutes:
                typeof item.durationMinutes === 'number' ? item.durationMinutes : undefined,
            };
          });
        }
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const prismaResult = this.handlePrismaError(exception);
      status = prismaResult.status;
      message = prismaResult.message;
      errorCode = prismaResult.errorCode;
    } else if (exception instanceof Error) {
      message = 'Internal server error';
      errorCode = 'INTERNAL_SERVER_ERROR';
      this.logger.error(`[${requestId}] Unhandled: ${exception.message}`, exception.stack);
    }

    const errorResponse: Record<string, unknown> = {
      statusCode: status,
      errorCode,
      message,
      timestamp,
      path,
      requestId,
    };

    if (details) {
      errorResponse.details = details;
    }

    if (structuredConflicts) {
      errorResponse.conflicts = structuredConflicts;
    }

    this.logger.warn(
      `[${requestId}] ${request.method} ${request.url} ${status} - ${errorCode}: ${message}`,
    );

    response.status(status).json(errorResponse);
  }

  private handlePrismaError(exception: Prisma.PrismaClientKnownRequestError): {
    status: HttpStatus;
    message: string;
    errorCode: string;
  } {
    switch (exception.code) {
      case 'P2002': {
        const target = (exception.meta?.target as string[]) || ['value'];
        return {
          status: HttpStatus.CONFLICT,
          message: `A record with this ${target.join(', ')} already exists`,
          errorCode: 'CONFLICT',
        };
      }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Record not found',
          errorCode: 'NOT_FOUND',
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Foreign key constraint failed',
          errorCode: 'FOREIGN_KEY_ERROR',
        };
      case 'P2014':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Required relation violation',
          errorCode: 'RELATION_VIOLATION',
        };
      default:
        this.logger.error(`Prisma error: ${exception.code}`);
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Database error',
          errorCode: 'DATABASE_ERROR',
        };
    }
  }

  private httpStatusToErrorCode(status: HttpStatus): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      408: 'REQUEST_TIMEOUT',
      409: 'CONFLICT',
      413: 'PAYLOAD_TOO_LARGE',
      415: 'UNSUPPORTED_MEDIA_TYPE',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
      504: 'GATEWAY_TIMEOUT',
    };
    return map[status] || 'ERROR';
  }
}
