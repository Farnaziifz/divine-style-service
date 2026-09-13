import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateEventDto } from './create-event.dto';

export class UpdateEventDto extends PartialType(CreateEventDto) {
  @ApiPropertyOptional({ description: 'فعال/غیرفعال بودن رویداد' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
