import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class UpdateSnappPaySettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ example: ['INSTALLMENT'] })
  @IsOptional()
  @IsArray()
  @IsIn(['POSTPAID', 'INSTALLMENT', 'FINANCING'], { each: true })
  forcedPaymentMethodTypes?: Array<'POSTPAID' | 'INSTALLMENT' | 'FINANCING'>;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  commissionType?: number;
}

export class CancelSnappPayDto {
  @ApiProperty({ description: 'Must be true — the admin confirmed this irreversible action' })
  @IsBoolean()
  confirm: boolean;
}

export class UpdateSnappPayItemDto {
  @ApiProperty()
  @IsUUID()
  orderItemId: string;

  @ApiProperty({ description: 'New quantity; 0 removes the item' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity: number;
}

export class UpdateSnappPayOrderDto {
  @ApiProperty()
  @IsBoolean()
  confirm: boolean;

  @ApiProperty({ type: [UpdateSnappPayItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => UpdateSnappPayItemDto)
  items: UpdateSnappPayItemDto[];
}
