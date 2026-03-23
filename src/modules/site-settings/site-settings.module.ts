import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { ShippingMethodController } from './shipping-method.controller';

@Module({
  imports: [SharedModule],
  controllers: [ShippingMethodController],
})
export class SiteSettingsModule {}
