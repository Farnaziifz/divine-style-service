import { IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class DiscountCodeTierDto {
  @ApiProperty({
    example: 500000,
    description: 'حداقل مبلغ سفارش برای این پله',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAmount: number;

  @ApiProperty({
    example: 10,
    description: 'درصد یا مبلغ ثابت (بسته به valueType والد)',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  value: number;
}
