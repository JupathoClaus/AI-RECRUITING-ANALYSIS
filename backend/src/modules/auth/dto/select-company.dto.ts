import { IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SelectCompanyDto {
  @ApiProperty()
  @IsString()
  @IsUUID()
  companyId: string;
}
