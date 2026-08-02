import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import { PaginationDto } from '../shared/dtos/pagination.dto';
import { PaymentService } from './payment.service';
import { OrderReservationService } from '../order/order-reservation.service';
import { RESERVATION_TTL_MS } from '../order/reservation.constants';

@ApiTags('Payment')
@Controller('payments')
export class PaymentController {
  private readonly providerOptions = ['ZARINPAL', 'ZIBAL'] as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly orderReservation: OrderReservationService,
  ) {}

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

      const current = await tx.paymentTransaction.findFirst({
        where: { authority, isDeleted: false },
        include: { order: true },
      });

      if (!current) {
        return {
          redirect: `${frontendUrl}/${language}/payment/failed`,
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
        };
      }

      if (status !== 'OK') {
        const released = await this.orderReservation.releaseOrder(tx, orderId);
        if (released) {
          await this.restoreOrderToBasket(tx, orderId, current.order!.userId);
        }
        return {
          redirect: `${frontendUrl}/${language}/payment/result/${encodeURIComponent(orderCode)}`,
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
        };
      }

      await tx.paymentTransaction.updateMany({
        where: { id: current.id, status: 'INITIATED' },
        data: {
          status: 'PAID',
          refId: verified.refId || null,
          verifiedAt: new Date(),
        },
      });
      await tx.order.updateMany({
        where: { id: orderId, paymentStatus: 'PENDING' },
        data: {
          paymentStatus: 'PAID',
          orderStatus: 'PAID',
          paidAt: new Date(),
        },
      });

      return {
        redirect: `${frontendUrl}/${language}/payment/result/${encodeURIComponent(orderCode)}`,
      };
    });

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

      const current = await tx.paymentTransaction.findFirst({
        where: { authority: trackId, isDeleted: false },
        include: { order: true },
      });

      if (!current) {
        return {
          redirect: `${frontendUrl}/${language}/payment/failed`,
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
        };
      }

      await tx.paymentTransaction.updateMany({
        where: { id: current.id, status: 'INITIATED' },
        data: {
          status: 'PAID',
          refId: verified.refId || null,
          verifiedAt: new Date(),
        },
      });
      await tx.order.updateMany({
        where: { id: currentOrderId, paymentStatus: 'PENDING' },
        data: {
          paymentStatus: 'PAID',
          orderStatus: 'PAID',
          paidAt: new Date(),
        },
      });

      return {
        redirect: `${frontendUrl}/${language}/payment/result/${encodeURIComponent(orderCode)}`,
      };
    });

    return res.redirect(callbackResult.redirect);
  }
}
