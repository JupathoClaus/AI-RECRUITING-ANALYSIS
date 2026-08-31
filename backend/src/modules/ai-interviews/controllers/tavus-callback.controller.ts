import { Controller, Post, Body, Param, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AiInterviewsService } from '../services/ai-interviews.service';

/**
 * Tavus v2 webhook receiver.
 *
 * The callback URL is authenticated with a secret embedded in the path
 * (`TAVUS_CALLBACK_SECRET`), matching the repository's existing design.
 * Tavus v2 payloads carry `event_type` / `properties`; the legacy
 * `event` / `payload` keys are tolerated as well.
 */
@ApiExcludeController()
@Controller('ai-interviews')
export class TavusCallbackController {
  private readonly logger = new Logger(TavusCallbackController.name);

  constructor(private readonly aiInterviewsService: AiInterviewsService) {}

  @Post('callback/:secret')
  @HttpCode(HttpStatus.OK)
  async handleCallbackWithSecret(
    @Param('secret') secret: string,
    @Body() body: Record<string, unknown>,
  ) {
    const props =
      (body.properties as Record<string, unknown>) ||
      (body.payload as Record<string, unknown>) ||
      undefined;

    const payload = {
      event: ((body.event_type as string) || (body.event as string) || '').trim(),
      conversation_id: (body.conversation_id as string) || '',
      status: (body.status as string) || undefined,
      properties: props,
    };

    return this.aiInterviewsService.handleTavusCallback(payload, secret);
  }

  @Post('callback')
  @HttpCode(HttpStatus.OK)
  async handleCallbackWithoutSecret(@Body() body: Record<string, unknown>) {
    const props =
      (body.properties as Record<string, unknown>) ||
      (body.payload as Record<string, unknown>) ||
      undefined;

    const payload = {
      event: ((body.event_type as string) || (body.event as string) || '').trim(),
      conversation_id: (body.conversation_id as string) || '',
      status: (body.status as string) || undefined,
      properties: props,
    };

    return this.aiInterviewsService.handleTavusCallback(payload);
  }
}
