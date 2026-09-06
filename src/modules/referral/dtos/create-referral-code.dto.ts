import { IsNumber, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateReferralCodeDto {
  @ApiProperty({
    example: 10,
    description: 'درصد تخفیف خریدار (جمع با cashbackPercent نباید از ۲۰ بیشتر شود)',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(20)
  discountPercent: number;

  @ApiProperty({
    example: 5,
    description: 'درصد کش‌بک معرف (جمع با discountPercent نباید از ۲۰ بیشتر شود)',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(20)
  cashbackPercent: number;
}
