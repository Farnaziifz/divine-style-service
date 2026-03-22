import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UserAddressDto {
  @ApiProperty({ example: '8f1c3d88-9f0e-4c3b-9f2e-5d4b1d7e9a11' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ example: 'تهران' })
  @IsString()
  @IsNotEmpty()
  province: string;

  @ApiProperty({ example: 'تهران' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ example: 'خیابان ...، کوچه ...، پلاک ...' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ example: '12', required: false })
  @IsString()
  @IsOptional()
  plaque?: string;

  @ApiProperty({ example: '3', required: false })
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiProperty({ example: '1234567890', required: false })
  @IsString()
  @IsOptional()
  @Matches(/^\d{10}$/)
  postalCode?: string;

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isDefault?: boolean;
}

export class CreateUserAddressDto {
  @ApiProperty({ example: 'تهران' })
  @IsString()
  @IsNotEmpty()
  province: string;

  @ApiProperty({ example: 'تهران' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ example: 'خیابان ...، کوچه ...، پلاک ...' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ example: '12', required: false })
  @IsString()
  @IsOptional()
  plaque?: string;

  @ApiProperty({ example: '3', required: false })
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiProperty({ example: '1234567890', required: false })
  @IsString()
  @IsOptional()
  @Matches(/^\d{10}$/)
  postalCode?: string;

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isDefault?: boolean;
}

export class UpdateUserAddressDto {
  @ApiProperty({ example: 'تهران', required: false })
  @IsString()
  @IsOptional()
  province?: string;

  @ApiProperty({ example: 'تهران', required: false })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiProperty({ example: 'خیابان ...، کوچه ...، پلاک ...', required: false })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ example: '12', required: false })
  @IsString()
  @IsOptional()
  plaque?: string;

  @ApiProperty({ example: '3', required: false })
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiProperty({ example: '1234567890', required: false })
  @IsString()
  @IsOptional()
  @Matches(/^\d{10}$/)
  postalCode?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isDefault?: boolean;
}
