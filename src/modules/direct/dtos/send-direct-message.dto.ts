import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class SendDirectMessageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({ enum: ['IMAGE', 'AUDIO'] })
  @IsOptional()
  @IsIn(['IMAGE', 'AUDIO'])
  attachmentType?: 'IMAGE' | 'AUDIO';
}
