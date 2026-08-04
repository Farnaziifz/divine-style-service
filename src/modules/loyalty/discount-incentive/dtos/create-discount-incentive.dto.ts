import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IncentiveTierType,
  IncentiveUsageType,
  IncentiveValueType,
} from '@prisma/client';
import { DiscountCodeTierDto } from './discount-code-tier.dto';

export class CreateDiscountIncentiveDto {
  @ApiProperty({ example: 'جشنواره بهار' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ description: 'null = برای همه مشتریان' })
  @IsOptional()
  @IsUUID()
  targetSegmentId?: string;

  @ApiProperty({ example: 'SPRING1404' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ enum: IncentiveValueType })
  @IsEnum(IncentiveValueType)
  valueType: IncentiveValueType;

  @ApiProperty({
    example: 15,
    description: 'وقتی tierType = FLAT، مقدار تخفیف همین است',
  })
  @Type(() => Number)
  @IsNumber()
  value: number;

  @ApiPropertyOptional({
    enum: IncentiveTierType,
    default: IncentiveTierType.FLAT,
  })
  @IsOptional()
  @IsEnum(IncentiveTierType)
  tierType?: IncentiveTierType;

  @ApiPropertyOptional({
    description: 'الزامی وقتی tierType = STEPPED',
    type: [DiscountCodeTierDto],
  })
  @ValidateIf((o) => o.tierType === IncentiveTierType.STEPPED)
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DiscountCodeTierDto)
  tiers?: DiscountCodeTierDto[];

  @ApiPropertyOptional({
    enum: IncentiveUsageType,
    default: IncentiveUsageType.SINGLE_USE,
  })
  @IsOptional()
  @IsEnum(IncentiveUsageType)
  usageType?: IncentiveUsageType;

  @ApiPropertyOptional({ example: 500000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPurchaseAmount?: number;

  @ApiProperty({ example: '2026-03-01T00:00:00.000Z' })
  @IsDateString()
  startsAt: string;

  @ApiProperty({ example: '2026-09-01T23:59:59.999Z' })
  @IsDateString()
  endsAt: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
