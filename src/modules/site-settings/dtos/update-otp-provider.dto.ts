import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class UpdateOtpProviderDto {
  @ApiProperty({ enum: ['ussdpanel', 'sms_ir'] })
  @IsString()
  @IsIn(['ussdpanel', 'sms_ir'])
  provider: 'ussdpanel' | 'sms_ir';
}
