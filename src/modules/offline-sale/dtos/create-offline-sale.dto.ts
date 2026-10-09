import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateOfflineSaleItemDto } from './create-offline-sale-item.dto';

export class CreateOfflineSaleDto {
  @ApiProperty({ description: 'محل فروش (اینستاگرام، حضوری، ایونت ...)' })
  @IsNotEmpty()
  @IsString()
  channel: string;

  @ApiPropertyOptional({ description: 'درصد کمیسیونی که به محل فروش داده می‌شود' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercent?: number;

  @ApiPropertyOptional({ description: 'مبلغ تخفیف (تومان)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({
    example: '09123456789',
    description:
      'موبایل خریدار؛ اگر حساب نداشته باشد ساخته می‌شود و پیامک تشکر برایش ارسال می‌شود',
  })
  @IsOptional()
  @IsString()
  @Matches(/^09\d{9}$/, {
    message: 'شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود',
  })
  customerMobile?: string;

  @ApiPropertyOptional({ description: 'نام خریدار (برای حساب جدید و متن پیامک)' })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional({
    description: 'ارسال پیامک تشکر به خریدار؛ پیش‌فرض true',
  })
  @IsOptional()
  @IsBoolean()
  sendSms?: boolean;

  @ApiPropertyOptional({ description: 'تاریخ فروش؛ پیش‌فرض اکنون' })
  @IsOptional()
  @IsDateString()
  soldAt?: string;

  @ApiProperty({ type: [CreateOfflineSaleItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOfflineSaleItemDto)
  items: CreateOfflineSaleItemDto[];
}
