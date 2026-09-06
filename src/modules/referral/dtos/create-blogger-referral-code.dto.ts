import { IsNotEmpty, IsNumber, IsString, Matches, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateBloggerReferralCodeDto {
  @ApiProperty({ example: '09121234567' })
  @IsString()
  @Matches(/^09\d{9}$/, { message: 'شماره موبایل معتبر نیست' })
  mobile: string;

  @ApiProperty({ example: 'سارا محمدی' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 10 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(20)
  discountPercent: number;

  @ApiProperty({ example: 5 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(20)
  cashbackPercent: number;
}
