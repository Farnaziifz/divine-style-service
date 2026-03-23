import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

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
}
