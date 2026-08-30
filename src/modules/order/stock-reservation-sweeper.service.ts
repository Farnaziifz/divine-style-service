import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../shared/prisma/prisma.service';
import { OrderReservationService } from './order-reservation.service';
import { RESERVATION_TTL_MS, orderSettleLockKey } from './reservation.constants';

/**
 * Proactively releases stock reservations that were never converted into a
 * paid order: cart items whose 5-minute hold expired, and orders that sat in
 * PENDING_PAYMENT past the same window without a completed payment.
 */
@Injectable()
export class StockReservationSweeperService {
  private readonly logger = new Logger(StockReservationSweeperService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderReservation: OrderReservationService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async sweep() {
    await this.sweepExpiredBasketItems();
    await this.sweepExpiredPendingOrders();
  }

  private async sweepExpiredBasketItems() {
    const now = new Date();
    const expired = await this.prisma.tempBasketItem.findMany({
      where: { isDeleted: false, reservedUntil: { lte: now } },
      select: { id: true, productVariantId: true, quantity: true },
    });
    if (expired.length === 0) return;

    let released = 0;
    for (const item of expired) {
      await this.prisma.$transaction(async (tx) => {
        const claim = await tx.tempBasketItem.updateMany({
          where: {
            id: item.id,
            isDeleted: false,
            reservedUntil: { lte: now },
          },
          data: { isDeleted: true, deletedAt: now },
        });
        if (claim.count === 0) return;
        await tx.productVariant.updateMany({
          where: { id: item.productVariantId, isDeleted: false },
          data: { stock: { increment: item.quantity } },
        });
        released++;
      });
    }
    if (released > 0) {
      this.logger.log(`Released ${released} expired basket reservation(s)`);
    }
  }

  private async sweepExpiredPendingOrders() {
    const cutoff = new Date(Date.now() - RESERVATION_TTL_MS);
    const stale = await this.prisma.order.findMany({
      where: {
        isDeleted: false,
        orderStatus: 'PENDING_PAYMENT',
        paymentStatus: 'PENDING',
        createdAt: { lte: cutoff },
      },
      select: { id: true },
    });
    if (stale.length === 0) return;

    let released = 0;
    for (const order of stale) {
      // همون قفلی که کال‌بک درگاه پرداخت روی این سفارش می‌گیرد؛ تضمین می‌کند
      // آزادسازی و تأیید پرداخت هرگز هم‌زمان روی یک سفارش interleave نشوند.
      const ok = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orderSettleLockKey(order.id)}))`;
        return this.orderReservation.releaseOrder(tx, order.id);
      });
      if (ok) released++;
    }
    if (released > 0) {
      this.logger.log(`Released ${released} expired pending order(s)`);
    }
  }
}
