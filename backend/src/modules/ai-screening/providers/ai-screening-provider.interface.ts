import { ScreeningInput } from '../domain/screening-input.type';
import { ProviderScreeningResult } from '../domain/screening-result.type';

export interface AiScreeningProviderOptions {
  timeoutMs?: number;
  requestId?: string;
  abortSignal?: AbortSignal;
}

export interface AiScreeningProvider {
  readonly providerName: string;

  screen(
    input: ScreeningInput,
    options?: AiScreeningProviderOptions,
  ): Promise<ProviderScreeningResult>;
}
