import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ReferralService } from './referral.service';

@ApiTags('Referral codes')
@Controller('referral-codes/public')
export class ReferralPublicController {
  constructor(private readonly referralService: ReferralService) {}

  @Get(':code')
  @ApiOperation({
    summary: 'اطلاعات عمومی کد ریفرال برای بنر سایت — بدون نیاز به لاگین',
  })
  @ApiParam({ name: 'code', type: String })
  async lookup(@Param('code') code: string) {
    const result = await this.referralService.lookupPublic(code);
    if (!result) return { valid: false };
    return { valid: true, ...result };
  }
}
