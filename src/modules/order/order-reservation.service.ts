import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Abandons a still-pending order: fails its payment transaction, cancels the
 * order, restores any discount-code usage, and releases the stock it was
 * holding. Shared by the checkout stale-order cleanup, both payment provider
 * callback failure paths, and the background reservation sweeper — those all
 * used to reimplement this sequence independently.
 */
@Injectable()
export class OrderReservationService {
  async releaseOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<boolean> {
    const order = await tx.order.findFirst({
      where: { id: orderId, isDeleted: false },
      select: { id: true, discountCode: true },
    });
    if (!order) return false;

    // Guard: only proceed if the order was still PENDING — if something else
    // (e.g. a payment callback landing at the same moment) already settled
    // it, don't touch stock/discount for an order that isn't abandoned.
    const updated = await tx.order.updateMany({
      where: { id: orderId, paymentStatus: 'PENDING' },
      data: { paymentStatus: 'FAILED', orderStatus: 'CANCELED' },
    });
    if (updated.count === 0) return false;

    await tx.paymentTransaction.updateMany({
      where: { orderId, status: 'INITIATED' },
      data: { status: 'FAILED', verifiedAt: new Date() },
    });

    if (order.discountCode) {
      await tx.discountCode.updateMany({
        where: {
          code: order.discountCode,
          usedCount: { gt: 0 },
          isDeleted: false,
        },
        data: { usedCount: { decrement: 1 } },
      });
    }

    const items = await tx.orderItem.findMany({
      where: { orderId, isDeleted: false },
      select: { productVariantId: true, quantity: true },
    });
    const quantityByVariant = new Map<string, number>();
    for (const item of items) {
      quantityByVariant.set(
        item.productVariantId,
        (quantityByVariant.get(item.productVariantId) ?? 0) + item.quantity,
      );
    }
    for (const [productVariantId, quantity] of quantityByVariant.entries()) {
      await tx.productVariant.updateMany({
        where: { id: productVariantId, isDeleted: false },
        data: { stock: { increment: quantity } },
      });
    }

    return true;
  }
}
