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
});
