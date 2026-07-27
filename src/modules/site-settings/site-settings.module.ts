import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { ShippingMethodController } from './shipping-method.controller';
import { OtpProviderController } from './otp-provider.controller';
import { PaymentProvidersController } from './payment-providers.controller';
import { PricingSettingsController } from './pricing-settings.controller';

@Module({
  imports: [SharedModule],
  controllers: [
    ShippingMethodController,
    OtpProviderController,
    PaymentProvidersController,
    PricingSettingsController,
  ],
})
export class SiteSettingsModule {}
