import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { DirectController } from './direct.controller';
import { AdminDirectController } from './admin-direct.controller';

@Module({
  imports: [SharedModule],
  controllers: [DirectController, AdminDirectController],
})
export class DirectModule {}
