import { Module } from '@nestjs/common';
import { CategoryService } from './application/services/category.service';
import { CategoryController } from './presentation/controllers/category.controller';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [CategoryController],
  providers: [CategoryService],
  exports: [CategoryService],
})
export class CategoryModule {}
