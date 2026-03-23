import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class SendDirectMessageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({
    enum: ['IMAGE', 'AUDIO'],
    description:
      'برای IMAGE تمام فرمت‌های image/* مجاز است (حداکثر ۳ مگابایت). برای AUDIO فقط audio/* مجاز است (حداکثر ۱۰ مگابایت).',
  })
  @IsOptional()
  @IsIn(['IMAGE', 'AUDIO'])
  attachmentType?: 'IMAGE' | 'AUDIO';
}
