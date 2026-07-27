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
          typeof resp.code === 'string'
            ? resp.code
            : typeof resp.error === 'string'
              ? resp.error
              : this.httpStatusToErrorCode(status);
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

    const isProduction = process.env.NODE_ENV === 'production';

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

    if (!isProduction && !(exception instanceof HttpException)) {
      if (exception instanceof Error) {
        errorResponse.stack = exception.stack;
      }
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
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
      503: 'SERVICE_UNAVAILABLE',
    };
    return map[status] || 'ERROR';
  }
}
