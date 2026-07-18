import {
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  Min,
  IsArray,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequirementImportance, EducationLevel } from '@prisma/client';

class SkillRequirementDto {
  @ApiProperty()
  @IsString()
  skillId: string;

  @ApiProperty({ enum: RequirementImportance })
  @IsEnum(RequirementImportance)
  importance: RequirementImportance;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minimumYears?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  proficiencyLevel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  weight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

class EducationRequirementDto {
  @ApiProperty({ enum: EducationLevel })
  @IsEnum(EducationLevel)
  level: EducationLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fieldOfStudy?: string;

  @ApiProperty({ enum: RequirementImportance })
  @IsEnum(RequirementImportance)
  importance: RequirementImportance;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  minimumGrade?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

class ExperienceRequirementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  domain?: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  minimumYears: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  maximumYears?: number;

  @ApiProperty({ enum: RequirementImportance })
  @IsEnum(RequirementImportance)
  importance: RequirementImportance;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

class LanguageRequirementDto {
  @ApiProperty()
  @IsString()
  languageCode: string;

  @ApiProperty()
  @IsString()
  proficiency: string;

  @ApiProperty({ enum: RequirementImportance })
  @IsEnum(RequirementImportance)
  importance: RequirementImportance;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  interviewAllowed?: boolean;
}

export class UpdateRequirementsDto {
  @ApiPropertyOptional({ type: [SkillRequirementDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkillRequirementDto)
  skills?: SkillRequirementDto[];

  @ApiPropertyOptional({ type: [EducationRequirementDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EducationRequirementDto)
  education?: EducationRequirementDto[];

  @ApiPropertyOptional({ type: [ExperienceRequirementDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExperienceRequirementDto)
  experience?: ExperienceRequirementDto[];

  @ApiPropertyOptional({ type: [LanguageRequirementDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LanguageRequirementDto)
  languages?: LanguageRequirementDto[];
}
