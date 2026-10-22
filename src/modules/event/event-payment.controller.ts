import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { EventPaymentService } from './event-payment.service';
import { EventSpinService } from './event-spin.service';
import { CreateEventPaymentDto } from './dtos/create-event-payment.dto';

@ApiTags('Event Payments')
@Controller('event-payments')
export class EventPaymentController {
  constructor(
    private readonly eventPaymentService: EventPaymentService,
    private readonly eventSpinService: EventSpinService,
  ) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'شروع پرداخت مبلغ دلخواه در یک رویداد' })
  create(@Req() req: any, @Body() dto: CreateEventPaymentDto) {
    return this.eventPaymentService.create(req.user.id, dto);
  }

  @Get('zarinpal/callback')
  @ApiOperation({ summary: 'Zarinpal callback (event payment)' })
  async zarinpalCallback(
    @Query('Authority') authority: string,
    @Query('Status') status: string,
    @Res() res: Response,
  ) {
    const redirect = await this.eventPaymentService.verifyCallback('ZARINPAL', authority, status);
    return res.redirect(redirect);
  }

  @Get('zibal/callback')
  @ApiOperation({ summary: 'Zibal callback (event payment)' })
  async zibalCallback(@Query('trackId') trackId: string, @Res() res: Response) {
    const redirect = await this.eventPaymentService.verifyCallback('ZIBAL', trackId);
    return res.redirect(redirect);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'وضعیت پرداخت من' })
  @ApiParam({ name: 'id', type: String })
  findMine(@Req() req: any, @Param('id') id: string) {
    return this.eventPaymentService.findMine(req.user.id, id);
  }

  @Post(':id/spin')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'چرخاندن چرخ‌گردون بعد از پرداخت موفق (یک بار برای هر پرداخت)' })
  @ApiParam({ name: 'id', type: String })
  spin(@Req() req: any, @Param('id') id: string) {
    return this.eventSpinService.spin(req.user.id, id);
  }
}
