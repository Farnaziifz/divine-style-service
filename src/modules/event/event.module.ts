import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { PaymentModule } from '../payment/payment.module';
import { EventController } from './event.controller';
import { EventPublicController } from './event-public.controller';
import { EventPaymentController } from './event-payment.controller';
import { EventPaymentService } from './event-payment.service';
import { EventSpinService } from './event-spin.service';
import { EventService } from './event.service';

@Module({
  imports: [SharedModule, PaymentModule],
  controllers: [EventController, EventPublicController, EventPaymentController],
  providers: [EventService, EventPaymentService, EventSpinService],
  exports: [EventService],
})
export class EventModule {}
