import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DiscountCodeTierDto {
  @ApiPropertyOptional({
    example: 500000,
    description: 'حداقل مبلغ سفارش برای این پله — وقتی tierType=STEPPED',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @ApiPropertyOptional({
    example: 1,
    description:
      'امین بار استفادهٔ مشتری از کد (۱، ۲، ۳، ...) — وقتی tierType=USAGE_STEPPED',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usageIndex?: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'درصد یا مبلغ ثابت (بسته به valueType والد)',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  value: number;
}
