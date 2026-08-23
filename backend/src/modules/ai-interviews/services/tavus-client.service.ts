import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

export interface TavusCreateConversationRequest {
  persona_id: string;
  replica_id: string;
  conversation_name: string;
  conversational_context?: string;
  custom_greeting?: string;
  callback_url?: string;
  require_auth: boolean;
  max_participants?: number;
  test_mode?: boolean;
  properties?: {
    participant_absent_timeout?: number;
    participant_left_timeout?: number;
  };
}

export interface TavusConversationResponse {
  conversation_id: string;
  conversation_url: string;
  status: string;
  meeting_token?: string;
  callback_url?: string;
  created_at?: string;
}

export interface TavusTranscriptTurn {
  role?: string;
  content?: string;
  timestamp?: number;
  seconds_from_start?: number;
  duration?: number;
  inference_id?: string;
}

export interface TavusConversationEvent {
  event_type?: string;
  timestamp?: string;
  properties?: {
    transcript?: TavusTranscriptTurn[];
    transcript_url?: string;
    storage_provider?: string;
    storage_uri?: string;
    bucket_name?: string;
    s3_key?: string;
    recording_id?: string;
    error_code?: string;
    error_message?: string;
    shutdown_reason?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface TavusGetConversationResponse {
  conversation_id: string;
  conversation_url: string;
  status: string;
  meeting_token?: string;
  created_at?: string;
  updated_at?: string;
  ended_at?: string;
  recordings?: unknown[];
  events?: TavusConversationEvent[];
}

/**
 * Thin client for the Tavus v2 Conversations API.
 *
 * The Tavus API key is held server-side only and is never exposed to the
 * frontend. Callers receive conversation URLs / meeting tokens which are the
 * client-safe join artifacts for a private room.
 */
@Injectable()
export class TavusClientService {
  private readonly logger = new Logger(TavusClientService.name);
  private readonly baseUrl = 'https://tavusapi.com/v2';
  private readonly apiKey: string;
  private readonly enabled: boolean;
  private readonly testMode: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.apiKey = this.configService.get<string>('tavus.apiKey') || '';
    this.enabled = this.configService.get<boolean>('tavus.enabled') || false;
    this.testMode = this.configService.get<boolean>('tavus.testMode') || false;
  }

  get isEnabled(): boolean {
    return this.enabled && !!this.apiKey;
  }

  async createConversation(
    request: TavusCreateConversationRequest,
  ): Promise<TavusConversationResponse> {
    if (!this.isEnabled) {
      throw new Error('Tavus is not configured. Set TAVUS_ENABLED=true and TAVUS_API_KEY.');
    }

    try {
      const { data } = await firstValueFrom(
        this.httpService.post<TavusConversationResponse>(`${this.baseUrl}/conversations`, request, {
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }),
      );
      return data;
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;
        const body = error.response?.data;
        if (status === 401 || status === 403) {
          throw new Error('Tavus authentication failed. Check TAVUS_API_KEY.');
        }
        if (status === 429) {
          throw new Error('Tavus rate limit exceeded. Please try again later.');
        }
        if (status && status >= 400 && status < 500) {
          throw new Error(`Tavus request failed: ${body?.message || 'Validation error'}`);
        }
        if (!status || status >= 500) {
          throw new Error('Tavus service temporarily unavailable. Please try again.');
        }
      }
      if (error instanceof Error && error.message.includes('timeout')) {
        throw new Error('Tavus request timed out. Please try again.');
      }
      throw new Error('Failed to create Tavus conversation. Network error.');
    }
  }

  /**
   * Fetch a conversation, optionally including its full event history
   * (shutdown reason, transcript turns, recording details).
   */
  async getConversation(
    conversationId: string,
    verbose = false,
  ): Promise<TavusGetConversationResponse> {
    if (!this.isEnabled) {
      throw new Error('Tavus is not configured.');
    }

    try {
      const { data } = await firstValueFrom(
        this.httpService.get<TavusGetConversationResponse>(
          `${this.baseUrl}/conversations/${conversationId}`,
          {
            headers: { 'x-api-key': this.apiKey },
            params: verbose ? { verbose: 'true' } : {},
            timeout: 15000,
          },
        ),
      );
      return data;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        throw new Error('Tavus conversation not found.');
      }
      throw new Error('Failed to get Tavus conversation status.');
    }
  }

  async endConversation(conversationId: string): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/conversations/${conversationId}/end`,
          {},
          {
            headers: { 'x-api-key': this.apiKey },
            timeout: 15000,
          },
        ),
      );
    } catch {
      this.logger.warn(`Failed to end Tavus conversation ${conversationId}`);
    }
  }
}