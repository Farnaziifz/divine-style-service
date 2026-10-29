import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { EventService } from './event.service';
import { EventPaymentService } from './event-payment.service';
import { AssignEventPaymentItemsDto } from './dtos/assign-event-payment-items.dto';
import { EventPaymentsQueryDto } from './dtos/event-payments-query.dto';
import { CreateEventDto } from './dtos/create-event.dto';
import { UpdateEventDto } from './dtos/update-event.dto';
import { EventQueryDto } from './dtos/event-query.dto';
import { UpdateEventImageDto } from './dtos/update-event-image.dto';

@ApiTags('Events')
@Controller('events')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class EventController {
  constructor(
    private readonly eventService: EventService,
    private readonly eventPaymentService: EventPaymentService,
  ) {}

  private assertCanWrite(req: any) {
    const isAdmin = req.user?.role === 'ADMIN';
    const isOperatorWithPermission =
      req.user?.role === 'OPERATOR' &&
      Array.isArray(req.user?.permissions) &&
      req.user.permissions.includes('EVENTS_WRITE');
    if (!isAdmin && !isOperatorWithPermission) {
      throw new ForbiddenException();
    }
  }

  @Post()
  @ApiOperation({ summary: 'ایجاد رویداد' })
  create(@Req() req: any, @Body() dto: CreateEventDto) {
    this.assertCanWrite(req);
    return this.eventService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'لیست رویدادها (صفحه‌بندی)' })
  findAll(@Req() req: any, @Query() query: EventQueryDto) {
    this.assertCanWrite(req);
    return this.eventService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'جزئیات یک رویداد' })
  @ApiParam({ name: 'id', type: String })
  findOne(@Req() req: any, @Param('id') id: string) {
    this.assertCanWrite(req);
    return this.eventService.findOne(id);
  }

  @Get(':id/payments')
  @ApiOperation({ summary: 'تراکنش‌های رویداد (همه وضعیت‌ها) به‌همراه اقلام تعیین‌تکلیف‌شده' })
  @ApiParam({ name: 'id', type: String })
  listPayments(@Req() req: any, @Param('id') id: string, @Query() query: EventPaymentsQueryDto) {
    this.assertCanWrite(req);
    return this.eventPaymentService.listForEvent(id, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      unassignedOnly: query.unassignedOnly,
    });
  }

  @Put(':id/payments/:paymentId/items')
  @ApiOperation({ summary: 'تعیین تکلیف پرداخت: ثبت اقلام خریداری‌شده و کسر خودکار موجودی' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'paymentId', type: String })
  assignPaymentItems(
    @Req() req: any,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: AssignEventPaymentItemsDto,
  ) {
    this.assertCanWrite(req);
    return this.eventPaymentService.assignItems(id, paymentId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'ویرایش رویداد' })
  @ApiParam({ name: 'id', type: String })
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateEventDto) {
    this.assertCanWrite(req);
    return this.eventService.update(id, dto);
  }

  @Patch(':id/logo-image')
  @ApiOperation({ summary: 'ویرایش لوگوی رویداد' })
  @ApiParam({ name: 'id', type: String })
  updateLogoImage(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateEventImageDto,
  ) {
    this.assertCanWrite(req);
    return this.eventService.updateLogoImage(id, dto.url ?? null);
  }

  @Patch(':id/banner-image')
  @ApiOperation({ summary: 'ویرایش بنر رویداد' })
  @ApiParam({ name: 'id', type: String })
  updateBannerImage(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateEventImageDto,
  ) {
    this.assertCanWrite(req);
    return this.eventService.updateBannerImage(id, dto.url ?? null);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'حذف نرم رویداد' })
  @ApiParam({ name: 'id', type: String })
  remove(@Req() req: any, @Param('id') id: string) {
    this.assertCanWrite(req);
    return this.eventService.remove(id);
  }
}
