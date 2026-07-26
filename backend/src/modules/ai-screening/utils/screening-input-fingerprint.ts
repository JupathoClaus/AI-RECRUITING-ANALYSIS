import * as crypto from 'crypto';
import { ScreeningInput } from '../domain/screening-input.type';

export interface FingerprintContext {
  applicationId: string;
  input: ScreeningInput;
  jobUpdatedAt?: string;
  resumeChecksumSha256?: string;
  resumeUpdatedAt?: string;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
}

function canonicalStringify(data: Record<string, unknown>): string {
  const keys = Object.keys(data).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const value = data[key];
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      const items = value.map((v) =>
        typeof v === 'object' && v !== null
          ? canonicalStringify(v as Record<string, unknown>)
          : JSON.stringify(v),
      );
      parts.push(`${JSON.stringify(key)}:[${items.join(',')}]`);
    } else if (typeof value === 'object' && value !== null) {
      parts.push(`${JSON.stringify(key)}:${canonicalStringify(value as Record<string, unknown>)}`);
    } else {
      parts.push(`${JSON.stringify(key)}:${JSON.stringify(value)}`);
    }
  }
  return `{${parts.join(',')}}`;
}

export function computeScreeningFingerprint(ctx: FingerprintContext): string {
  const inputCanonical = canonicalStringify(ctx.input as unknown as Record<string, unknown>);

  const payload = {
    applicationId: ctx.applicationId,
    input: inputCanonical,
    jobUpdatedAt: ctx.jobUpdatedAt ?? '',
    resumeChecksumSha256: ctx.resumeChecksumSha256 ?? '',
    resumeUpdatedAt: ctx.resumeUpdatedAt ?? '',
    provider: ctx.provider,
    model: ctx.model,
    promptVersion: ctx.promptVersion,
    schemaVersion: ctx.schemaVersion,
  };

  const canonical = canonicalStringify(payload);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}
