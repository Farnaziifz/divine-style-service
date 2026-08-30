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

  /**
   * Called from a gateway callback when the payment provider just confirmed
   * a real success but the guarded PENDING→PAID update matched nothing —
   * meaning the sweeper (or a prior failure path) already released this
   * order before the confirmation arrived (slow network, slow bank OTP, or
   * the callback simply landing more than RESERVATION_TTL_MS after
   * checkout). The gateway's word is authoritative: the customer's money is
   * gone, so we re-apply the stock/discount reservation this order needs
   * and hand it back to the caller to mark PAID — we never silently drop a
   * confirmed payment on the floor just because we gave up on it early.
   *
   * Caller must hold the per-order advisory lock (orderSettleLockKey) and
   * must re-check paymentStatus !== 'PAID' itself if calling this outside
   * the normal callback flow, to stay idempotent against double callbacks.
   */
  async confirmPaidAfterRelease(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<{ resurrected: boolean; stockShortages: string[] }> {
    const order = await tx.order.findFirst({
      where: { id: orderId, isDeleted: false },
      select: { id: true, paymentStatus: true, discountCode: true },
    });
    if (!order || order.paymentStatus === 'PAID') {
      return { resurrected: false, stockShortages: [] };
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

    // بهترین تلاش برای رزرو دوباره موجودی؛ حتی اگر موجودی کم بیاید، چون پول
    // واقعاً از مشتری گرفته شده، سفارش باید PAID شود — کمبود فقط لاگ می‌شود
    // تا ادمین دستی رسیدگی کند، هرگز نباید مانع تکمیل یک پرداخت واقعی شود.
    const stockShortages: string[] = [];
    for (const [productVariantId, quantity] of quantityByVariant.entries()) {
      const result = await tx.productVariant.updateMany({
        where: {
          id: productVariantId,
          isDeleted: false,
          stock: { gte: quantity },
        },
        data: { stock: { decrement: quantity } },
      });
      if (result.count === 0) {
        stockShortages.push(productVariantId);
      }
    }

    if (order.discountCode) {
      await tx.discountCode.updateMany({
        where: { code: order.discountCode, isDeleted: false },
        data: { usedCount: { increment: 1 } },
      });
    }

    return { resurrected: true, stockShortages };
  }
}
