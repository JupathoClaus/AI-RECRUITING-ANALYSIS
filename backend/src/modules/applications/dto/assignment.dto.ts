import { IsEnum, IsUUID, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationAssignmentType } from '@prisma/client';

export class CreateAssignmentDto {
  @ApiProperty({ description: 'Membership ID to assign' })
  @IsUUID()
  membershipId: string;

  @ApiProperty({ enum: ApplicationAssignmentType })
  @IsEnum(ApplicationAssignmentType)
  type: ApplicationAssignmentType;
}

export class TransferOwnershipDto {
  @ApiProperty({ description: 'New owner membership ID' })
  @IsUUID()
  newOwnerMembershipId: string;
}
