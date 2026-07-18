import { RequestIdMiddleware } from '../middleware/request-id.middleware';
import { RequestWithId } from '../types/request.types';
import { Response } from 'express';

describe('RequestIdMiddleware', () => {
  let middleware: RequestIdMiddleware;

  beforeEach(() => {
    middleware = new RequestIdMiddleware();
  });

  it('should copy req.id to req.requestId', () => {
    const id = '12345678-1234-1234-1234-123456789abc';
    const req = { id, headers: {}, requestId: undefined } as unknown as RequestWithId;
    const res = { setHeader: jest.fn() } as unknown as Response;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.requestId).toBe(id);
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', id);
    expect(next).toHaveBeenCalled();
  });

  it('should generate uuid when req.id and x-request-id are both missing', () => {
    const req = { id: undefined, headers: {} } as unknown as RequestWithId;
    const res = { setHeader: jest.fn() } as unknown as Response;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', req.requestId);
    expect(next).toHaveBeenCalled();
  });
});
