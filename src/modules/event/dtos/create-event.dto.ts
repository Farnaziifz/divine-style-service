import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class CreateEventDto {
  @ApiProperty({ example: 'جشنواره تابستانه' })
  @IsString()
  @IsNotEmpty({ message: 'نام رویداد الزامی است' })
  name: string;

  @ApiProperty({ example: '2026-06-01' })
  @IsDateString({}, { message: 'تاریخ شروع رویداد نامعتبر است' })
  startDate: string;

  @ApiProperty({ example: '2026-06-03' })
  @IsDateString({}, { message: 'تاریخ پایان رویداد نامعتبر است' })
  endDate: string;
}
