import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty } from 'class-validator';

export class UpdateOfflineSaleDateDto {
  @ApiProperty({ description: 'تاریخ واقعی فروش' })
  @IsNotEmpty()
  @IsDateString()
  soldAt: string;
}
