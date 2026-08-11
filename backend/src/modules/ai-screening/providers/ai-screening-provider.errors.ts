export class AiScreeningProviderError extends Error {
  public readonly safeMessage: string;
  public readonly safeCode: string;
  public readonly retryable: boolean;
  public readonly providerName: string | undefined;

  constructor(opts: {
    message: string;
    safeMessage: string;
    safeCode: string;
    retryable: boolean;
    providerName?: string;
  }) {
    super(opts.message);
    this.name = 'AiScreeningProviderError';
    this.safeMessage = opts.safeMessage;
    this.safeCode = opts.safeCode;
    this.retryable = opts.retryable;
    this.providerName = opts.providerName;
  }
}

export class AiScreeningTimeoutError extends AiScreeningProviderError {
  constructor(providerName?: string) {
    super({
      message: `Screening provider timed out${providerName ? ` (${providerName})` : ''}`,
      safeMessage: 'The screening provider did not respond in time. Please try again.',
      safeCode: 'PROVIDER_TIMEOUT',
      retryable: true,
      providerName,
    });
    this.name = 'AiScreeningTimeoutError';
  }
}

export class AiScreeningAuthenticationError extends AiScreeningProviderError {
  constructor(providerName?: string) {
    super({
      message: `Screening provider authentication failed${providerName ? ` (${providerName})` : ''}`,
      safeMessage: 'Screening provider authentication failed. Contact your administrator.',
      safeCode: 'PROVIDER_AUTH_ERROR',
      retryable: false,
      providerName,
    });
    this.name = 'AiScreeningAuthenticationError';
  }
}

export class AiScreeningRateLimitError extends AiScreeningProviderError {
  constructor(providerName?: string, retryAfterMs?: number) {
    super({
      message: `Screening provider rate limited${providerName ? ` (${providerName})` : ''}`,
      safeMessage: `Screening provider rate limit reached. Please wait${retryAfterMs ? ` ${Math.ceil(retryAfterMs / 1000)} seconds` : ''} before retrying.`,
      safeCode: 'PROVIDER_RATE_LIMIT',
      retryable: true,
      providerName,
    });
    this.name = 'AiScreeningRateLimitError';
  }
}

export class AiScreeningMalformedResponseError extends AiScreeningProviderError {
  constructor(detail?: string, providerName?: string) {
    super({
      message: `Screening provider returned malformed response${detail ? `: ${detail}` : ''}`,
      safeMessage: 'The screening provider returned an unexpected response. Please try again.',
      safeCode: 'PROVIDER_MALFORMED_RESPONSE',
      retryable: false,
      providerName,
    });
    this.name = 'AiScreeningMalformedResponseError';
  }
}

export class AiScreeningRefusalError extends AiScreeningProviderError {
  constructor(providerName?: string) {
    super({
      message: `Screening provider refused to process the request${providerName ? ` (${providerName})` : ''}`,
      safeMessage: 'The screening provider refused to process this request. Human review required.',
      safeCode: 'PROVIDER_REFUSAL',
      retryable: false,
      providerName,
    });
    this.name = 'AiScreeningRefusalError';
  }
}
