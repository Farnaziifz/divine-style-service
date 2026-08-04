import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

enum ReportPeriodDto {
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
}

export class IncentiveReportQueryDto {
  @ApiPropertyOptional({
    enum: ReportPeriodDto,
    description: 'میان‌بر بازهٔ زمانی؛ اگر داده شود از from/to مهم‌تر است',
  })
  @IsOptional()
  @IsEnum(ReportPeriodDto)
  period?: ReportPeriodDto;

  @ApiPropertyOptional({ description: 'شروع بازه (ISO)؛ پیش‌فرض ۳۰ روز قبل' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'پایان بازه (ISO)؛ پیش‌فرض الان' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
