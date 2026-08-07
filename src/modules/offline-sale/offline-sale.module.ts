import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { OfflineSaleController } from './offline-sale.controller';
import { OfflineSaleService } from './offline-sale.service';

@Module({
  imports: [SharedModule],
  controllers: [OfflineSaleController],
  providers: [OfflineSaleService],
})
export class OfflineSaleModule {}
