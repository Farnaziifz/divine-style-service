import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class SubmitAttemptDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty({ message: 'محصول الزامی است' })
  productId: string;
}
