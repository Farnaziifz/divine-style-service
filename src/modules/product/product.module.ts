import { Module } from '@nestjs/common';
import { ProductService } from './application/services/product.service';
import { ProductController } from './presentation/controllers/product.controller';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [ProductController],
  providers: [ProductService],
})
export class ProductModule {}
