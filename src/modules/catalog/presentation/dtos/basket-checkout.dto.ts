import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class BasketCheckoutDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lang?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsIn(['ZARINPAL', 'ZIBAL'])
  paymentProvider?: 'ZARINPAL' | 'ZIBAL';

  @ApiPropertyOptional({ description: 'مبلغ درخواستی برای اعمال از کیف‌پول (تومان)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  walletAmount?: number;
}
