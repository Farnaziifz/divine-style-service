import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { OrderModule } from '../order/order.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { ReferralModule } from '../referral/referral.module';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { SnappPayService } from './snapp-pay.service';
import { SnappPayController } from './snapp-pay.controller';

@Module({
  imports: [SharedModule, OrderModule, LoyaltyModule, ReferralModule],
  controllers: [PaymentController, SnappPayController],
  providers: [PaymentService, SnappPayService],
  exports: [PaymentService, SnappPayService],
})
export class PaymentModule {}
