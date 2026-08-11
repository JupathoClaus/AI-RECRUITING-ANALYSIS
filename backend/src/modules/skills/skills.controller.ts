import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { PermissionsGuard } from '@modules/auth/guards/permissions.guard';
import { RequirePermissions } from '@modules/auth/decorators/permissions.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from '@modules/auth/interfaces/auth.interface';
import { SkillsService } from './skills.service';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { SkillQueryDto } from './dto/skill-query.dto';

@ApiTags('Skills')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Get()
  @RequirePermissions('jobs.read')
  @ApiOperation({ summary: 'List skills with pagination' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Paginated skill list' })
  async findAll(@Query() query: SkillQueryDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.skillsService.findAll(user.activeCompanyId!, query);
  }

  @Post()
  @RequirePermissions('jobs.manage_templates')
  @ApiOperation({ summary: 'Create a company-custom skill' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Skill created' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Duplicate skill name' })
  async create(@Body() dto: CreateSkillDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.skillsService.create(user.activeCompanyId!, dto);
  }

  @Patch(':skillId')
  @RequirePermissions('jobs.manage_templates')
  @ApiOperation({ summary: 'Update a company-custom skill' })
  @ApiParam({ name: 'skillId', description: 'Skill ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Skill updated' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Skill not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Cannot update global skill' })
  async update(
    @Param('skillId') skillId: string,
    @Body() dto: UpdateSkillDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.skillsService.update(user.activeCompanyId!, skillId, dto);
  }

  @Delete(':skillId')
  @RequirePermissions('jobs.manage_templates')
  @ApiOperation({ summary: 'Delete a company-custom skill' })
  @ApiParam({ name: 'skillId', description: 'Skill ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Skill deleted' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Skill not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Cannot delete global skill' })
  async remove(@Param('skillId') skillId: string, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.skillsService.delete(user.activeCompanyId!, skillId);
  }
}
