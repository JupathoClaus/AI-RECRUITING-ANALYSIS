import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@modules/auth/guards/permissions.guard';
import { RequirePermissions } from '@modules/auth/decorators/permissions.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from '@modules/auth/interfaces/auth.interface';
import {
  CandidateTagsService,
  CreateTagDto,
  UpdateTagDto,
} from '../services/candidate-tags.service';
import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { CandidateTagType } from '@prisma/client';

class CreateTagBody implements CreateTagDto {
  @ApiProperty() @IsString() @MaxLength(100) name: string;
  @ApiPropertyOptional({ enum: CandidateTagType })
  @IsOptional()
  @IsEnum(CandidateTagType)
  type?: CandidateTagType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional({ description: 'Hex color e.g. #FF5733' })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  color?: string;
}

@ApiTags('Candidate Tags')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('candidate-tags')
export class CandidateTagsController {
  constructor(private readonly tagsService: CandidateTagsService) {}

  @Get()
  @RequirePermissions('candidates.read')
  @ApiOperation({ summary: 'List company candidate tags' })
  async list(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.tagsService.listTags(user.activeCompanyId!);
  }

  @Post()
  @RequirePermissions('candidates.manage_tags')
  @ApiOperation({ summary: 'Create a candidate tag' })
  async create(@Body() dto: CreateTagBody, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.tagsService.createTag(user.activeCompanyId!, dto, user.membershipId!);
  }

  @Patch(':tagId')
  @RequirePermissions('candidates.manage_tags')
  @ApiOperation({ summary: 'Update a candidate tag' })
  async update(
    @Param('tagId') tagId: string,
    @Body() dto: UpdateTagDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.tagsService.updateTag(tagId, user.activeCompanyId!, dto, user.membershipId!);
  }

  @Delete(':tagId')
  @RequirePermissions('candidates.manage_tags')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete (soft) a candidate tag' })
  async delete(@Param('tagId') tagId: string, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.tagsService.deleteTag(tagId, user.activeCompanyId!);
  }
}
