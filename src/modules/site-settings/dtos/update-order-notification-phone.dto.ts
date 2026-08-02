import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateOrderNotificationPhoneDto {
  @ApiPropertyOptional({ example: '09121234567' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'شماره موبایل الزامی است' })
  @Matches(/^09[0-9]{9}$/, { message: 'فرمت شماره موبایل صحیح نیست' })
  phoneNumber?: string;

  @ApiPropertyOptional({ example: 'مدیر فروش' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'برچسب حداکثر ۱۰۰ کاراکتر باشد' })
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
