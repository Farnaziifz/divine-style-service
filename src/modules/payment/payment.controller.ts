import {
  Controller,
  Get,
  Logger,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Prisma } from '@prisma/client';
import { toJalaali } from 'jalaali-js';
import { PrismaService } from '../shared/prisma/prisma.service';
import { PaginationDto } from '../shared/dtos/pagination.dto';
import { PaymentService } from './payment.service';
import { OrderReservationService } from '../order/order-reservation.service';
import { RESERVATION_TTL_MS, orderSettleLockKey } from '../order/reservation.constants';
import { SmsTextService } from '../shared/sms/sms-text.service';
import { CashbackGrantService } from '../loyalty/cashback-incentive/cashback-grant.service';
import { CouponTriggerService } from '../loyalty/coupon-incentive/coupon-trigger.service';
import { welcomeTierForPriorPaidCount } from '../discount/welcome-tier.rules';

@ApiTags('Payment')
@Controller('payments')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);
  private readonly providerOptions = ['ZARINPAL', 'ZIBAL'] as const;
  private readonly orderRegisteredTemplateId = Number(
    process.env.SMS_IR_ORDER_TEMPLATE_ID?.trim() || '852827',
  );
  private readonly adminOrderNotificationTemplateId = Number(
    process.env.SMS_IR_ADMIN_ORDER_TEMPLATE_ID?.trim() || '866043',
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly orderReservation: OrderReservationService,
    private readonly smsText: SmsTextService,
    private readonly cashbackGrant: CashbackGrantService,
    private readonly couponTrigger: CouponTriggerService,
  ) {}

  private formatOrderDateJalali(date: Date): string {
    const { jy, jm, jd } = toJalaali(date);
    return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
  }

  private formatOrderItemsTitle(titles: string[]): string {
    const maxItems = 3;
    const shown = titles.slice(0, maxItems).join('، ');
    const rest = titles.length - maxItems;
    return rest > 0 ? `${shown} و ${rest} مورد دیگر` : shown;
  }

  /**
   * Fired only once a payment actually clears — not at checkout/order
   * creation, so a user who abandons the gateway never gets a "order
   * registered" SMS for an order that was never paid for.
   */
  private async notifyOrderPaid(
    orderId: string,
    customerMobile: string | undefined,
    orderCode: string,
    payableAmount: number,
    discountCode: string | null,
  ): Promise<void> {
    try {
      const recipients = await this.prisma.orderNotificationPhone.findMany({
        where: { isActive: true, isDeleted: false },
        select: { phoneNumber: true },
      });
      const adminParams = this.smsText.buildAdminOrderNotificationTemplateParams({
        phone: customerMobile ?? '-',
        orderNumber: orderCode,
        price: payableAmount.toLocaleString('fa-IR'),
        code: discountCode ?? '-',
      });
      await Promise.all(
        recipients.map((r) =>
          this.smsText.sendTemplateMessage(
            r.phoneNumber,
            this.adminOrderNotificationTemplateId,
            adminParams,
          ),
        ),
      );

      if (customerMobile) {
        const order = await this.prisma.order.findUnique({
          where: { id: orderId },
          select: {
            paidAt: true,
            createdAt: true,
            items: {
              where: { isDeleted: false },
              select: { title: true },
            },
          },
        });
        const itemTitles = order?.items.map((i) => i.title) ?? [];
        const orderDate = order?.paidAt ?? order?.createdAt ?? new Date();

        await this.smsText.sendTemplateMessage(
          customerMobile,
          this.orderRegisteredTemplateId,
          this.smsText.buildOrderRegisteredTemplateParams({
            title: this.formatOrderItemsTitle(itemTitles),
            orderNumber: orderCode,
            date: this.formatOrderDateJalali(orderDate),
            price: `${payableAmount.toLocaleString('fa-IR')} تومان`,
          }),
        );
      }
    } catch {
      // Notification failure must never affect the payment callback flow.
    }
  }

  /** Best-effort — a cashback grant failure must never affect the payment callback flow. */
  private async grantCashbackForOrder(orderId: string): Promise<void> {
    try {
      await this.cashbackGrant.grantForOrder(orderId);
    } catch {
      // swallow — see comment above.
    }
  }

  /** Best-effort — a coupon trigger evaluation failure must never affect the payment callback flow. */
  private async evaluateCouponTriggersForOrder(orderId: string): Promise<void> {
    try {
      await this.couponTrigger.onOrderCompleted(orderId);
    } catch {
      // swallow — see comment above.
    }
  }

  /**
   * تخفیف پلکانی خوش‌آمدگویی کاملاً خودکار است (بدون کد) — بر اساس تعداد
   * سفارش‌های PAID مشتری در چک‌اوت محاسبه می‌شود (welcome-tier.rules.ts).
   * اینجا فقط پس از پرداخت این سفارش، اگر هنوز پلهٔ بعدی باقی مانده، یک
   * پیامک اطلاع‌رسانی (بدون کد) می‌فرستد. Best-effort — نباید روی کال‌بک
   * پرداخت اثر بگذارد.
   */
  private async notifyNextWelcomeTier(
    userId: string,
    customerMobile: string | undefined,
  ): Promise<void> {
    if (!customerMobile) return;
    try {
      const paidCount = await this.prisma.order.count({
        where: { userId, paymentStatus: 'PAID', isDeleted: false },
      });
      const nextTier = welcomeTierForPriorPaidCount(paidCount);
      if (!nextTier) return;
      const text = this.smsText.buildNextWelcomeStageText(
        nextTier.value,
        nextTier.label,
      );
      await this.smsText.send(customerMobile, text);
    } catch (err) {
      this.logger.error(
        `Welcome discount next-tier notice failed for user ${userId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * After releaseOrder() frees the stock, put the order's items back into
   * the user's basket (soft-un-delete + upsert) with a fresh reservation
   * window, since the stock is available to them again for a bit.
   */
  private async restoreOrderToBasket(
    tx: Prisma.TransactionClient,
    orderId: string,
    userId: string,
  ) {
    const orderItems = await tx.orderItem.findMany({
      where: { orderId, isDeleted: false },
      select: { productVariantId: true, quantity: true },
    });
    const quantityByVariant = new Map<string, number>();
    for (const item of orderItems) {
      quantityByVariant.set(
        item.productVariantId,
        (quantityByVariant.get(item.productVariantId) ?? 0) + item.quantity,
      );
    }
    await this.restoreBasketItems(tx, userId, quantityByVariant);
  }

  private parseActiveProviders(
    raw: string | null | undefined,
  ): Array<(typeof this.providerOptions)[number]> {
    if (!raw) return ['ZARINPAL'];
    const trimmed = raw.trim();
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .map((x) => String(x).toUpperCase())
          .filter((x) => x === 'ZARINPAL' || x === 'ZIBAL') as Array<
          (typeof this.providerOptions)[number]
        >;
        return normalized.length > 0
          ? Array.from(new Set(normalized))
          : ['ZARINPAL'];
      }
    } catch {
      // ignore
    }
    const normalized = trimmed
      .split(',')
      .map((x) => x.trim().toUpperCase())
      .filter((x) => x === 'ZARINPAL' || x === 'ZIBAL') as Array<
      (typeof this.providerOptions)[number]
    >;
    return normalized.length > 0
      ? Array.from(new Set(normalized))
      : ['ZARINPAL'];
  }

  private normalizeDefaultProvider(
    active: Array<(typeof this.providerOptions)[number]>,
    rawDefault: string | null | undefined,
  ): (typeof this.providerOptions)[number] {
    const desired = String(rawDefault ?? '')
      .trim()
      .toUpperCase();
    const fallback = active[0] ?? 'ZARINPAL';
    if (desired === 'ZARINPAL' || desired === 'ZIBAL') {
      return active.includes(desired as any) ? (desired as any) : fallback;
    }
    return fallback;
  }

  @Get('providers')
  @ApiOperation({ summary: 'List active payment providers' })
  async listPaymentProviders() {
    const [activeSetting, defaultSetting] = await this.prisma.$transaction([
      this.prisma.siteSetting.findUnique({
        where: { key: 'PAYMENT_ACTIVE_PROVIDERS' },
        select: { value: true },
      }),
      this.prisma.siteSetting.findUnique({
        where: { key: 'PAYMENT_DEFAULT_PROVIDER' },
        select: { value: true },
      }),
    ]);

    const activeProviders = this.parseActiveProviders(activeSetting?.value);
    const defaultProvider = this.normalizeDefaultProvider(
      activeProviders,
      defaultSetting?.value,
    );

    return {
      options: this.providerOptions,
      activeProviders,
      defaultProvider,
    };
  }

  private async restoreBasketItems(
    tx: Prisma.TransactionClient,
    userId: string,
    quantityByVariant: Map<string, number>,
  ) {
    const basket = await tx.tempBasket.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!basket) return;

    await tx.tempBasket.updateMany({
      where: { id: basket.id },
      data: { isDeleted: false, deletedAt: null },
    });

    const reservedUntil = new Date(Date.now() + RESERVATION_TTL_MS);
    for (const [productVariantId, quantity] of quantityByVariant.entries()) {
      await tx.tempBasketItem.upsert({
        where: {
          basketId_productVariantId: { basketId: basket.id, productVariantId },
        },
        update: { isDeleted: false, deletedAt: null, quantity, reservedUntil },
        create: {
          basketId: basket.id,
          productVariantId,
          quantity,
          reservedUntil,
        },
      });
    }
  }

  private hasPermission(user: any, permission: string) {
    return (
      Array.isArray(user?.permissions) && user.permissions.includes(permission)
    );
  }

  private canReadAllPayments(user: any) {
    return (
      user?.role === 'ADMIN' ||
      (user?.role === 'OPERATOR' && this.hasPermission(user, 'ORDERS_READ'))
    );
  }

  private toNumber(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    }
    if (value && typeof value.toNumber === 'function') {
      const n = value.toNumber();
      return Number.isFinite(n) ? n : 0;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  @Get('transactions')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List payment transactions' })
  async listTransactions(
    @Req() req: any,
    @Query() pagination: PaginationDto,
    @Query('userId') userId?: string,
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: any = { isDeleted: false };
    if (!this.canReadAllPayments(req.user)) {
      where.order = { is: { userId: req.user.id, isDeleted: false } };
    } else if (userId) {
      where.order = { is: { userId, isDeleted: false } };
    } else {
      where.order = { is: { isDeleted: false } };
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.paymentTransaction.count({ where }),
      this.prisma.paymentTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          provider: true,
          status: true,
          amount: true,
          authority: true,
          refId: true,
          createdAt: true,
          verifiedAt: true,
          order: {
            select: {
              id: true,
              orderCode: true,
              userId: true,
            },
          },
        },
      }),
    ]);

    return {
      data: data.map((tx) => ({
        id: tx.id,
        provider: tx.provider,
        status: tx.status,
        amount: this.toNumber(tx.amount),
        authority: tx.authority,
        refId: tx.refId,
        createdAt: tx.createdAt,
        verifiedAt: tx.verifiedAt,
        order: tx.order,
      })),
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  @Get('zarinpal/callback')
  @ApiOperation({ summary: 'Zarinpal callback' })
  async zarinpalCallback(
    @Query('Authority') authority: string,
    @Query('Status') status: string,
    @Query('lang') lang: string,
    @Res() res: Response,
  ) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const language = lang || 'fa';

    const callbackResult = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`zarinpal-callback:${authority}`}))`;

      const lookup = await tx.paymentTransaction.findFirst({
        where: { authority, isDeleted: false },
        select: { orderId: true },
      });

      if (!lookup) {
        return {
          redirect: `${frontendUrl}/${language}/payment/failed`,
          paid: null,
        };
      }

      // همون قفلی که sweeper پیش از آزادسازی این سفارش می‌گیرد — تضمین می‌کند
      // آزادسازی (تایم‌اوت رزرو) و تأیید این کال‌بک هرگز هم‌زمان روی یک سفارش
      // interleave نشوند، حتی زیر بار همزمان بالا. باید قبل از خوندن وضعیت
      // فعلی سفارش گرفته بشه، وگرنه snapshot زیر دستمون تغییر می‌کنه.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orderSettleLockKey(lookup.orderId)}))`;

      const current = await tx.paymentTransaction.findFirst({
        where: { authority, isDeleted: false },
        include: { order: { include: { user: { select: { mobile: true } } } } },
      });

      if (!current) {
        return {
          redirect: `${frontendUrl}/${language}/payment/failed`,
          paid: null,
        };
      }

      const orderId = current.orderId;
      const orderCode = current.order?.orderCode || orderId;

      if (
        current.status === 'PAID' ||
        current.order?.paymentStatus === 'PAID'
      ) {
        return {
          redirect: `${frontendUrl}/${language}/payment/result/${encodeURIComponent(orderCode)}`,
          paid: null,
        };
      }

      if (status !== 'OK') {
        const released = await this.orderReservation.releaseOrder(tx, orderId);
        if (released) {
          await this.restoreOrderToBasket(tx, orderId, current.order!.userId);
        }
        return {
          redirect: `${frontendUrl}/${language}/payment/result/${encodeURIComponent(orderCode)}`,
          paid: null,
        };
      }

      const amountToman = Math.round(Number(current.amount));
      let verified: { refId: string };
      try {
        verified = await this.paymentService.verifyZarinpalPayment({
          authority,
          amountToman,
        });
      } catch (e) {
        const released = await this.orderReservation.releaseOrder(tx, orderId);
        if (released) {
          await this.restoreOrderToBasket(tx, orderId, current.order!.userId);
        }

        return {
          redirect: `${frontendUrl}/${language}/payment/result/${encodeURIComponent(orderCode)}`,
          paid: null,
        };
      }

      // درگاه همین الان پرداخت موفق رو تأیید کرد. اگه sweeper به‌خاطر تأخیر
      // (اینترنت کند/بار همزمان) این سفارش رو زودتر آزاد کرده باشه، این
      // آپدیت‌های guard-شده هیچ ردیفی رو match نمی‌کنن — نباید سکوت کنیم و
      // «پرداخت موفق» رو بدون تغییر واقعی دیتابیس اعلام کنیم (این همون باگیه
      // که پیامک اشتباه می‌فرستاد). باید صریحاً چک و در صورت نیاز احیا کنیم.
      const txUpdate = await tx.paymentTransaction.updateMany({
        where: { id: current.id, status: 'INITIATED' },
        data: {
          status: 'PAID',
          refId: verified.refId || null,
          verifiedAt: new Date(),
        },
      });
      const orderUpdate = await tx.order.updateMany({
        where: { id: orderId, paymentStatus: 'PENDING' },
        data: {
          paymentStatus: 'PAID',
          orderStatus: 'PAID',
          paidAt: new Date(),
        },
      });

      let settled = txUpdate.count > 0 && orderUpdate.count > 0;

      if (!settled) {
        const resurrection = await this.orderReservation.confirmPaidAfterRelease(
          tx,
          orderId,
        );
        if (resurrection.resurrected) {
          await tx.paymentTransaction.updateMany({
            where: { id: current.id },
            data: {
              status: 'PAID',
              refId: verified.refId || null,
              verifiedAt: new Date(),
            },
          });
          await tx.order.updateMany({
            where: { id: orderId },
            data: {
              paymentStatus: 'PAID',
              orderStatus: 'PAID',
              paidAt: new Date(),
            },
          });
          settled = true;
          if (resurrection.stockShortages.length > 0) {
            this.logger.error(
              `Order ${orderCode} paid after being released early (variants short on stock: ${resurrection.stockShortages.join(', ')}) — needs manual stock review`,
            );
          } else {
            this.logger.warn(
              `Order ${orderCode} paid after being released early by the reservation sweeper — resurrected successfully`,
            );
          }
        } else {
          this.logger.error(
            `Order ${orderCode}: Zarinpal confirmed payment (refId ${verified.refId}) but the order could not be settled or resurrected — needs manual reconciliation`,
          );
        }
      }

      return {
        redirect: `${frontendUrl}/${language}/payment/result/${encodeURIComponent(orderCode)}`,
        paid: settled
          ? {
              orderId,
              userId: current.order!.userId,
              customerMobile: current.order?.user?.mobile,
              discountCode: current.order?.discountCode ?? null,
              orderCode,
              payableAmount: Math.round(Number(current.amount)),
            }
          : null,
      };
    });

    if (callbackResult.paid) {
      void this.notifyOrderPaid(
        callbackResult.paid.orderId,
        callbackResult.paid.customerMobile,
        callbackResult.paid.orderCode,
        callbackResult.paid.payableAmount,
        callbackResult.paid.discountCode,
      );
      void this.grantCashbackForOrder(callbackResult.paid.orderId);
      void this.evaluateCouponTriggersForOrder(callbackResult.paid.orderId);
      void this.notifyNextWelcomeTier(
        callbackResult.paid.userId,
        callbackResult.paid.customerMobile,
      );
    }

    return res.redirect(callbackResult.redirect);
  }

  @Get('zibal/callback')
  @ApiOperation({ summary: 'Zibal callback' })
  async zibalCallback(
    @Query('trackId') trackId: string,
    @Query('success') success: string,
    @Query('status') status: string,
    @Query('orderId') _orderId: string,
    @Query('lang') lang: string,
    @Res() res: Response,
  ) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const language = lang || 'fa';

    const callbackResult = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`zibal-callback:${trackId}`}))`;

      const lookup = await tx.paymentTransaction.findFirst({
        where: { authority: trackId, isDeleted: false },
        select: { orderId: true },
      });

      if (!lookup) {
        return {
          redirect: `${frontendUrl}/${language}/payment/failed`,
          paid: null,
        };
      }

      // همون قفلی که sweeper پیش از آزادسازی این سفارش می‌گیرد — تضمین می‌کند
      // آزادسازی (تایم‌اوت رزرو) و تأیید این کال‌بک هرگز هم‌زمان روی یک سفارش
      // interleave نشوند، حتی زیر بار همزمان بالا. باید قبل از خوندن وضعیت
      // فعلی سفارش گرفته بشه، وگرنه snapshot زیر دستمون تغییر می‌کنه.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orderSettleLockKey(lookup.orderId)}))`;

      const current = await tx.paymentTransaction.findFirst({
        where: { authority: trackId, isDeleted: false },
        include: { order: { include: { user: { select: { mobile: true } } } } },
      });

      if (!current) {
        return {
          redirect: `${frontendUrl}/${language}/payment/failed`,
          paid: null,
        };
      }

      const currentOrderId = current.orderId;
      const orderCode = current.order?.orderCode || currentOrderId;

      if (
        current.status === 'PAID' ||
        current.order?.paymentStatus === 'PAID'
      ) {
        return {
          redirect: `${frontendUrl}/${language}/payment/result/${encodeURIComponent(orderCode)}`,
          paid: null,
        };
      }

      const callbackSuccess = String(success) === '1' && String(status) === '2';
      if (!callbackSuccess) {
        const released = await this.orderReservation.releaseOrder(
          tx,
          currentOrderId,
        );
        if (released) {
          await this.restoreOrderToBasket(
            tx,
            currentOrderId,
            current.order!.userId,
          );
        }

        return {
          redirect: `${frontendUrl}/${language}/payment/result/${encodeURIComponent(orderCode)}`,
          paid: null,
        };
      }

      let verified: { refId: string };
      try {
        verified = await this.paymentService.verifyZibalPayment({
          trackId,
        });
      } catch {
        const released = await this.orderReservation.releaseOrder(
          tx,
          currentOrderId,
        );
        if (released) {
          await this.restoreOrderToBasket(
            tx,
            currentOrderId,
            current.order!.userId,
          );
        }

        return {
          redirect: `${frontendUrl}/${language}/payment/result/${encodeURIComponent(orderCode)}`,
          paid: null,
        };
      }

      // درگاه همین الان پرداخت موفق رو تأیید کرد. اگه sweeper به‌خاطر تأخیر
      // (اینترنت کند/بار همزمان) این سفارش رو زودتر آزاد کرده باشه، این
      // آپدیت‌های guard-شده هیچ ردیفی رو match نمی‌کنن — نباید سکوت کنیم و
      // «پرداخت موفق» رو بدون تغییر واقعی دیتابیس اعلام کنیم (این همون باگیه
      // که پیامک اشتباه می‌فرستاد). باید صریحاً چک و در صورت نیاز احیا کنیم.
      const txUpdate = await tx.paymentTransaction.updateMany({
        where: { id: current.id, status: 'INITIATED' },
        data: {
          status: 'PAID',
          refId: verified.refId || null,
          verifiedAt: new Date(),
        },
      });
      const orderUpdate = await tx.order.updateMany({
        where: { id: currentOrderId, paymentStatus: 'PENDING' },
        data: {
          paymentStatus: 'PAID',
          orderStatus: 'PAID',
          paidAt: new Date(),
        },
      });

      let settled = txUpdate.count > 0 && orderUpdate.count > 0;

      if (!settled) {
        const resurrection = await this.orderReservation.confirmPaidAfterRelease(
          tx,
          currentOrderId,
        );
        if (resurrection.resurrected) {
          await tx.paymentTransaction.updateMany({
            where: { id: current.id },
            data: {
              status: 'PAID',
              refId: verified.refId || null,
              verifiedAt: new Date(),
            },
          });
          await tx.order.updateMany({
            where: { id: currentOrderId },
            data: {
              paymentStatus: 'PAID',
              orderStatus: 'PAID',
              paidAt: new Date(),
            },
          });
          settled = true;
          if (resurrection.stockShortages.length > 0) {
            this.logger.error(
              `Order ${orderCode} paid after being released early (variants short on stock: ${resurrection.stockShortages.join(', ')}) — needs manual stock review`,
            );
          } else {
            this.logger.warn(
              `Order ${orderCode} paid after being released early by the reservation sweeper — resurrected successfully`,
            );
          }
        } else {
          this.logger.error(
            `Order ${orderCode}: Zibal confirmed payment (refId ${verified.refId}) but the order could not be settled or resurrected — needs manual reconciliation`,
          );
        }
      }

      return {
        redirect: `${frontendUrl}/${language}/payment/result/${encodeURIComponent(orderCode)}`,
        paid: settled
          ? {
              orderId: currentOrderId,
              userId: current.order!.userId,
              customerMobile: current.order?.user?.mobile,
              discountCode: current.order?.discountCode ?? null,
              orderCode,
              payableAmount: Math.round(Number(current.amount)),
            }
          : null,
      };
    });

    if (callbackResult.paid) {
      void this.notifyOrderPaid(
        callbackResult.paid.orderId,
        callbackResult.paid.customerMobile,
        callbackResult.paid.orderCode,
        callbackResult.paid.payableAmount,
        callbackResult.paid.discountCode,
      );
      void this.grantCashbackForOrder(callbackResult.paid.orderId);
      void this.evaluateCouponTriggersForOrder(callbackResult.paid.orderId);
      void this.notifyNextWelcomeTier(
        callbackResult.paid.userId,
        callbackResult.paid.customerMobile,
      );
    }

    return res.redirect(callbackResult.redirect);
  }
}
