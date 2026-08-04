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
import { CashbackIncentiveService } from './cashback-incentive.service';
import { CashbackGrantService } from './cashback-grant.service';
import { CashbackApplyService } from './cashback-apply.service';
import { CreateCashbackIncentiveDto } from './dtos/create-cashback-incentive.dto';
import { UpdateCashbackIncentiveDto } from './dtos/update-cashback-incentive.dto';
import { CashbackIncentiveQueryDto } from './dtos/cashback-incentive-query.dto';
import { GrantCashbackForOrderDto } from './dtos/grant-cashback-for-order.dto';
import { ApplyCashbackDto } from './dtos/apply-cashback.dto';

@ApiTags('Loyalty — Cashback incentives')
@Controller('incentives/cashback')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class CashbackIncentiveController {
  constructor(
    private readonly cashbackIncentiveService: CashbackIncentiveService,
    private readonly cashbackGrantService: CashbackGrantService,
    private readonly cashbackApplyService: CashbackApplyService,
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
  @ApiOperation({ summary: 'ایجاد تخفیف نوع کش‌بک (Incentive)' })
  create(@Req() req: any, @Body() dto: CreateCashbackIncentiveDto) {
    this.assertCanWrite(req);
    return this.cashbackIncentiveService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'لیست تخفیف‌های نوع کش‌بک (صفحه‌بندی)' })
  findAll(@Req() req: any, @Query() query: CashbackIncentiveQueryDto) {
    this.assertCanWrite(req);
    return this.cashbackIncentiveService.findAll(query);
  }

  @Post('grant-for-order')
  @ApiOperation({
    summary: 'اعطای کش‌بک واجد شرایط برای یک سفارش پرداخت‌شده (idempotent)',
  })
  grantForOrder(@Req() req: any, @Body() dto: GrantCashbackForOrderDto) {
    this.assertCanWrite(req);
    return this.cashbackGrantService.grantForOrder(dto.orderId);
  }

  @Post('apply')
  @ApiOperation({
    summary: 'اعمال اعتبار کش‌بک موجود (منقضی‌نشده) روی یک سفارش',
  })
  apply(@Body() dto: ApplyCashbackDto) {
    return this.cashbackApplyService.apply(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'جزئیات یک تخفیف نوع کش‌بک' })
  @ApiParam({ name: 'id', type: String })
  findOne(@Req() req: any, @Param('id') id: string) {
    this.assertCanWrite(req);
    return this.cashbackIncentiveService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'ویرایش تخفیف نوع کش‌بک' })
  @ApiParam({ name: 'id', type: String })
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateCashbackIncentiveDto,
  ) {
    this.assertCanWrite(req);
    return this.cashbackIncentiveService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'غیرفعال‌سازی تخفیف نوع کش‌بک' })
  @ApiParam({ name: 'id', type: String })
  deactivate(@Req() req: any, @Param('id') id: string) {
    this.assertCanWrite(req);
    return this.cashbackIncentiveService.deactivate(id);
  }
}
