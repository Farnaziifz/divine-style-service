import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IncentiveValueType } from '@prisma/client';

export class CreateCashbackIncentiveDto {
  @ApiProperty({ example: 'کش‌بک تابستانه' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ description: 'null = برای همه مشتریان' })
  @IsOptional()
  @IsUUID()
  targetSegmentId?: string;

  @ApiProperty({ enum: IncentiveValueType })
  @IsEnum(IncentiveValueType)
  valueType: IncentiveValueType;

  @ApiProperty({
    example: 5,
    description: 'درصد یا مبلغ ثابت کش‌بک روی مبلغ سفارش',
  })
  @Type(() => Number)
  @IsNumber()
  value: number;

  @ApiPropertyOptional({
    example: 30,
    description:
      'اعتبار کش‌بک این‌قدر روز بعد از اعطا منقضی می‌شود؛ خالی = بدون انقضا',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expiresAfterDays?: number;

  @ApiPropertyOptional({ example: 500000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPurchaseAmount?: number;

  @ApiProperty({ example: '2026-03-01T00:00:00.000Z' })
  @IsDateString()
  startsAt: string;

  @ApiProperty({ example: '2026-09-01T23:59:59.999Z' })
  @IsDateString()
  endsAt: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
