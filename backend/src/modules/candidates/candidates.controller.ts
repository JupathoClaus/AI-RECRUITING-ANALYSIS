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
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@modules/auth/guards/permissions.guard';
import { RequirePermissions } from '@modules/auth/decorators/permissions.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from '@modules/auth/interfaces/auth.interface';
import { CandidatesService } from './candidates.service';
import { CandidateProfileService } from './candidate-profile.service';
import { CandidateDeduplicationService } from './candidate-deduplication.service';
import { CandidateMergeService } from './candidate-merge.service';
import { CreateCandidateDto, UpdateCandidateDto } from './dto/create-candidate.dto';
import { CandidateQueryDto } from './dto/candidate-query.dto';
import { ArchiveCandidateDto } from './dto/archive-candidate.dto';
import { BlockCandidateDto } from './dto/block-candidate.dto';
import { MergePreviewDto } from './dto/merge-preview.dto';
import { MergeCandidateDto } from './dto/merge-candidate.dto';
import {
  CompanyCandidateService,
  LinkCandidateDto,
  UpdateCompanyProfileDto,
} from '@modules/applications/services/company-candidate.service';
import { CandidateTagsService } from '@modules/applications/services/candidate-tags.service';
import { CreateNoteDto, UpdateNoteDto } from '@modules/applications/dto/note.dto';
import { ApplicationNotesService } from '@modules/applications/services/application-notes.service';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  MaxLength,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CandidateSource } from '@prisma/client';

class LinkCandidateBody {
  @ApiPropertyOptional() @IsOptional() source?: CandidateSource;
  @ApiPropertyOptional() @IsOptional() @IsString() sourceDetail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ownerMembershipId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() talentPoolEnabled?: boolean;
}

class UpdateCompanyProfileBody {
  @ApiPropertyOptional() @IsOptional() @IsString() ownerMembershipId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() talentPoolEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() doNotContact?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) doNotContactReason?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(5) rating?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) internalSummary?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) sourceDetail?: string;
  @Type(() => Number) @IsInt() @Min(1) expectedVersion: number;
}

class ArchiveCompanyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
  @Type(() => Number) @IsInt() @Min(1) expectedVersion: number;
}

class RestoreCompanyDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion: number;
}

