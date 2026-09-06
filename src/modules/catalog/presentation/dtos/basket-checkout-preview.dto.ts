import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class BasketCheckoutPreviewDto {
  @ApiProperty()
  @IsUUID()
  addressId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  shippingMethodId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  discountCode?: string;

  @ApiPropertyOptional({ description: 'مبلغ درخواستی برای اعمال از کیف‌پول (تومان)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  walletAmount?: number;
}
