import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@modules/auth/guards/permissions.guard';
import { RequirePermissions } from '@modules/auth/decorators/permissions.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from '@modules/auth/interfaces/auth.interface';
import { InterviewsService } from '../services/interviews.service';

@ApiTags('Applications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('applications')
export class ApplicationInterviewsController {
  constructor(private readonly interviewsService: InterviewsService) {}

  @Get(':applicationId/interviews')
  @RequirePermissions('interviews.read')
  @ApiOperation({ summary: 'List all interviews for an application' })
  async findByApplication(
    @Param('applicationId') applicationId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.interviewsService.findByApplication(applicationId, user.activeCompanyId!);
  }
}
