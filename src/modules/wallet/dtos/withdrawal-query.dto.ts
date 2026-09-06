import { IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class WithdrawalQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ enum: ['PENDING', 'PAID', 'REJECTED'] })
  @IsOptional()
  @IsIn(['PENDING', 'PAID', 'REJECTED'])
  status?: 'PENDING' | 'PAID' | 'REJECTED';
}
