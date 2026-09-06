import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { ReferralController } from './referral.controller';
import { ReferralPublicController } from './referral-public.controller';
import { ReferralService } from './referral.service';
import { ReferralCashbackService } from './referral-cashback.service';

@Module({
  imports: [SharedModule],
  controllers: [ReferralController, ReferralPublicController],
  providers: [ReferralService, ReferralCashbackService],
  exports: [ReferralService, ReferralCashbackService],
})
export class ReferralModule {}
