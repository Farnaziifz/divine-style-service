import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendOtpDto {
  @ApiProperty({
    example: '09123456789',
    description: 'شماره موبایل کاربر',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^09\d{9}$/, {
    message: 'شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود',
  })
  mobile: string;
}
