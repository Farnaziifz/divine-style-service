import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RedeemDiscountCodeDto {
  @ApiProperty({ example: 'SPRING1404' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty()
  @IsUUID()
  customerId: string;

  @ApiProperty({ example: 1500000, description: 'مبلغ سفارش پیش از تخفیف' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  orderAmount: number;

  @ApiPropertyOptional({ description: 'اگر سفارش از قبل ثبت شده باشد' })
  @IsOptional()
  @IsUUID()
  orderId?: string;
}
