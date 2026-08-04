import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SnapshotHistoryQueryDto {
  @ApiPropertyOptional({
    default: 30,
    description: 'حداکثر تعداد اسنپ‌شات (جدیدترین‌ها)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  limit?: number;

  @ApiPropertyOptional({ description: 'فیلتر از این تاریخ به بعد (ISO)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'فیلتر تا این تاریخ (ISO)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
