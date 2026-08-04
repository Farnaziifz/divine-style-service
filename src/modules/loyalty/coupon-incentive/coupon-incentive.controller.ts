import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
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
import { CouponIncentiveService } from './coupon-incentive.service';
import { CouponTriggerService } from './coupon-trigger.service';
import { CreateCouponIncentiveDto } from './dtos/create-coupon-incentive.dto';
import { UpdateCouponIncentiveDto } from './dtos/update-coupon-incentive.dto';
import { CouponIncentiveQueryDto } from './dtos/coupon-incentive-query.dto';
import { OrderCompletedEventDto } from './dtos/order-completed-event.dto';
import { ReferralConfirmedEventDto } from './dtos/referral-confirmed-event.dto';

@ApiTags('Loyalty — Coupon incentives')
@Controller('incentives/coupons')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class CouponIncentiveController {
  constructor(
    private readonly couponIncentiveService: CouponIncentiveService,
    private readonly couponTriggerService: CouponTriggerService,
  ) {}

  private assertCanWrite(req: any) {
    const isAdmin = req.user?.role === 'ADMIN';
    const isOperatorWithPermission =
      req.user?.role === 'OPERATOR' &&
      Array.isArray(req.user?.permissions) &&
      req.user.permissions.includes('LOYALTY_CLUB_MANAGE');
    if (!isAdmin && !isOperatorWithPermission) {
      throw new ForbiddenException();
    }
  }

  @Post()
  @ApiOperation({ summary: 'ایجاد تخفیف نوع کوپن (Incentive)' })
  create(@Req() req: any, @Body() dto: CreateCouponIncentiveDto) {
    this.assertCanWrite(req);
    return this.couponIncentiveService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'لیست تخفیف‌های نوع کوپن (صفحه‌بندی)' })
  findAll(@Req() req: any, @Query() query: CouponIncentiveQueryDto) {
    this.assertCanWrite(req);
    return this.couponIncentiveService.findAll(query);
  }

  @Post('evaluate/order-completed')
  @ApiOperation({
    summary:
      'ارزیابی تریگرهای مبتنی بر سفارش (اولین خرید/مبلغ/دسته) و اعطای خودکار کوپن واجد شرایط',
  })
  evaluateOrderCompleted(@Req() req: any, @Body() dto: OrderCompletedEventDto) {
    this.assertCanWrite(req);
    return this.couponTriggerService.onOrderCompleted(dto.orderId);
  }

  @Post('evaluate/referral-confirmed')
  @ApiOperation({
    summary: 'ارزیابی تریگر REFERRAL و اعطای خودکار کوپن به ارجاع‌دهنده',
  })
  evaluateReferralConfirmed(
    @Req() req: any,
    @Body() dto: ReferralConfirmedEventDto,
  ) {
    this.assertCanWrite(req);
    return this.couponTriggerService.onReferralConfirmed(
      dto.referrerId,
      dto.referredUserId,
      dto.orderId,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'جزئیات یک تخفیف نوع کوپن' })
  @ApiParam({ name: 'id', type: String })
  findOne(@Req() req: any, @Param('id') id: string) {
    this.assertCanWrite(req);
    return this.couponIncentiveService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'ویرایش تخفیف نوع کوپن' })
  @ApiParam({ name: 'id', type: String })
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateCouponIncentiveDto,
  ) {
    this.assertCanWrite(req);
    return this.couponIncentiveService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'غیرفعال‌سازی تخفیف نوع کوپن' })
  @ApiParam({ name: 'id', type: String })
  deactivate(@Req() req: any, @Param('id') id: string) {
    this.assertCanWrite(req);
    return this.couponIncentiveService.deactivate(id);
  }
}
