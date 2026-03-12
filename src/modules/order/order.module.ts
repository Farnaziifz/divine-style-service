import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { OrderController } from './order.controller';

@Module({
  imports: [SharedModule],
  controllers: [OrderController],
})
export class OrderModule {}
