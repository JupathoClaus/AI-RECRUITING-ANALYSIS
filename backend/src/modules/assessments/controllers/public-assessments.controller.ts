import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AssessmentSessionsService } from '../services/assessment-sessions.service';
import { VerifyAssessmentCodeDto, SaveAssessmentResponseDto } from '../dto/assignment.dto';

/**
 * Candidate-facing assessment endpoints. No recruiter authentication: access
 * is granted by the emailed code (→ short-lived bound Bearer token).
 * Throttled; candidate-safe DTOs only (no correct answers, rubrics, or AI
 * metadata ever leave the server here).
 */
@ApiTags('Assessments (Public)')
@Controller('public/assessments')
export class PublicAssessmentsController {
  constructor(private readonly sessions: AssessmentSessionsService) {}

  @Post('verify-code')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify assessment code and receive an access token' })
  async verifyCode(@Body() dto: VerifyAssessmentCodeDto) {
    return this.sessions.verifyCode(dto.code);
  }

  @Get('session')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Get candidate assessment view (server time authoritative)' })
  async getSession(@Headers('authorization') auth: string) {
    return this.sessions.getSession(this.bearer(auth));
  }

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Start the assessment (sets server-side expiry)' })
  async start(@Headers('authorization') auth: string) {
    return this.sessions.start(this.bearer(auth));
  }

  @Put('responses')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Autosave a response (server-persisted)' })
  async saveResponse(
    @Headers('authorization') auth: string,
    @Body() dto: SaveAssessmentResponseDto,
  ) {
    return this.sessions.saveResponse(this.bearer(auth), dto);
  }

  @Post('submit')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Submit exactly once (idempotent)' })
  async submit(@Headers('authorization') auth: string, @Headers('Idempotency-Key') key?: string) {
    return this.sessions.submit(this.bearer(auth), key || undefined);
  }

  @Get('status')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Own submission status (no score — recruiter-controlled)' })
  async status(@Headers('authorization') auth: string) {
    return this.sessions.getStatus(this.bearer(auth));
  }

  private bearer(auth?: string): string {
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: 'MISSING_TOKEN',
        message: 'Authorization header required',
      });
    }
    return auth.slice(7);
  }
}
