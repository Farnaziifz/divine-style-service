import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
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

  @ApiProperty({
    example: '12345',
    description: 'کد تایید ۵ رقمی',
  })
  @IsString()
  @IsNotEmpty()
  @Length(5, 5, { message: 'کد تایید باید ۵ رقم باشد' })
  code: string;
}
