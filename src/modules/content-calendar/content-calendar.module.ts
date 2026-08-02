import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { ContentCalendarController } from './content-calendar.controller';
import { ContentCalendarService } from './content-calendar.service';
import { ContentCalendarSweeperService } from './content-calendar-sweeper.service';

@Module({
  imports: [SharedModule],
  controllers: [ContentCalendarController],
  providers: [ContentCalendarService, ContentCalendarSweeperService],
  exports: [ContentCalendarService],
})
export class ContentCalendarModule {}
