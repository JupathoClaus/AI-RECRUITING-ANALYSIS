import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsEmail,
  IsNumber,
  Min,
  Max,
  MinLength,
  MaxLength,
  IsEnum,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LocationType } from '@prisma/client';

export class CreateLocationDto {
  @ApiProperty({ description: 'Location name', example: 'Head Office' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiProperty({
    description: 'Location type',
    enum: LocationType,
    example: LocationType.HEAD_OFFICE,
  })
  @IsEnum(LocationType)
  type: LocationType;

  @ApiProperty({ description: 'Address line 1', example: '123 Main Street' })
  @IsString()
  @IsNotEmpty()
  addressLine1: string;

  @ApiPropertyOptional({ description: 'Address line 2', example: 'Suite 100' })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiProperty({ description: 'City', example: 'New York' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiPropertyOptional({ description: 'State or province', example: 'NY' })
  @IsOptional()
  @IsString()
  stateOrProvince?: string;

  @ApiPropertyOptional({ description: 'Postal code', example: '10001' })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiProperty({ description: 'ISO country code', example: 'US' })
  @IsString()
  @Length(2, 5)
  countryCode: string;

  @ApiProperty({ description: 'Timezone', example: 'America/New_York' })
  @IsString()
  @IsNotEmpty()
  timezone: string;

  @ApiPropertyOptional({ description: 'Phone number', example: '+1-212-555-0100' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Email address', example: 'office@company.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Latitude', example: 40.7128 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ description: 'Longitude', example: -74.006 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ description: 'Set as primary location', default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
