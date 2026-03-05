import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiProperty({ example: 'علی', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 'محمدی', required: false })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiProperty({ example: 'برنامه‌نویس', required: false })
  @IsString()
  @IsOptional()
  job?: string;

  @ApiProperty({ example: '0012345678', required: false })
  @IsString()
  @IsOptional()
  nationalCode?: string;
}
