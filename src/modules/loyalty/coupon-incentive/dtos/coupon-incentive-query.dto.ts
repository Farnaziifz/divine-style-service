import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { CouponTriggerType } from '@prisma/client';
import { PaginationDto } from '../../../shared/dtos/pagination.dto';

export class CouponIncentiveQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'فیلتر فعال/غیرفعال' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'فیلتر بر اساس سگمنت هدف' })
  @IsOptional()
  @IsUUID()
  targetSegmentId?: string;

  @ApiPropertyOptional({ enum: CouponTriggerType })
  @IsOptional()
  @IsEnum(CouponTriggerType)
  triggerType?: CouponTriggerType;
}
