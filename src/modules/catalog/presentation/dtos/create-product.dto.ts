import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  IsObject,
  IsUUID,
  IsBoolean,
  IsInt,
  IsNumber,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { CreateProductVariantDto } from './create-product-variant.dto';

export class CreateProductDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsUUID()
  categoryId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  collectionIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  specifications?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  metaTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  metaDescription?: string;

  @ApiProperty()
  @IsArray()
  @IsString({ each: true })
  images: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductVariantDto)
  variants?: CreateProductVariantDto[];

  @ApiPropertyOptional({ description: 'محصول منتخب' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ description: 'نمایش در اینترو' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  showInIntro?: boolean;

  @ApiPropertyOptional({ description: 'نمایش در رگال دسته‌بندی (حداکثر ۷ محصول به ازای هر دسته‌بندی)' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  showInRack?: boolean;

  @ApiProperty({ description: 'بهای تمام‌شدهٔ خالص (ورودی ادمین، برای محاسبهٔ قیمت نهایی)' })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costPrice: number;

  @ApiPropertyOptional({
    description: 'ضریب سود این محصول (اگر ندهید، ضریب سود دسته‌بندی به‌عنوان مقدار پیش‌فرض استفاده می‌شود)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  profitMultiplier?: number;

  @ApiPropertyOptional({ description: 'تخفیف دستی روی قیمت نهایی (مبلغ)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountPrice?: number;

  @ApiPropertyOptional({ description: 'تخفیف دستی روی قیمت نهایی (درصد)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  discountPercent?: number;
}
