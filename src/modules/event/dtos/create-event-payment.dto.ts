import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateEventPaymentDto {
  @ApiProperty({ example: 'ABCD2345' })
  @IsString()
  @IsNotEmpty({ message: 'کد رویداد الزامی است' })
  eventCode: string;

  @ApiProperty({ example: 500000, description: 'مبلغ پرداخت به تومان' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 }, { message: 'مبلغ نامعتبر است' })
  @Min(1000, { message: 'حداقل مبلغ پرداخت ۱٬۰۰۰ تومان است' })
  @Max(500_000_000, { message: 'مبلغ وارد شده بیش از حد مجاز است' })
  amount: number;

  @ApiPropertyOptional({ enum: ['ZARINPAL', 'ZIBAL'] })
  @IsOptional()
  @IsIn(['ZARINPAL', 'ZIBAL'])
  provider?: 'ZARINPAL' | 'ZIBAL';
}
