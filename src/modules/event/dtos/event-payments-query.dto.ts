import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../shared/dtos/pagination.dto';

export class EventPaymentsQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ['INITIATED', 'PAID', 'FAILED'], description: 'فیلتر وضعیت؛ خالی = همه' })
  @IsOptional()
  @IsIn(['INITIATED', 'PAID', 'FAILED'])
  status?: 'INITIATED' | 'PAID' | 'FAILED';

  @ApiPropertyOptional({ description: 'فقط پرداخت‌های تعیین‌تکلیف‌نشده' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unassignedOnly?: boolean;
}
