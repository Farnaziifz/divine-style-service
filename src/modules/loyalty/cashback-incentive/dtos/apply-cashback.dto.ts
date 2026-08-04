import { IsNumber, IsOptional, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApplyCashbackDto {
  @ApiProperty()
  @IsUUID()
  customerId: string;

  @ApiProperty({
    example: 1500000,
    description: 'مبلغ سفارش پیش از اعمال کش‌بک',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  orderAmount: number;

  @ApiPropertyOptional({
    description:
      'مبلغ دلخواه برای اعمال؛ خالی = حداکثر مقدار ممکن (سقف موجودی معتبر یا مبلغ سفارش)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountToApply?: number;
}
