import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdatePricingSettingsDto {
  @ApiProperty({ description: 'هزینه ثابت بسته‌بندی (تومان)' })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  packagingCost: number;

  @ApiProperty({ description: 'درصد مالیات' })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxPercent: number;
}
