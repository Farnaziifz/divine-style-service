import { IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ContentCalendarRangeDto {
  @ApiProperty({ description: 'شروع بازه (YYYY-MM-DD)' })
  @IsDateString()
  from: string;

  @ApiProperty({ description: 'پایان بازه (YYYY-MM-DD)' })
  @IsDateString()
  to: string;
}
