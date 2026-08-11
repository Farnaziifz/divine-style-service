import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { CatalogModule } from '../catalog/catalog.module';
import { ShippingMethodController } from './shipping-method.controller';
import { OtpProviderController } from './otp-provider.controller';
import { PaymentProvidersController } from './payment-providers.controller';
import { PricingSettingsController } from './pricing-settings.controller';
import { OrderNotificationPhoneController } from './order-notification-phone.controller';

@Module({
  imports: [SharedModule, CatalogModule],
  controllers: [
    ShippingMethodController,
    OtpProviderController,
    PaymentProvidersController,
    PricingSettingsController,
    OrderNotificationPhoneController,
  ],
})
export class SiteSettingsModule {}
