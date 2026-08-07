import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsUUID, Min } from 'class-validator';

export class CreateOfflineSaleItemDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsUUID()
  productId: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsUUID()
  productVariantId: string;

  @ApiProperty()
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ description: 'قیمت واحد در لحظه فروش (تومان)' })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice: number;
}
