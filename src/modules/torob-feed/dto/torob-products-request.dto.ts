import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export const TOROB_SORT_VALUES = ['date_added_desc', 'date_updated_desc'] as const;
export type TorobSort = (typeof TOROB_SORT_VALUES)[number];

/**
 * درخواست ترب دقیقا یکی از سه حالت را دارد: page_urls | page_uniques | (page + sort).
 * چون این یک XOR بین گروه‌هاست، اعتبارسنجی دقیق در TorobFeedService انجام می‌شود
 * نه با دکوریتورهای class-validator.
 */
export class TorobProductsRequestDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  page_urls?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  page_uniques?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ enum: TOROB_SORT_VALUES })
  @IsOptional()
  @IsIn(TOROB_SORT_VALUES)
  sort?: TorobSort;
}
