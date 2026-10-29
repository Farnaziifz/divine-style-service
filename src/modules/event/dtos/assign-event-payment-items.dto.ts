import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { CreateOfflineSaleItemDto } from '../../offline-sale/dtos/create-offline-sale-item.dto';

export class AssignEventPaymentItemsDto {
  @ApiProperty({
    type: [CreateOfflineSaleItemDto],
    description: 'اقلام خریداری‌شده با این پرداخت. لیست خالی = برداشتن تعیین تکلیف و برگرداندن موجودی',
  })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateOfflineSaleItemDto)
  items: CreateOfflineSaleItemDto[];
}
