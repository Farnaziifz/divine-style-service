import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { OrderModule } from '../order/order.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { DiscountModule } from '../discount/discount.module';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';

@Module({
  imports: [SharedModule, OrderModule, LoyaltyModule, DiscountModule],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
