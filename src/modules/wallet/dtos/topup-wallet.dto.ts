import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class TopUpWalletDto {
  @ApiProperty({ example: 500000, description: 'مبلغ شارژ به تومان' })
  @Type(() => Number)
  @IsNumber()
  @Min(1000)
  amount: number;

  @ApiPropertyOptional({ enum: ['ZARINPAL', 'ZIBAL'] })
  @IsOptional()
  @IsIn(['ZARINPAL', 'ZIBAL'])
  provider?: 'ZARINPAL' | 'ZIBAL';

  @ApiPropertyOptional({ example: 'fa' })
  @IsOptional()
  @IsString()
  lang?: string;
}
