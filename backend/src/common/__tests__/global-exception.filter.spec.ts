import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';
import { Response } from 'express';
import { GlobalExceptionFilter } from '../filters/global-exception.filter';
import { Prisma } from '@prisma/client';
import { RequestWithId } from '../types/request.types';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;

  const mockResponse = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;

  const mockRequest = {
    url: '/api/v1/test',
    method: 'GET',
    requestId: 'test-request-id',
  } as unknown as RequestWithId;

  const mockHost = {
    switchToHttp: () => ({
      getResponse: () => mockResponse,
      getRequest: () => mockRequest,
      getNext: () => jest.fn(),
    }),
    getType: () => 'http' as const,
    getArgs: () => [],
    getArgByIndex: () => ({}),
    switchToRpc: () => {
      throw new Error('not implemented');
    },
    switchToWs: () => {
      throw new Error('not implemented');
    },
  } as unknown as ArgumentsHost;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    jest.clearAllMocks();
  });

  it('should handle HttpException correctly', () => {
    const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: 'Not found',
        requestId: 'test-request-id',
      }),
    );
  });

  it('should handle unknown errors as 500', () => {
    const exception = new Error('Something broke');

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        errorCode: 'INTERNAL_SERVER_ERROR',
        requestId: 'test-request-id',
      }),
    );
  });

  it('should handle Prisma P2002 as CONFLICT', () => {
    const exception = new Prisma.PrismaClientKnownRequestError('Unique violation', {
      code: 'P2002',
      clientVersion: '5.0.0',
      meta: { target: ['email'] },
    });

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(409);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        errorCode: 'CONFLICT',
        message: expect.stringContaining('email'),
      }),
    );
  });

  it('should handle Prisma P2025 as NOT_FOUND', () => {
    const exception = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '5.0.0',
      meta: { cause: 'Not found' },
    });

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        errorCode: 'NOT_FOUND',
      }),
    );
  });

  it('should include requestId in response', () => {
    const exception = new HttpException('Bad', HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockHost);

    const responseCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
    expect(responseCall.requestId).toBe('test-request-id');
    expect(responseCall.timestamp).toBeDefined();
    expect(responseCall.path).toBe('/api/v1/test');
  });

  // ── Error contract precedence tests ──────────────────────────

  it('code field takes precedence over errorCode', () => {
    const exception = new HttpException(
      { code: 'SPECIFIC_ERROR', errorCode: 'FALLBACK', message: 'Custom' },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, mockHost);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'SPECIFIC_ERROR' }),
    );
  });

  it('errorCode fallback when code is absent', () => {
    const exception = new HttpException(
      { errorCode: 'FALLBACK_CODE', message: 'Fallback' },
      HttpStatus.FORBIDDEN,
    );
    filter.catch(exception, mockHost);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'FALLBACK_CODE' }),
    );
  });

  it('ForbiddenException serializes FORBIDDEN', () => {
    const { ForbiddenException } = jest.requireActual('@nestjs/common');
    const exception = new ForbiddenException('Access denied');
    filter.catch(exception, mockHost);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, errorCode: 'FORBIDDEN' }),
    );
  });

  it('ConflictException serializes CONFLICT', () => {
    const { ConflictException } = jest.requireActual('@nestjs/common');
    const exception = new ConflictException('Duplicate');
    filter.catch(exception, mockHost);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, errorCode: 'CONFLICT' }),
    );
  });

  it('ServiceUnavailableException serializes SERVICE_UNAVAILABLE', () => {
    const { ServiceUnavailableException } = jest.requireActual('@nestjs/common');
    const exception = new ServiceUnavailableException('Down');
    filter.catch(exception, mockHost);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 503, errorCode: 'SERVICE_UNAVAILABLE' }),
    );
  });

  it('RESUME_EXTRACTION_FAILED is preserved from ConflictException', () => {
    const { ConflictException } = jest.requireActual('@nestjs/common');
    const exception = new ConflictException({
      code: 'RESUME_EXTRACTION_FAILED',
      message: 'Extraction failed',
    });
    filter.catch(exception, mockHost);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'RESUME_EXTRACTION_FAILED' }),
    );
  });

  it('unknown HTTP status gets canonical map value', () => {
    const exception = new HttpException('Custom', 416 as HttpStatus);
    filter.catch(exception, mockHost);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 416, errorCode: 'ERROR' }),
    );
  });

  it('plain string response uses httpStatusToErrorCode', () => {
    const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    filter.catch(exception, mockHost);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'FORBIDDEN' }),
    );
  });

  it('nested Nest response with message array uses first element', () => {
    const exception = new HttpException(
      {
        statusCode: 400,
        message: ['email is invalid', 'name is required'],
        error: 'Bad Request',
      },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, mockHost);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'email is invalid, name is required' }),
    );
  });

  it('INTERNAL_SERVER_ERROR fallback for unhandled errors', () => {
    const exception = new Error('Something broke');
    filter.catch(exception, mockHost);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'INTERNAL_SERVER_ERROR' }),
    );
  });

  it('response.error is never used as machine code', () => {
    const exception = new HttpException(
      { message: 'Error', error: 'NOT_A_CODE' },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, mockHost);
    const call = (mockResponse.json as jest.Mock).mock.calls[0][0];
    expect(call.errorCode).not.toBe('NOT_A_CODE');
  });

  it('code in HttpException response takes precedence over status mapping', () => {
    const exception = new HttpException(
      { code: 'MY_DOMAIN_CODE', message: 'Domain error' },
      HttpStatus.CONFLICT,
    );
    filter.catch(exception, mockHost);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'MY_DOMAIN_CODE', statusCode: 409 }),
    );
  });
});
