import {
  BadRequestException,
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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../shared/prisma/prisma.service';
import {
  CancelSnappPayDto,
  UpdateSnappPaySettingsDto,
  UpdateSnappPayOrderDto,
} from './dtos/snapp-pay.dto';
import { SnappPayService } from './snapp-pay.service';
import { orderSettleLockKey } from '../order/reservation.constants';

@ApiTags('Payment')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('payments/snapppay')
export class SnappPayController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snappPay: SnappPayService,
  ) {}

  private hasPermission(user: any, permission: string) {
    return Array.isArray(user?.permissions) && user.permissions.includes(permission);
  }

  private assertCanManageSettings(req: any) {
    const ok =
      req.user?.role === 'ADMIN' ||
      (req.user?.role === 'OPERATOR' &&
        this.hasPermission(req.user, 'SITE_SETTINGS_MANAGE'));
    if (!ok) throw new ForbiddenException();
  }

  private assertCanReadOrders(req: any) {
    const ok =
      req.user?.role === 'ADMIN' ||
      (req.user?.role === 'OPERATOR' && this.hasPermission(req.user, 'ORDERS_READ'));
    if (!ok) throw new ForbiddenException();
  }

  private assertCanWriteOrders(req: any) {
    const ok =
      req.user?.role === 'ADMIN' ||
      (req.user?.role === 'OPERATOR' && this.hasPermission(req.user, 'ORDERS_WRITE'));
    if (!ok) throw new ForbiddenException();
  }

  // ---------------------------------------------------------------- shopper

  /**
   * Shown at checkout. Per the Snapp Pay rules the answer — including the
   * title/description text — must be shown exactly as returned, and asked
   * again whenever the amount changes; nothing is cached or hard-coded here.
   */
  @Get('eligible')
  @ApiOperation({ summary: 'Is Snapp Pay available for this amount (Toman)?' })
  async eligible(@Query('amount') amountRaw: string) {
    const amountToman = Math.round(Number(amountRaw));
    const settings = await this.snappPay.getSettings();
    if (!settings.enabled || !Number.isFinite(amountToman) || amountToman <= 0) {
      return { enabled: settings.enabled, eligible: false };
    }
    try {
      const res = await this.snappPay.checkEligibility({
        amountRial: amountToman * 10,
        paymentMethodTypes: settings.forcedPaymentMethodTypes,
      });
      return {
        enabled: true,
        eligible: Boolean(res?.eligible),
        title: res?.title_message ?? null,
        description: res?.description ?? null,
      };
    } catch {
      // A Snapp outage must never break checkout — just hide the option.
      return { enabled: true, eligible: false };
    }
  }

  // ------------------------------------------------------------------ admin

  @Get('admin/settings')
  @ApiOperation({ summary: 'Admin: Snapp Pay settings + config health' })
  async getSettings(@Req() req: any) {
    this.assertCanManageSettings(req);
    const [settings, status] = await Promise.all([
      this.snappPay.getSettings(),
      Promise.resolve(this.snappPay.getConfigStatus()),
    ]);
    return { settings, status, configured: this.snappPay.isConfigured() };
  }

  @Patch('admin/settings')
  @ApiOperation({ summary: 'Admin: update Snapp Pay settings' })
  async updateSettings(@Req() req: any, @Body() dto: UpdateSnappPaySettingsDto) {
    this.assertCanManageSettings(req);
    if (dto.enabled && !this.snappPay.isMockMode() && !this.snappPay.isConfigured()) {
      throw new BadRequestException(
        'ابتدا اطلاعات اتصال اسنپ‌پی (Client ID / Secret / Username / Password) را روی سرور تنظیم کنید',
      );
    }
    const current = await this.snappPay.getSettings();
    const settings = await this.snappPay.saveSettings({
      enabled: dto.enabled ?? current.enabled,
      forcedPaymentMethodTypes:
        dto.forcedPaymentMethodTypes ?? current.forcedPaymentMethodTypes,
      commissionType: dto.commissionType ?? current.commissionType,
    });
    return { settings };
  }

  @Post('admin/test-connection')
  @ApiOperation({ summary: 'Admin: check credentials + IP whitelist by fetching a token' })
  async testConnection(@Req() req: any) {
    this.assertCanManageSettings(req);
    try {
      return await this.snappPay.testConnection();
    } catch (e: any) {
      return { ok: false, mock: false, message: e?.message ?? 'خطا در اتصال' };
    }
  }

  @Get('admin/server-ip')
  @ApiOperation({ summary: 'Admin: this server\'s public IP (the one to give Snapp Pay to whitelist)' })
  async serverIp(@Req() req: any) {
    this.assertCanManageSettings(req);
    try {
      const res = await fetch('https://api.ipify.org?format=json', {
        signal: AbortSignal.timeout(5000),
      });
      const json: any = await res.json();
      return { ip: json?.ip ?? null };
    } catch {
      return { ip: null };
    }
  }

  @Get('admin/eligibility-test')
  @ApiOperation({ summary: 'Admin: try the eligible API for an amount (Toman)' })
  async eligibilityTest(@Req() req: any, @Query('amount') amountRaw: string) {
    this.assertCanManageSettings(req);
    const amountToman = Math.round(Number(amountRaw));
    if (!Number.isFinite(amountToman) || amountToman <= 0) {
      throw new BadRequestException('مبلغ نامعتبر است');
    }
    const settings = await this.snappPay.getSettings();
    try {
      const res = await this.snappPay.checkEligibility({
        amountRial: amountToman * 10,
        paymentMethodTypes: settings.forcedPaymentMethodTypes,
      });
      return { ok: true, ...res };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? 'خطا در استعلام' };
    }
  }

  // ----------------------------------------------------- per-transaction ops

  private async loadSnappTransaction(paymentTransactionId: string) {
    const tx = await this.prisma.paymentTransaction.findFirst({
      where: { id: paymentTransactionId, provider: 'SNAPPPAY', isDeleted: false },
      include: {
        order: {
          include: {
            items: {
              where: { isDeleted: false },
              orderBy: { id: 'asc' },
              include: {
                product: { select: { category: { select: { title: true } } } },
              },
            },
          },
        },
      },
    });
    if (!tx || !tx.order) throw new BadRequestException('تراکنش اسنپ‌پی پیدا نشد');
    if (!tx.authority) throw new BadRequestException('این تراکنش توکن اسنپ‌پی ندارد');
    return tx as typeof tx & { order: NonNullable<typeof tx.order>; authority: string };
  }

  @Get(':paymentTransactionId/status')
  @ApiOperation({ summary: 'Admin: live Snapp Pay status of a transaction' })
  async remoteStatus(
    @Req() req: any,
    @Param('paymentTransactionId') paymentTransactionId: string,
  ) {
    this.assertCanReadOrders(req);
    const tx = await this.loadSnappTransaction(paymentTransactionId);
    const status = await this.snappPay.getStatus(tx.authority);
    if (status.status !== tx.gatewayStatus) {
      await this.prisma.paymentTransaction.update({
        where: { id: tx.id },
        data: { gatewayStatus: status.status },
      });
    }
    return status;
  }

  /**
   * Cancel after settle. Irreversible on Snapp's side, so the client must send
   * `confirm: true` after showing the admin a confirmation dialog (docs ask
   * for explicit admin approval before this call).
   */
  @Post(':paymentTransactionId/cancel')
  @ApiOperation({ summary: 'Admin: cancel a settled Snapp Pay purchase (irreversible)' })
  async cancel(
    @Req() req: any,
    @Param('paymentTransactionId') paymentTransactionId: string,
    @Body() dto: CancelSnappPayDto,
  ) {
    this.assertCanWriteOrders(req);
    if (dto.confirm !== true) {
      throw new BadRequestException('لغو اسنپ‌پی نیازمند تأیید صریح ادمین است');
    }
    const tx = await this.loadSnappTransaction(paymentTransactionId);
    if (tx.status !== 'PAID') {
      throw new BadRequestException('فقط تراکنش‌های پرداخت‌شده قابل لغو هستند');
    }
    if (tx.gatewayStatus === 'CANCEL') {
      throw new BadRequestException('این تراکنش قبلاً لغو شده است');
    }

    await this.snappPay.cancel(tx.authority);

    await this.prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orderSettleLockKey(tx.orderId)}))`;
      await db.paymentTransaction.update({
        where: { id: tx.id },
        data: { gatewayStatus: 'CANCEL' },
      });
      await db.order.update({
        where: { id: tx.orderId },
        data: { orderStatus: 'CANCELED' },
      });
    });

    return { gatewayStatus: 'CANCEL', orderStatus: 'CANCELED' };
  }

  /**
   * Lower the amount of a settled purchase (e.g. one item out of stock). The
   * admin gives the new quantity for each order item; 0 removes it. Snapp
   * requires the new amount to be lower than the current one.
   */
  @Post(':paymentTransactionId/update')
  @ApiOperation({ summary: 'Admin: reduce a settled Snapp Pay purchase (irreversible)' })
  async update(
    @Req() req: any,
    @Param('paymentTransactionId') paymentTransactionId: string,
    @Body() dto: UpdateSnappPayOrderDto,
  ) {
    this.assertCanWriteOrders(req);
    if (dto.confirm !== true) {
      throw new BadRequestException('ویرایش مبلغ اسنپ‌پی نیازمند تأیید صریح ادمین است');
    }
    const tx = await this.loadSnappTransaction(paymentTransactionId);
    if (tx.status !== 'PAID' || tx.gatewayStatus === 'CANCEL') {
      throw new BadRequestException('این تراکنش قابل ویرایش نیست');
    }

    const order = tx.order;
    const newQty = new Map(dto.items.map((i) => [i.orderItemId, i.quantity]));
    for (const [id, qty] of newQty) {
      const item = order.items.find((i) => i.id === id);
      if (!item) throw new BadRequestException('آیتم سفارش پیدا نشد');
      if (qty > item.quantity) {
        throw new BadRequestException('تعداد جدید نمی‌تواند بیشتر از تعداد فعلی باشد');
      }
    }

    const unit = (i: (typeof order.items)[number]) =>
      Number(i.unitDiscountPrice ?? i.unitPrice);
    const nextItems = order.items
      .map((i) => ({ ...i, quantity: newQty.get(i.id) ?? i.quantity }))
      .filter((i) => i.quantity > 0);
    if (nextItems.length === 0) {
      throw new BadRequestException('برای حذف همهٔ آیتم‌ها از «لغو» استفاده کنید');
    }

    const oldSubtotal = order.items.reduce((s, i) => s + unit(i) * i.quantity, 0);
    const newSubtotal = nextItems.reduce((s, i) => s + unit(i) * i.quantity, 0);
    const reduction = oldSubtotal - newSubtotal;
    if (reduction <= 0) {
      throw new BadRequestException('مبلغ جدید باید کمتر از مبلغ فعلی باشد');
    }
    const newPayable = Number(order.payableAmount) - reduction;
    if (newPayable <= 0) {
      throw new BadRequestException(
        'مبلغ جدید صفر یا منفی می‌شود؛ برای این حالت از «لغو» استفاده کنید',
      );
    }

    const settings = await this.snappPay.getSettings();
    const payload = this.snappPay.buildOrderPayload(
      {
        ...order,
        totalAmount: newSubtotal,
        payableAmount: newPayable,
        items: nextItems.map((i) => ({
          ...i,
          categoryTitle: i.product?.category?.title ?? null,
        })),
      },
      settings.commissionType,
    );

    await this.snappPay.update(tx.authority, payload);

    await this.prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orderSettleLockKey(tx.orderId)}))`;
      for (const item of order.items) {
        const qty = newQty.get(item.id);
        if (qty === undefined || qty === item.quantity) continue;
        await db.orderItem.update({
          where: { id: item.id },
          data:
            qty === 0
              ? { quantity: 0, isDeleted: true, deletedAt: new Date() }
              : { quantity: qty },
        });
      }
      await db.order.update({
        where: { id: tx.orderId },
        data: { totalAmount: newSubtotal, payableAmount: newPayable },
      });
      await db.paymentTransaction.update({
        where: { id: tx.id },
        data: { amount: newPayable },
      });
    });

    return { payableAmount: newPayable, reduction };
  }
}
