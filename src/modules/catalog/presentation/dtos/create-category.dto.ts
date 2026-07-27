import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateCategoryDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image?: string;

  @ApiProperty({ description: 'شروع بازهٔ کد محصولات این دسته‌بندی (مثلاً ۲۰۰)' })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  codeStart: number;

  @ApiPropertyOptional({ description: 'ضریب سود این دسته‌بندی (پیش‌فرض ۱)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  profitMultiplier?: number;
}
