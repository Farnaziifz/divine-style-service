import { IsNotEmpty, IsNumber, IsString, Matches, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class RequestWithdrawalDto {
  @ApiProperty({ example: 200000, description: 'مبلغ درخواستی برداشت به تومان' })
  @Type(() => Number)
  @IsNumber()
  @Min(1000)
  amount: number;

  @ApiProperty({ example: '6037-9911-2233-4455' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[\d-]{16,26}$/, { message: 'شماره کارت یا شبا معتبر نیست' })
  cardNumber: string;
}
