import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CouponTriggerType, IncentiveValueType } from '@prisma/client';

export class CreateCouponIncentiveDto {
  @ApiProperty({ example: 'کوپن اولین خرید' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ description: 'null = برای همه مشتریان' })
  @IsOptional()
  @IsUUID()
  targetSegmentId?: string;

  @ApiProperty({ enum: CouponTriggerType })
  @IsEnum(CouponTriggerType)
  triggerType: CouponTriggerType;

  @ApiPropertyOptional({
    description:
      'PURCHASE_ABOVE_AMOUNT: { minAmount }؛ CATEGORY_PURCHASE: { categoryId }؛ FIRST_PURCHASE و REFERRAL نیازی ندارند',
    example: { minAmount: 1000000 },
  })
  @IsOptional()
  @IsObject()
  triggerConfig?: Record<string, unknown>;

  @ApiProperty({ example: '۱۰٪ تخفیف روی سفارش بعدی' })
  @IsString()
  @IsNotEmpty()
  rewardDescription: string;

  @ApiProperty({
    enum: IncentiveValueType,
    description:
      'برای REFERRAL فقط FIXED_AMOUNT مجاز است (بدون سفارش پایه برای درصد)',
  })
  @IsEnum(IncentiveValueType)
  rewardValueType: IncentiveValueType;

  @ApiProperty({ example: 10 })
  @Type(() => Number)
  @IsNumber()
  rewardValue: number;

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