@ApiTags('Candidates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('candidates')
export class CandidatesController {
  constructor(
    private readonly candidatesService: CandidatesService,
    private readonly profileService: CandidateProfileService,
    private readonly deduplicationService: CandidateDeduplicationService,
    private readonly mergeService: CandidateMergeService,
    private readonly companyCandidateService: CompanyCandidateService,
    private readonly candidateTagsService: CandidateTagsService,
    private readonly candidateNotesService: ApplicationNotesService,
  ) {}

  @Post()
  @RequirePermissions('candidates.create')
  @ApiOperation({
    summary: 'Create a new candidate',
    description: 'Creates a global candidate profile. Checks for duplicates before creation.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Candidate created' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Exact duplicate found' })
  async create(@Body() dto: CreateCandidateDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.candidatesService.create(
      dto,
      user.userId,
      user.membershipId,
      user.activeCompanyId,
      undefined,
    );
  }

  @Get()
  @RequirePermissions('candidates.read')
  @ApiOperation({ summary: 'List candidates — company-scoped via CompanyCandidate' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Paginated candidate list' })
  async findAll(@Query() query: CandidateQueryDto, @CurrentUser() user: AuthenticatedPrincipal) {
    const hasSensitive = user.permissions.includes('candidates.view_sensitive');
    return this.candidatesService.findAll(query, hasSensitive, user.activeCompanyId);
  }

  @Get('search')
  @RequirePermissions('candidates.read')
  @ApiOperation({ summary: 'Search candidates (company-scoped)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Search results' })
  async search(@Query() query: CandidateQueryDto, @CurrentUser() user: AuthenticatedPrincipal) {
    const hasSensitive = user.permissions.includes('candidates.view_sensitive');
    return this.candidatesService.findAll(query, hasSensitive, user.activeCompanyId);
  }

  @Get(':candidateId')
  @RequirePermissions('candidates.read')
  @ApiOperation({ summary: 'Get candidate by ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Candidate detail' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Candidate not found' })
  async findOne(
    @Param('candidateId') candidateId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const hasSensitive = user.permissions.includes('candidates.view_sensitive');
    return this.candidatesService.findById(candidateId, hasSensitive);
  }

  @Patch(':candidateId')
  @RequirePermissions('candidates.update')
  @ApiOperation({
    summary: 'Update candidate profile',
    description: 'Requires expectedVersion for optimistic concurrency.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Candidate updated' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Stale version or duplicate contact' })
  async update(
    @Param('candidateId') candidateId: string,
    @Body() dto: UpdateCandidateDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.candidatesService.update(
      candidateId,
      dto,
      user.userId,
      user.membershipId,
      user.activeCompanyId,
      undefined,
    );
  }

  /* ══════════════════════════════════════════════════════════════
     STATUS MANAGEMENT
     ══════════════════════════════════════════════════════════════ */
  @Post(':candidateId/archive')
  @RequirePermissions('candidates.archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a candidate (set status INACTIVE)' })
  async archive(
    @Param('candidateId') candidateId: string,
    @Body() dto: ArchiveCandidateDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.candidatesService.archive(
      candidateId,
      dto.expectedVersion,
      dto.reason,
      user.userId,
      user.membershipId,
      user.activeCompanyId,
      undefined,
    );
  }

  @Post(':candidateId/restore')
  @RequirePermissions('candidates.archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore an archived candidate' })
  async restore(
    @Param('candidateId') candidateId: string,
    @Body() dto: ArchiveCandidateDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.candidatesService.restore(
      candidateId,
      dto.expectedVersion,
      user.userId,
      user.membershipId,
      user.activeCompanyId,
      undefined,
    );
  }

  @Post(':candidateId/block')
  @RequirePermissions('candidates.block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block a candidate' })
  async block(
    @Param('candidateId') candidateId: string,
    @Body() dto: BlockCandidateDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.candidatesService.block(
      candidateId,
      dto.reasonCode,
      dto.reason,
      dto.expectedVersion,
      user.userId,
      user.membershipId,
      user.activeCompanyId,
      undefined,
    );
  }

  @Post(':candidateId/unblock')
  @RequirePermissions('candidates.block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unblock a candidate' })
  async unblock(
    @Param('candidateId') candidateId: string,
    @Body() dto: { expectedVersion: number },
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.candidatesService.unblock(
      candidateId,
      dto.expectedVersion,
      user.userId,
      user.membershipId,
      user.activeCompanyId,
      undefined,
    );
  }

  /* ══════════════════════════════════════════════════════════════
     DUPLICATE DETECTION & MERGE
     ══════════════════════════════════════════════════════════════ */
  @Get(':candidateId/duplicates')
  @RequirePermissions('candidates.read')
  @ApiOperation({ summary: 'Find potential duplicates for a candidate' })
  async findDuplicates(@Param('candidateId') candidateId: string) {
    const candidate = await this.candidatesService.findById(candidateId, false);
    return this.deduplicationService.checkBeforeCreate({
      firstName: (candidate as any).firstName,
      lastName: (candidate as any).lastName,
      email: (candidate as any).email,
      phone: (candidate as any).phone,
      normalizedEmail: null,
      normalizedPhone: null,
    });
  }

  @Post('merge-preview')
  @RequirePermissions('candidates.merge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview merge of two candidates' })
  async mergePreview(@Body() dto: MergePreviewDto) {
    return this.mergeService.buildMergePreview(dto.primaryCandidateId, dto.mergedCandidateId);
  }

  @Post('merge')
  @RequirePermissions('candidates.merge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Merge two candidates into one' })
  async merge(@Body() dto: MergeCandidateDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.mergeService.executeMerge(
      dto.primaryCandidateId,
      dto.mergedCandidateId,
      dto.reason,
      dto.fieldResolution,
      dto.expectedPrimaryVersion,
      dto.expectedMergedVersion,
      user.userId,
      user.membershipId,
      user.activeCompanyId,
      undefined,
    );
  }

  /* ══════════════════════════════════════════════════════════════
     ACTIVITY
     ══════════════════════════════════════════════════════════════ */
  @Get(':candidateId/activity')
  @RequirePermissions('candidates.read')
  @ApiOperation({ summary: 'Get candidate audit activity' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'eventType', required: false })
  async getActivity(
    @Param('candidateId') candidateId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('eventType') eventType?: string,
  ) {
    return this.candidatesService.getActivity(
      candidateId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      eventType,
    );
  }

  /* ══════════════════════════════════════════════════════════════
     SKILLS
     ══════════════════════════════════════════════════════════════ */
  @Get(':candidateId/skills')
  @RequirePermissions('candidates.read')
  @ApiOperation({ summary: 'Get candidate skills' })
  async getSkills(@Param('candidateId') candidateId: string) {
    return this.profileService.getSkills(candidateId);
  }

  @Post(':candidateId/skills')
  @RequirePermissions('candidates.update')
  @ApiOperation({ summary: 'Add a skill to candidate' })
  async addSkill(
    @Param('candidateId') candidateId: string,
    @Body()
    dto: {
      skillId: string;
      proficiencyLevel?: string;
      yearsOfExperience?: number;
      lastUsedAt?: string;
    },
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.profileService.addSkill(
      candidateId,
      dto,
      user.userId,
      user.membershipId,
      user.activeCompanyId,
      undefined,
    );
  }

  @Patch(':candidateId/skills/:candidateSkillId')
  @RequirePermissions('candidates.update')
  @ApiOperation({ summary: 'Update a candidate skill' })
  async updateSkill(
    @Param('candidateId') candidateId: string,
    @Param('candidateSkillId') candidateSkillId: string,
    @Body()
    dto: {
      proficiencyLevel?: string;
      yearsOfExperience?: number;
      lastUsedAt?: string;
      verified?: boolean;
      verificationSource?: string;
    },
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.profileService.updateSkill(
      candidateId,
      candidateSkillId,
      dto,
      user.userId,
      user.membershipId,
      user.activeCompanyId,
      undefined,
    );
  }

  @Delete(':candidateId/skills/:candidateSkillId')
  @RequirePermissions('candidates.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a skill from candidate' })
  async removeSkill(
    @Param('candidateId') candidateId: string,
    @Param('candidateSkillId') candidateSkillId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.profileService.removeSkill(
      candidateId,
      candidateSkillId,
      user.userId,
      user.membershipId,
      user.activeCompanyId,
      undefined,
    );
  }

  /* ══════════════════════════════════════════════════════════════
     EMPLOYMENT
     ══════════════════════════════════════════════════════════════ */
  @Get(':candidateId/employment')
  @RequirePermissions('candidates.read')
  @ApiOperation({ summary: 'Get candidate employment history' })
  async getEmployment(@Param('candidateId') candidateId: string) {
    return this.profileService.getEmployment(candidateId);
  }

  @Post(':candidateId/employment')
  @RequirePermissions('candidates.update')
  @ApiOperation({ summary: 'Add employment record' })
  async addEmployment(
    @Param('candidateId') candidateId: string,
    @Body()
    dto: {
      type: string;
      companyName: string;
      jobTitle: string;
      location?: string;
      startDate: string;
      endDate?: string;
      currentlyWorking?: boolean;
      description?: string;
      achievements?: string;
      industry?: string;
      sortOrder?: number;
    },
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.profileService.addEmployment(
      candidateId,
      dto,
      user.userId,
      user.membershipId,
      user.activeCompanyId,
      undefined,
    );
  }

  @Patch(':candidateId/employment/:employmentId')
  @RequirePermissions('candidates.update')
  @ApiOperation({ summary: 'Update employment record' })
  async updateEmployment(
    @Param('candidateId') candidateId: string,
    @Param('employmentId') employmentId: string,
    @Body() dto: any,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.profileService.updateEmployment(
      candidateId,
      employmentId,
      dto,
      user.userId,
      user.membershipId,
      user.activeCompanyId,
      undefined,
    );
  }

  @Delete(':candidateId/employment/:employmentId')
  @RequirePermissions('candidates.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete employment record' })
  async removeEmployment(
    @Param('candidateId') candidateId: string,
    @Param('employmentId') employmentId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.profileService.removeEmployment(
      candidateId,
      employmentId,
      user.userId,
      user.membershipId,
      user.activeCompanyId,
      undefined,
    );
  }

  @Post(':candidateId/employment/reorder')
  @RequirePermissions('candidates.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reorder employment records' })
  async reorderEmployment(
    @Param('candidateId') candidateId: string,
    @Body() dto: { employmentIds: string[] },
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.profileService.reorderEmployment(
      candidateId,
      dto.employmentIds,
      user.userId,
      user.membershipId,
      user.activeCompanyId,
      undefined,
    );
  }

  /* ══════════════════════════════════════════════════════════════
     EDUCATION
     ══════════════════════════════════════════════════════════════ */
  @Get(':candidateId/education')
  @RequirePermissions('candidates.read')
  @ApiOperation({ summary: 'Get candidate education' })
  async getEducation(@Param('candidateId') candidateId: string) {
    return this.profileService.getEducation(candidateId);
  }

  @Post(':candidateId/education')
  @RequirePermissions('candidates.update')
  @ApiOperation({ summary: 'Add education record' })
  async addEducation(
    @Param('candidateId') candidateId: string,
    @Body()
    dto: {
      institution: string;
      level: string;
      fieldOfStudy?: string;
      status: string;
      startDate?: string;
      endDate?: string;
      grade?: string;
      description?: string;
      sortOrder?: number;
    },
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.profileService.addEducation(
      candidateId,
      dto,
      user.userId,
      user.membershipId,
      user.activeCompanyId,
      undefined,
    );
  }

  @Delete(':candidateId/education/:educationId')
  @RequirePermissions('candidates.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete education record' })
  async removeEducation(
    @Param('candidateId') candidateId: string,
    @Param('educationId') educationId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.profileService.removeEducation(
      candidateId,
      educationId,
      user.userId,
      user.membershipId,
      user.activeCompanyId,
      undefined,
    );
  }

  @Post(':candidateId/education/reorder')
  @RequirePermissions('candidates.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reorder education records' })
  async reorderEducation(
    @Param('candidateId') candidateId: string,
    @Body() dto: { educationIds: string[] },
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.profileService.reorderEducation(
      candidateId,
      dto.educationIds,
      user.userId,
      user.membershipId,
      user.activeCompanyId,
      undefined,
    );
  }

  /* ══════════════════════════════════════════════════════════════
     CERTIFICATIONS
     ══════════════════════════════════════════════════════════════ */
  @Get(':candidateId/certifications')
  @RequirePermissions('candidates.read')
  @ApiOperation({ summary: 'Get candidate certifications' })
  async getCertifications(@Param('candidateId') candidateId: string) {
    return this.profileService.getCertifications(candidateId);
  }

  @Post(':candidateId/certifications')
  @RequirePermissions('candidates.update')
  @ApiOperation({ summary: 'Add certification' })
  async addCertification(
    @Param('candidateId') candidateId: string,
    @Body()
    dto: {
      name: string;
      issuingOrganization: string;
      issuedAt?: string;
      expiresAt?: string;
      credentialId?: string;
      credentialUrl?: string;
    },
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.profileService.addCertification(
      candidateId,
      dto,
      user.userId,
      user.membershipId,
      user.activeCompanyId,
      undefined,
    );
  }

  @Delete(':candidateId/certifications/:certificationId')
  @RequirePermissions('candidates.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete certification' })
  async removeCertification(
    @Param('candidateId') candidateId: string,
    @Param('certificationId') certificationId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.profileService.removeCertification(
      candidateId,
      certificationId,
      user.userId,
      user.membershipId,
      user.activeCompanyId,
      undefined,
    );
  }

  /* ══════════════════════════════════════════════════════════════
     LANGUAGES
     ══════════════════════════════════════════════════════════════ */
  @Get(':candidateId/languages')
  @RequirePermissions('candidates.read')
  @ApiOperation({ summary: 'Get candidate languages' })
  async getLanguages(@Param('candidateId') candidateId: string) {
    return this.profileService.getLanguages(candidateId);
  }

  @Post(':candidateId/languages')
  @RequirePermissions('candidates.update')
  @ApiOperation({ summary: 'Add language' })
  async addLanguage(
    @Param('candidateId') candidateId: string,
    @Body()
    dto: { languageCode: string; proficiency: string; preferredInterviewLanguage?: boolean },
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.profileService.addLanguage(
      candidateId,
      dto,
      user.userId,
      user.membershipId,
      user.activeCompanyId,
      undefined,
    );
  }

  @Post(':candidateId/languages/:languageId/set-preferred')
  @RequirePermissions('candidates.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set preferred interview language' })
  async setPreferredLanguage(
    @Param('candidateId') candidateId: string,
    @Param('languageId') languageId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.profileService.setPreferredLanguage(
      candidateId,
      languageId,
      user.userId,
      user.membershipId,
      user.activeCompanyId,
      undefined,
    );
  }

  @Delete(':candidateId/languages/:languageId')
  @RequirePermissions('candidates.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove language' })
  async removeLanguage(
    @Param('candidateId') candidateId: string,
    @Param('languageId') languageId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.profileService.removeLanguage(
      candidateId,
      languageId,
      user.userId,
      user.membershipId,
      user.activeCompanyId,
      undefined,
    );
  }

  /* ══════════════════════════════════════════════════════════════
     CONSENTS
     ══════════════════════════════════════════════════════════════ */
  @Get(':candidateId/consents')
  @RequirePermissions('candidates.read')
  @ApiOperation({ summary: 'Get candidate consents' })
  async getConsents(@Param('candidateId') candidateId: string) {
    return this.profileService.getConsents(candidateId);
  }

  @Post(':candidateId/consents/grant')
  @RequirePermissions('candidates.update')
  @ApiOperation({ summary: 'Grant consent' })
  async grantConsent(
    @Param('candidateId') candidateId: string,
    @Body() dto: { type: string; policyVersion: string },
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.profileService.grantConsent(
      candidateId,
      { ...dto, companyId: user.activeCompanyId },
      user.userId,
      user.membershipId,
      undefined,
    );
  }

  @Post(':candidateId/consents/:consentId/revoke')
  @RequirePermissions('candidates.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke consent' })
  async revokeConsent(
    @Param('candidateId') candidateId: string,
    @Param('consentId') consentId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.profileService.revokeConsent(
      candidateId,
      consentId,
      user.userId,
      user.membershipId,
      user.activeCompanyId,
      undefined,
    );
  }

  /* ══════════════════════════════════════════════════════════════
     COMPANY-CANDIDATE RELATIONSHIP (Phase 2.2)
     ══════════════════════════════════════════════════════════════ */

  @Post(':candidateId/link')
  @RequirePermissions('candidates.update')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Link existing global candidate to the active company (creates CompanyCandidate)',
  })
  async linkCandidate(
    @Param('candidateId') candidateId: string,
    @Body() dto: LinkCandidateBody,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.companyCandidateService.linkCandidate(
      candidateId,
      user.activeCompanyId!,
      dto as LinkCandidateDto,
      user.userId,
      user.membershipId!,
    );
  }

  @Patch(':candidateId/company-profile')
  @RequirePermissions('candidates.manage_company_profile')
  @ApiOperation({
    summary: 'Update company-specific candidate profile (rating, summary, owner, etc.)',
  })
  async updateCompanyProfile(
    @Param('candidateId') candidateId: string,
    @Body() dto: UpdateCompanyProfileBody,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.companyCandidateService.updateCompanyProfile(
      candidateId,
      user.activeCompanyId!,
      dto as UpdateCompanyProfileDto,
      user.userId,
      user.membershipId!,
    );
  }

  @Post(':candidateId/archive')
  @RequirePermissions('candidates.archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Archive candidate at company level (does NOT archive global Candidate)',
  })
  async archiveCompanyCandidate(
    @Param('candidateId') candidateId: string,
    @Body() dto: ArchiveCompanyDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.companyCandidateService.archive(
      candidateId,
      user.activeCompanyId!,
      dto.expectedVersion,
      dto.reason,
      user.userId,
      user.membershipId!,
    );
  }

  @Post(':candidateId/restore')
  @RequirePermissions('candidates.archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore company-level archived candidate' })
  async restoreCompanyCandidate(
    @Param('candidateId') candidateId: string,
    @Body() dto: RestoreCompanyDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.companyCandidateService.restore(
      candidateId,
      user.activeCompanyId!,
      dto.expectedVersion,
      user.userId,
      user.membershipId!,
    );
  }

  /* ══════════════════════════════════════════════════════════════
     CANDIDATE NOTES (Phase 2.2)
     ══════════════════════════════════════════════════════════════ */

  @Get(':candidateId/notes')
  @RequirePermissions('candidates.read')
  @ApiOperation({ summary: 'Get company candidate notes' })
  async getCandidateNotes(
    @Param('candidateId') candidateId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    // Notes are on the CompanyCandidate record; look up companyCandidateId first
    const cc = await this.companyCandidateService.findByCompanyAndCandidate(
      user.activeCompanyId!,
      candidateId,
    );
    if (!cc) return { data: [] };
    // Reuse ApplicationNotesService with applicationId stub — for candidate notes we use CompanyCandidateNote directly
    const notes = await this.profileService['prisma']?.companyCandidateNote
      ?.findMany({
        where: { companyCandidateId: cc.id, companyId: user.activeCompanyId!, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      })
      .catch(() => []);
    return { data: notes ?? [] };
  }

  @Post(':candidateId/notes')
  @RequirePermissions('candidates.manage_notes')
  @ApiOperation({ summary: 'Add note to company candidate' })
  async addCandidateNote(
    @Param('candidateId') candidateId: string,
    @Body() dto: CreateNoteDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const cc = await this.companyCandidateService.findByCompanyAndCandidate(
      user.activeCompanyId!,
      candidateId,
    );
    if (!cc) throw new Error('COMPANY_CANDIDATE_NOT_FOUND');
    return this.profileService['prisma']?.companyCandidateNote?.create({
      data: {
        companyId: user.activeCompanyId!,
        companyCandidateId: cc.id,
        authorMembershipId: user.membershipId!,
        content: dto.content,
        visibility: dto.visibility ?? 'PRIVATE',
      },
    });
  }

  /* ══════════════════════════════════════════════════════════════
     CANDIDATE TAGS (Phase 2.2)
     ══════════════════════════════════════════════════════════════ */

  @Post(':candidateId/tags')
  @RequirePermissions('candidates.manage_tags')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Assign a tag to a company candidate' })
  async assignTag(
    @Param('candidateId') candidateId: string,
    @Body() body: { tagId: string },
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.candidateTagsService.assignTagToCandidate(
      candidateId,
      body.tagId,
      user.activeCompanyId!,
      user.membershipId!,
    );
  }

  @Delete(':candidateId/tags/:tagId')
  @RequirePermissions('candidates.manage_tags')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a tag from a company candidate' })
  async removeTag(
    @Param('candidateId') candidateId: string,
    @Param('tagId') tagId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.candidateTagsService.removeTagFromCandidate(
      candidateId,
      tagId,
      user.activeCompanyId!,
      user.membershipId!,
    );
  }
}
