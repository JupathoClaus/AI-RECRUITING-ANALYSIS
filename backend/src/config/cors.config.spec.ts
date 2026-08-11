import { buildCorsOptions, CORS_ALLOWED_HEADERS } from './cors.config';

describe('CORS configuration', () => {
  it('allows the idempotency header used by browser mutations', () => {
    const options = buildCorsOptions('production', 'https://app.example.test');

    expect(CORS_ALLOWED_HEADERS).toContain('Idempotency-Key');
    expect(options.allowedHeaders).toContain('Idempotency-Key');
    expect(options.methods).toContain('OPTIONS');
    expect(options.credentials).toBe(true);
    expect(options.origin).toEqual(['https://app.example.test']);
  });
});
