import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateSettingsDto {
  @ApiProperty({ description: 'چند روز بعد از آخرین برنامه، محصول دوباره برنامه‌ریزی بشه' })
  @IsInt()
  @Min(1)
  replanIntervalDays: number;
}
