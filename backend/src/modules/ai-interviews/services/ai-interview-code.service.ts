import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

const ALLOWED_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const GROUP_SIZE = 4;

@Injectable()
export class AiInterviewCodeService {
  generate(): string {
    const chars: string[] = [];
    const bytes = crypto.randomBytes(CODE_LENGTH);
    for (let i = 0; i < CODE_LENGTH; i++) {
      chars.push(ALLOWED_CHARS[bytes[i] % ALLOWED_CHARS.length]);
    }
    const first = chars.slice(0, GROUP_SIZE).join('');
    const second = chars.slice(GROUP_SIZE).join('');
    return `${first}-${second}`;
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

  format(code: string): string {
    const normalized = this.normalize(code);
    if (normalized.length !== CODE_LENGTH) return code;
    return `${normalized.slice(0, GROUP_SIZE)}-${normalized.slice(GROUP_SIZE)}`;
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
