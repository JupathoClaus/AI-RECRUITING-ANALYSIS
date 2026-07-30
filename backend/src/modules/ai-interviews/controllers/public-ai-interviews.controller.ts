import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AiInterviewsService } from '../services/ai-interviews.service';
import { VerifyCodeDto } from '../dto/verify-code.dto';
import { StartAiInterviewDto } from '../dto/start-ai-interview.dto';
import { Throttle } from '@nestjs/throttler';

@ApiTags('AI Interviews (Public)')
@Controller('ai-interviews')
export class PublicAiInterviewsController {
  constructor(private readonly aiInterviewsService: AiInterviewsService) {}

  @Post('public/verify-code')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify interview code and get access token' })
  async verifyCode(@Body() dto: VerifyCodeDto) {
    return this.aiInterviewsService.verifyCode(dto);
  }

  @Get('public/session')
  @ApiOperation({ summary: 'Get interview session details' })
  async getSession(@Headers('authorization') auth: string) {
    const token = this.extractBearerToken(auth);
    return this.aiInterviewsService.getInterviewSession(token);
  }

  @Post('public/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start AI interview' })
  async startInterview(@Headers('authorization') auth: string, @Body() dto: StartAiInterviewDto) {
    const token = this.extractBearerToken(auth);
    return this.aiInterviewsService.startInterview(token, dto);
  }

  @Post('public/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark interview as completed' })
  async completeInterview(@Headers('authorization') auth: string) {
    const token = this.extractBearerToken(auth);
    return this.aiInterviewsService.completeInterview(token);
  }

  private extractBearerToken(auth?: string): string {
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: 'MISSING_TOKEN',
        message: 'Authorization header required',
      });
    }
    return auth.slice(7);
  }
}
