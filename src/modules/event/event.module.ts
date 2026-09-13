import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { EventController } from './event.controller';
import { EventPublicController } from './event-public.controller';
import { EventService } from './event.service';

@Module({
  imports: [SharedModule],
  controllers: [EventController, EventPublicController],
  providers: [EventService],
  exports: [EventService],
})
export class EventModule {}
