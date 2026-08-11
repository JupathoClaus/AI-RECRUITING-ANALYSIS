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
  max_call_duration_seconds?: number;
  participant_absent_timeout_seconds?: number;
  participant_left_timeout_seconds?: number;
}

export interface TavusConversationResponse {
  conversation_id: string;
  conversation_url: string;
  status: string;
  meeting_token?: string;
  callback_url?: string;
  created_at?: string;
}

export interface TavusGetConversationResponse {
  conversation_id: string;
  conversation_url: string;
  status: string;
  meeting_token?: string;
  created_at?: string;
  ended_at?: string;
  recordings?: unknown[];
}

@Injectable()
export class TavusClientService {
  private readonly logger = new Logger(TavusClientService.name);
  private readonly baseUrl = 'https://tavusapi.com/v2';
  private readonly apiKey: string;
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.apiKey = this.configService.get<string>('tavus.apiKey') || '';
    this.enabled = this.configService.get<boolean>('tavus.enabled') || false;
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

  async getConversation(conversationId: string): Promise<TavusGetConversationResponse> {
    if (!this.isEnabled) {
      throw new Error('Tavus is not configured.');
    }

    try {
      const { data } = await firstValueFrom(
        this.httpService.get<TavusGetConversationResponse>(
          `${this.baseUrl}/conversations/${conversationId}`,
          {
            headers: { 'x-api-key': this.apiKey },
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
