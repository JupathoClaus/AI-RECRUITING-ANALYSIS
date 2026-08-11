import { Injectable, NestMiddleware } from '@nestjs/common';
import { Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { RequestWithId } from '../types/request.types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Thin adapter: genReqId in LoggerModule is the authoritative ID generator.
 * This middleware copies pino-http's req.id into req.requestId for
 * backward compat, and generates a fallback ID if genReqId hasn't run.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: Response, next: NextFunction) {
    const incoming = req.headers['x-request-id'];
    let requestId: string;

    if (typeof incoming === 'string' && UUID_REGEX.test(incoming)) {
      requestId = incoming;
    } else if (req.id && UUID_REGEX.test(req.id)) {
      requestId = req.id;
    } else {
      requestId = crypto.randomUUID();
    }

    req.requestId = requestId;
    req.id = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  }
}
