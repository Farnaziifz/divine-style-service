import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdatePaymentProvidersDto {
  @ApiProperty({
    example: ['ZARINPAL', 'ZIBAL'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['ZARINPAL', 'ZIBAL'], { each: true })
  activeProviders: Array<'ZARINPAL' | 'ZIBAL'>;

  @ApiPropertyOptional({
    example: 'ZARINPAL',
  })
  @IsOptional()
  @IsString()
  @IsIn(['ZARINPAL', 'ZIBAL'])
  defaultProvider?: 'ZARINPAL' | 'ZIBAL';
}
