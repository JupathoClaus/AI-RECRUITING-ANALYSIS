import { IsString, IsOptional, IsObject } from 'class-validator';

/**
 * Tavus v2 webhook payload. Tavus sends `event_type` / `properties`.
 * Legacy `event` / `payload` fields are kept optional for tolerance.
 */
export class TavusCallbackDto {
  @IsOptional()
  @IsString()
  event_type?: string;

  @IsOptional()
  @IsString()
  event?: string;

  @IsString()
  conversation_id: string;

  @IsOptional()
  @IsObject()
  properties?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  status?: string;
}
