import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateEventImageDto {
  @ApiPropertyOptional({
    description: 'آدرس تصویر (مسیر برگشتی از /upload) — خالی برای حذف تصویر',
  })
  @IsOptional()
  @IsString()
  url?: string;
}
