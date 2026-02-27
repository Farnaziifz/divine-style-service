import { Module } from '@nestjs/common';
import { CollectionService } from './application/services/collection.service';
import { CollectionController } from './presentation/controllers/collection.controller';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [CollectionController],
  providers: [CollectionService],
})
export class CollectionModule {}
