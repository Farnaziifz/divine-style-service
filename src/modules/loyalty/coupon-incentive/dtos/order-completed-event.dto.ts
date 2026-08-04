import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OrderCompletedEventDto {
  @ApiProperty()
  @IsUUID()
  orderId: string;
}
