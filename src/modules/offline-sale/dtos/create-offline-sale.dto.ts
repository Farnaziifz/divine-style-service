import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateOfflineSaleItemDto } from './create-offline-sale-item.dto';

export class CreateOfflineSaleDto {
  @ApiProperty({ description: 'محل فروش (اینستاگرام، حضوری، ایونت ...)' })
  @IsNotEmpty()
  @IsString()
  channel: string;

  @ApiPropertyOptional({ description: 'درصد کمیسیونی که به محل فروش داده می‌شود' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercent?: number;

  @ApiPropertyOptional({ description: 'مبلغ تخفیف (تومان)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: 'تاریخ فروش؛ پیش‌فرض اکنون' })
  @IsOptional()
  @IsDateString()
  soldAt?: string;

  @ApiProperty({ type: [CreateOfflineSaleItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOfflineSaleItemDto)
  items: CreateOfflineSaleItemDto[];
}
