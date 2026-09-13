import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { EventService } from './event.service';

@ApiTags('Events')
@Controller('events/public')
export class EventPublicController {
  constructor(private readonly eventService: EventService) {}

  @Get(':eventCode')
  @ApiOperation({
    summary: 'اطلاعات عمومی رویداد برای لندینگ — بدون نیاز به لاگین',
  })
  @ApiParam({ name: 'eventCode', type: String })
  async getByCode(@Param('eventCode') eventCode: string) {
    const event = await this.eventService.findActiveByCode(eventCode);
    return {
      eventCode: event.eventCode,
      name: event.name,
      startDate: event.startDate,
      endDate: event.endDate,
      logoImageUrl: event.logoImageUrl,
      bannerImageUrl: event.bannerImageUrl,
    };
  }
}
