import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

const ALLOWED_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const GROUP_SIZE = 4;

/**
 * Human-readable candidate assessment codes (`XXXX-XXXX`, unambiguous
 * charset, sha256-hashed at rest). Intentionally a separate implementation
 * from the AI-interview code service so the assessment domain stays
 * decoupled; the algorithm contract is identical.
 */
@Injectable()
export class AssessmentCodeService {
  generate(): string {
    const chars: string[] = [];
    const bytes = crypto.randomBytes(CODE_LENGTH);
    for (let i = 0; i < CODE_LENGTH; i++) {
      chars.push(ALLOWED_CHARS[bytes[i] % ALLOWED_CHARS.length]);
    }
    return `${chars.slice(0, GROUP_SIZE).join('')}-${chars.slice(GROUP_SIZE).join('')}`;
  }

  hash(code: string): string {
    return crypto.createHash('sha256').update(this.normalize(code)).digest('hex');
  }

  normalize(code: string): string {
    return code
      .toUpperCase()
      .replace(/[\s-]/g, '')
      .replace(/O/g, '')
      .replace(/0/g, '')
      .replace(/I/g, '')
      .replace(/1/g, '');
  }

  validate(raw: string): boolean {
    const normalized = this.normalize(raw);
    if (normalized.length !== CODE_LENGTH) return false;
    for (const ch of normalized) {
      if (!ALLOWED_CHARS.includes(ch)) return false;
    }
    return true;
  }

  displayHint(raw: string): string {
    const normalized = this.normalize(raw);
    if (normalized.length !== CODE_LENGTH) return raw;
    return `****-${normalized.slice(-4)}`;
  }
}
