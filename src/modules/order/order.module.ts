import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { OrderController } from './order.controller';
import { OrderReservationService } from './order-reservation.service';
import { StockReservationSweeperService } from './stock-reservation-sweeper.service';

@Module({
  imports: [SharedModule],
  controllers: [OrderController],
  providers: [OrderReservationService, StockReservationSweeperService],
  exports: [OrderReservationService],
})
export class OrderModule {}
