import { IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReferralConfirmedEventDto {
  @ApiProperty({
    description: 'کاربری که ارجاع داده (پاداش به او تعلق می‌گیرد)',
  })
  @IsUUID()
  referrerId: string;

  @ApiProperty({ description: 'کاربری که از طریق ارجاع ثبت‌نام/خرید کرده' })
  @IsUUID()
  referredUserId: string;

  @ApiPropertyOptional({
    description:
      'اگر ارجاع به یک سفارش مشخص گره خورده — برای idempotency استفاده می‌شود',
  })
  @IsOptional()
  @IsUUID()
  orderId?: string;
}
