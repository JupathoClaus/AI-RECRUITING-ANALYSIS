import { IsString, IsOptional, MinLength, MaxLength, IsUUID, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmploymentType, WorkplaceType, ExperienceLevel } from '@prisma/client';

export class CreateJobTemplateDto {
  @ApiProperty({ example: 'Software Engineer Template' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'Standard template for software engineering roles' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: 'Engineering' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ enum: EmploymentType })
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @ApiPropertyOptional({ enum: WorkplaceType })
  @IsOptional()
  @IsEnum(WorkplaceType)
  workplaceType?: WorkplaceType;

  @ApiPropertyOptional({ enum: ExperienceLevel })
  @IsOptional()
  @IsEnum(ExperienceLevel)
  experienceLevel?: ExperienceLevel;

  @ApiPropertyOptional({ example: '{{title}} - {{company}}' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  titleTemplate?: string;

  @ApiProperty({ example: 'We are looking for a talented...' })
  @IsString()
  @MinLength(1)
  descriptionTemplate: string;

  @ApiPropertyOptional({ example: 'Lead and mentor team members...' })
  @IsOptional()
  @IsString()
  responsibilitiesTemplate?: string;

  @ApiPropertyOptional({ example: '5+ years of experience in...' })
  @IsOptional()
  @IsString()
  qualificationsTemplate?: string;

  @ApiPropertyOptional({ example: 'Competitive salary, health insurance...' })
  @IsOptional()
  @IsString()
  benefitsTemplate?: string;
}
