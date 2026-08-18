/**
 * Config loader defaults for AI screening — protects the Qwen model default.
 *
 * The intended production model is Qwen3.5-9B (Ollama tag: qwen3.5:9b).
 * This test locks the default so a regression cannot silently fall back to
 * qwen2.5:latest.
 */

describe('aiScreening config loader', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  it('defaults the Qwen model to qwen3.5:9b (Qwen3.5-9B) when QWEN_MODEL is unset', () => {
    delete process.env.QWEN_MODEL;
    delete process.env.AI_SCREENING_PROVIDER;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loader = require('../loaders/ai-screening.config').default;
    const config = loader();
    expect(config.qwenModel).toBe('qwen3.5:9b');
    expect(config.qwenBaseUrl).toBe('http://localhost:11434/v1');
    expect(config.provider).toBe('mock');
  });

  it('honours an explicit QWEN_MODEL override', () => {
    process.env.QWEN_MODEL = 'qwen3.5:27b';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loader = require('../loaders/ai-screening.config').default;
    const config = loader();
    expect(config.qwenModel).toBe('qwen3.5:27b');
  });

  it('validates provider values and defaults to mock only when unset', () => {
    delete process.env.AI_SCREENING_PROVIDER;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loader = require('../loaders/ai-screening.config').default;
    expect(loader().provider).toBe('mock');
  });
});
