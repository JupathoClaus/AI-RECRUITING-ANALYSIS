import { IsArray, IsEnum, IsOptional, IsUUID, ArrayNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum BulkMemberAction {
  SUSPEND = 'SUSPEND',
  REACTIVATE = 'REACTIVATE',
  REMOVE = 'REMOVE',
  ASSIGN_ROLE = 'ASSIGN_ROLE',
  ASSIGN_DEPARTMENT = 'ASSIGN_DEPARTMENT',
}

export class MemberActionDto {
  @ApiProperty({ description: 'Array of membership IDs' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  membershipIds: string[];

  @ApiProperty({ enum: BulkMemberAction, description: 'Action to perform' })
  @IsEnum(BulkMemberAction)
  action: BulkMemberAction;

  @ApiPropertyOptional({ description: 'Role ID (required for ASSIGN_ROLE)' })
  @IsOptional()
  @IsUUID('4')
  roleId?: string;

  @ApiPropertyOptional({ description: 'Department ID (required for ASSIGN_DEPARTMENT)' })
  @IsOptional()
  @IsUUID('4')
  departmentId?: string;
}
