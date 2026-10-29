import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateFreeShippingSettingsDto {
  @ApiProperty({
    description: 'حداقل مجموع سبد خرید (تومان) برای ارسال رایگان؛ ۰ یعنی غیرفعال',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  threshold: number;
}
