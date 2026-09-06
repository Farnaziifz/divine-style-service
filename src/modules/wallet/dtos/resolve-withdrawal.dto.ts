import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ResolveWithdrawalDto {
  @ApiProperty({ enum: ['PAID', 'REJECTED'] })
  @IsIn(['PAID', 'REJECTED'])
  action: 'PAID' | 'REJECTED';

  @ApiPropertyOptional({ example: 'واریز شد - پیگیری ۱۲۳۴۵۶' })
  @IsOptional()
  @IsString()
  adminNote?: string;
}
