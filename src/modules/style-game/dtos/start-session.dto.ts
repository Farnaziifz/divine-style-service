import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class StartSessionDto {
  @ApiPropertyOptional({ description: 'کد رویداد (اختیاری)' })
  @IsOptional()
  @IsString()
  eventCode?: string;

  @ApiProperty({ description: 'آدرس عکس آپلودشده (از /upload)' })
  @IsString()
  @IsNotEmpty({ message: 'عکس الزامی است' })
  photoUrl: string;
}
