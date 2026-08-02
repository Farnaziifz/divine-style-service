import { IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContentEntryType } from '@prisma/client';

export class CreateEntryDto {
  @ApiProperty({ description: 'تاریخ (YYYY-MM-DD)' })
  @IsDateString()
  date: string;

  @ApiProperty({ enum: ContentEntryType })
  @IsEnum(ContentEntryType)
  type: ContentEntryType;

  @ApiPropertyOptional({ description: 'عنوان محتوا' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'محصول‌های مرتبط (اختیاری)' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  productIds?: string[];
}
