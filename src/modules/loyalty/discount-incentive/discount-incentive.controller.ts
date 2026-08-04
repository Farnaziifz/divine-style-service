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
import { DiscountIncentiveService } from './discount-incentive.service';
import { DiscountRedemptionService } from './discount-redemption.service';
import { CreateDiscountIncentiveDto } from './dtos/create-discount-incentive.dto';
import { UpdateDiscountIncentiveDto } from './dtos/update-discount-incentive.dto';
import { DiscountIncentiveQueryDto } from './dtos/discount-incentive-query.dto';
import { RedeemDiscountCodeDto } from './dtos/redeem-discount-code.dto';

@ApiTags('Loyalty — Discount code incentives')
@Controller('incentives/discount-codes')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class DiscountIncentiveController {
  constructor(
    private readonly discountIncentiveService: DiscountIncentiveService,
    private readonly discountRedemptionService: DiscountRedemptionService,
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
  @ApiOperation({ summary: 'ایجاد تخفیف نوع کد تخفیف (Incentive)' })
  create(@Req() req: any, @Body() dto: CreateDiscountIncentiveDto) {
    this.assertCanWrite(req);
    return this.discountIncentiveService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'لیست تخفیف‌های نوع کد تخفیف (صفحه‌بندی)' })
  findAll(@Req() req: any, @Query() query: DiscountIncentiveQueryDto) {
    this.assertCanWrite(req);
    return this.discountIncentiveService.findAll(query);
  }

  @Post('redeem')
  @ApiOperation({ summary: 'اعتبارسنجی و ریدیم کد تخفیف برای یک مشتری' })
  redeem(@Body() dto: RedeemDiscountCodeDto) {
    return this.discountRedemptionService.redeem(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'جزئیات یک تخفیف نوع کد تخفیف' })
  @ApiParam({ name: 'id', type: String })
  findOne(@Req() req: any, @Param('id') id: string) {
    this.assertCanWrite(req);
    return this.discountIncentiveService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'ویرایش تخفیف نوع کد تخفیف' })
  @ApiParam({ name: 'id', type: String })
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateDiscountIncentiveDto,
  ) {
    this.assertCanWrite(req);
    return this.discountIncentiveService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'غیرفعال‌سازی تخفیف نوع کد تخفیف' })
  @ApiParam({ name: 'id', type: String })
  deactivate(@Req() req: any, @Param('id') id: string) {
    this.assertCanWrite(req);
    return this.discountIncentiveService.deactivate(id);
  }
}
