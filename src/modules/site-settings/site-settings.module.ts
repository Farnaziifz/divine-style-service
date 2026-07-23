import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { ShippingMethodController } from './shipping-method.controller';
import { OtpProviderController } from './otp-provider.controller';
import { PaymentProvidersController } from './payment-providers.controller';

@Module({
  imports: [SharedModule],
  controllers: [
    ShippingMethodController,
    OtpProviderController,
    PaymentProvidersController,
  ],
})
export class SiteSettingsModule {}
