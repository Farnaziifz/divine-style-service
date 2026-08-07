import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SharedModule } from './modules/shared/shared.module';
import { UserModule } from './modules/user/user.module';
import { AuthModule } from './modules/auth/auth.module';
import { UploadModule } from './modules/upload/upload.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { OrderModule } from './modules/order/order.module';
import { OfflineSaleModule } from './modules/offline-sale/offline-sale.module';
import { ShoppingListModule } from './modules/shopping-list/shopping-list.module';
import { DiscountModule } from './modules/discount/discount.module';
import { PaymentModule } from './modules/payment/payment.module';
import { SiteSettingsModule } from './modules/site-settings/site-settings.module';
import { DirectModule } from './modules/direct/direct.module';
import { BlogModule } from './modules/blog/blog.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ContentCalendarModule } from './modules/content-calendar/content-calendar.module';
import { CustomerGroupModule } from './modules/customer-group/customer-group.module';
import { LoyaltyModule } from './modules/loyalty/loyalty.module';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60_000,
          limit: 120,
        },
      ],
    }),
    ScheduleModule.forRoot(),
    SharedModule,
    AuthModule,
    UserModule,
    CatalogModule,
    UploadModule,
    OrderModule,
    OfflineSaleModule,
    ShoppingListModule,
    DiscountModule,
    PaymentModule,
    SiteSettingsModule,
    DirectModule,
    BlogModule,
    ReportsModule,
    ContentCalendarModule,
    CustomerGroupModule,
    LoyaltyModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
