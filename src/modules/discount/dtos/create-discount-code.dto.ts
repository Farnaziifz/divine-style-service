import {
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
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { DiscountCodeScope, DiscountValueType } from '@prisma/client';

export class CreateDiscountCodeDto {
  @ApiProperty({
    example: 'SUMMER1404',
    description: 'کد یکتا (به صورت خودکار uppercase می‌شود)',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({ example: 'تخفیف تابستان' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ enum: DiscountCodeScope })
  @IsEnum(DiscountCodeScope)
  scope: DiscountCodeScope;

  @ApiPropertyOptional({
    description: 'الزامی وقتی scope = SINGLE_USER',
  })
  @ValidateIf((o) => o.scope === DiscountCodeScope.SINGLE_USER)
  @IsNotEmpty()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({
    description: 'الزامی وقتی scope = USER_GROUP (منطق گروه بعداً)',
  })
  @ValidateIf((o) => o.scope === DiscountCodeScope.USER_GROUP)
  @IsNotEmpty()
  @IsUUID()
  userGroupId?: string;

  @ApiProperty({ enum: DiscountValueType })
  @IsEnum(DiscountValueType)
  valueType: DiscountValueType;

  @ApiProperty({
    example: 15,
    description: 'درصد (۱–۱۰۰) یا مبلغ ثابت تخفیف',
  })
  @Type(() => Number)
  @IsNumber()
  value: number;

  @ApiPropertyOptional({
    example: 500000,
    description: 'حداقل مبلغ سبد برای اعمال کد',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @ApiProperty({ example: '2026-03-01T00:00:00.000Z' })
  @IsDateString()
  validFrom: string;

  @ApiProperty({ example: '2026-09-01T23:59:59.999Z' })
  @IsDateString()
  validTo: string;

  @ApiPropertyOptional({
    description: 'حداکثر تعداد استفاده در کل (خالی = نامحدود)',
    example: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  maxTotalUses?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
