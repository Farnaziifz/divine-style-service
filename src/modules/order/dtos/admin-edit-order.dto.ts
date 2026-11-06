import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  Min,
  ValidateIf,
} from 'class-validator';

/** ویرایش فیلدهای سطح سفارش توسط ادمین (مبالغ به تومان) */
export class AdminUpdateOrderDto {
  @ApiPropertyOptional({ description: 'مبلغ تخفیف سفارش (تومان)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @ApiPropertyOptional({ description: 'هزینهٔ ارسال (تومان)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  shippingCost?: number;

  @ApiPropertyOptional({ description: 'هزینهٔ بسته‌بندی (تومان)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  packagingCost?: number;

  @ApiPropertyOptional({ description: 'آدرس ارسال' })
  @IsOptional()
  @IsObject()
  shippingAddress?: Record<string, unknown>;
}

/** ویرایش یک آیتم سفارش */
export class AdminUpdateOrderItemDto {
  @ApiPropertyOptional({ description: 'تعداد جدید (حداقل ۱؛ برای حذف از endpoint حذف استفاده شود)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ description: 'قیمت واحد (بدون تخفیف)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional({ description: 'قیمت واحد بعد از تخفیف؛ null یعنی بدون تخفیف', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitDiscountPrice?: number | null;

  @ApiPropertyOptional({
    description: 'اگر تعداد تغییر کند: true یعنی اختلاف به/از موجودی انبار اعمال شود',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  returnToStock?: boolean;
}
