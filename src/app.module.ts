import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SharedModule } from './modules/shared/shared.module';
import { UserModule } from './modules/user/user.module';
import { CategoryModule } from './modules/category/category.module';
import { CollectionModule } from './modules/collection/collection.module';
import { ProductModule } from './modules/product/product.module';
import { SpecificationModule } from './modules/specification/specification.module';

@Module({
  imports: [
    SharedModule,
    UserModule,
    CategoryModule,
    CollectionModule,
    ProductModule,
    SpecificationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
