import { Controller, Post, Body, Param, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AiInterviewsService } from '../services/ai-interviews.service';

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
    const payload = {
      event: (body.event as string) || '',
      conversation_id: (body.conversation_id as string) || '',
      status: (body.status as string) || undefined,
      payload: (body.payload as Record<string, unknown>) || undefined,
    };

    return this.aiInterviewsService.handleTavusCallback(payload, secret);
  }
}
