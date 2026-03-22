import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../shared/dtos/pagination.dto';
import { DiscountCodeScope } from '@prisma/client';

export class DiscountCodeQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: DiscountCodeScope })
  @IsOptional()
  @IsEnum(DiscountCodeScope)
  scope?: DiscountCodeScope;

  @ApiPropertyOptional({ description: 'فیلتر فعال/غیرفعال' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'جستجو در کد یا عنوان' })
  @IsOptional()
  @IsString()
  override search?: string;
}
