import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GrantCashbackForOrderDto {
  @ApiProperty()
  @IsUUID()
  orderId: string;
}
