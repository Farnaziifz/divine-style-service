import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { PaymentModule } from '../payment/payment.module';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  imports: [SharedModule, PaymentModule],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
