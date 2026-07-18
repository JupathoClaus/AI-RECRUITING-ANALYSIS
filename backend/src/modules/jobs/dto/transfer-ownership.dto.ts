import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TransferOwnershipDto {
  @ApiProperty()
  @IsUUID()
  newOwnerMembershipId: string;
}
