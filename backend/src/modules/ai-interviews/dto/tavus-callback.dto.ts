import { IsString, IsOptional, IsObject } from 'class-validator';

export class TavusCallbackDto {
  @IsString()
  event: string;

  @IsString()
  conversation_id: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  status?: string;
}
