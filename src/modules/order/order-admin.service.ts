import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import {
  AdminUpdateOrderDto,
  AdminUpdateOrderItemDto,
} from './dtos/admin-edit-order.dto';

type Tx = Prisma.TransactionClient;

export interface OrderMoneySnapshot {
  totalAmount: number;
  discountAmount: number;
  shippingCost: number;
  packagingCost: number;
  /** بخشی که از کیف پول مشتری کسر شده بود (از اختلاف مبالغ استخراج می‌شود؛ در Order ذخیره نشده) */
  walletApplied: number;
  /** مبلغ قابل پرداخت از درگاه (بعد از کسر کیف پول) */
  payableAmount: number;
}

export interface OrderChangeImpact {
  previous: OrderMoneySnapshot;
  current: OrderMoneySnapshot;
  /** مبلغی که باید دستی به مشتری از طریق درگاه/کارت برگردد (فقط سفارش پرداخت‌شده) */
  gatewayRefundDue: number;
  /** مبلغی که باید دستی به کیف پول مشتری برگردد */
  walletRefundDue: number;
  warnings: string[];
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * ویرایش/حذف سفارش توسط ادمین. همهٔ تغییرات (آیتم، مبالغ، موجودی) در یک تراکنش انجام می‌شود و
 * مبالغ سطح سفارش (totalAmount / payableAmount) که گزارش‌های فروش و سود مستقیم از آن‌ها می‌خوانند
 * بعد از هر تغییر دوباره محاسبه می‌شوند. بازپرداخت پول به مشتری خودکار نیست؛ فقط مبلغ محاسبه و برگردانده می‌شود.
 */
@Injectable()
export class OrderAdminService {
  private readonly logger = new Logger(OrderAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  private num(v: unknown): number {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    const n = Number((v as any).toString());
    return Number.isFinite(n) ? n : 0;
  }

  private async loadOrder(tx: Tx, orderCode: string) {
    const order = await tx.order.findFirst({
      where: { orderCode, isDeleted: false },
      include: {
        items: { where: { isDeleted: false } },
        incentiveRedemptions: { select: { id: true } },
        referralRedemption: { select: { id: true } },
      },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد');
    return order;
  }

  private snapshot(order: {
    totalAmount: unknown;
    discountAmount: unknown;
    shippingCost: unknown;
    packagingCost: unknown;
    payableAmount: unknown;
  }): OrderMoneySnapshot {
    const total = this.num(order.totalAmount);
    const discount = this.num(order.discountAmount);
    const shipping = this.num(order.shippingCost);
    const packaging = this.num(order.packagingCost);
    const payable = this.num(order.payableAmount);
    const remaining = total - discount + shipping + packaging;
    return {
      totalAmount: total,
      discountAmount: discount,
      shippingCost: shipping,
      packagingCost: packaging,
      walletApplied: round(Math.max(0, remaining - payable)),
      payableAmount: payable,
    };
  }

  /** سفارشِ در انتظار پرداخت هنوز دست درگاه است و مبلغش نباید عوض شود */
  private assertEditable(order: { paymentStatus: string }) {
    if (order.paymentStatus === 'PENDING') {
      throw new BadRequestException(
        'سفارش در انتظار پرداخت است؛ تا پایان پرداخت (یا لغو خودکار) قابل ویرایش/حذف نیست.',
      );
    }
    if (order.paymentStatus === 'FAILED') {
      throw new BadRequestException('سفارش ناموفق/لغوشده قابل ویرایش نیست؛ فقط می‌توان آن را حذف کرد.');
    }
  }

  /** موجودی فقط برای سفارش‌هایی که آزاد نشده‌اند (FAILED یعنی قبلاً به انبار برگشته) تغییر می‌کند */
  private holdsStock(order: { paymentStatus: string }) {
    return order.paymentStatus !== 'FAILED';
  }

  private async adjustStock(tx: Tx, variantId: string, delta: number) {
    if (delta === 0) return;
    if (delta > 0) {
      await tx.productVariant.updateMany({
        where: { id: variantId, isDeleted: false },
        data: { stock: { increment: delta } },
      });
      return;
    }
    const need = -delta;
    const res = await tx.productVariant.updateMany({
      where: { id: variantId, isDeleted: false, stock: { gte: need } },
      data: { stock: { decrement: need } },
    });
    if (res.count === 0) {
      throw new BadRequestException('موجودی انبار برای افزایش تعداد کافی نیست');
    }
  }

  /** مبالغ سفارش را از روی آیتم‌ها دوباره حساب می‌کند؛ تخفیف/ارسال/بسته‌بندی و سهم کیف پول ثابت می‌مانند */
  private async recalc(
    tx: Tx,
    orderId: string,
    before: OrderMoneySnapshot,
    overrides: { discountAmount?: number; shippingCost?: number; packagingCost?: number } = {},
  ): Promise<OrderMoneySnapshot> {
    const items = await tx.orderItem.findMany({
      where: { orderId, isDeleted: false },
      select: { quantity: true, unitPrice: true, unitDiscountPrice: true },
    });
    const total = round(
      items.reduce(
        (sum, it) =>
          sum + this.num(it.unitDiscountPrice ?? it.unitPrice) * it.quantity,
        0,
      ),
    );

    const shipping = overrides.shippingCost ?? before.shippingCost;
    const packaging = overrides.packagingCost ?? before.packagingCost;
    let discount = overrides.discountAmount ?? before.discountAmount;
    if (overrides.discountAmount != null && overrides.discountAmount > total) {
      throw new BadRequestException('مبلغ تخفیف نمی‌تواند از جمع آیتم‌ها بیشتر باشد');
    }
    // تخفیف ثابت قبلی هیچ‌وقت از جمع جدید بیشتر نمی‌شود
    discount = Math.min(discount, total);

    const remaining = round(total - discount + shipping + packaging);
    const walletApplied = Math.min(before.walletApplied, Math.max(0, remaining));
    const payable = round(remaining - walletApplied);

    await tx.order.update({
      where: { id: orderId },
      data: {
        totalAmount: total,
        discountAmount: discount,
        shippingCost: shipping,
        packagingCost: packaging,
        payableAmount: payable,
      },
    });

    return {
      totalAmount: total,
      discountAmount: discount,
      shippingCost: shipping,
      packagingCost: packaging,
      walletApplied,
      payableAmount: payable,
    };
  }

  private impact(
    previous: OrderMoneySnapshot,
    current: OrderMoneySnapshot,
    paid: boolean,
    warnings: string[] = [],
  ): OrderChangeImpact {
    return {
      previous,
      current,
      gatewayRefundDue: paid ? Math.max(0, round(previous.payableAmount - current.payableAmount)) : 0,
      walletRefundDue: paid ? Math.max(0, round(previous.walletApplied - current.walletApplied)) : 0,
      warnings,
    };
  }

  async updateOrder(orderCode: string, dto: AdminUpdateOrderDto, actorId?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await this.loadOrder(tx, orderCode);
      this.assertEditable(order);
      const before = this.snapshot(order);

      if (dto.shippingAddress !== undefined) {
        await tx.order.update({
          where: { id: order.id },
          data: { shippingAddress: dto.shippingAddress as Prisma.InputJsonValue },
        });
      }
      const after = await this.recalc(tx, order.id, before, {
        discountAmount: dto.discountAmount,
        shippingCost: dto.shippingCost,
        packagingCost: dto.packagingCost,
      });
      return this.impact(before, after, order.paymentStatus === 'PAID');
    });
    this.logger.log(`order ${orderCode} edited by ${actorId ?? 'unknown'}: ${JSON.stringify(dto)}`);
    return result;
  }

  async updateItem(orderCode: string, itemId: string, dto: AdminUpdateOrderItemDto, actorId?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await this.loadOrder(tx, orderCode);
      this.assertEditable(order);
      const item = order.items.find((i) => i.id === itemId);
      if (!item) throw new NotFoundException('آیتم سفارش یافت نشد');
      const before = this.snapshot(order);

      const data: Prisma.OrderItemUpdateInput = {};
      if (dto.quantity != null) data.quantity = dto.quantity;
      if (dto.unitPrice != null) data.unitPrice = dto.unitPrice;
      if (dto.unitDiscountPrice !== undefined) data.unitDiscountPrice = dto.unitDiscountPrice;
      if (Object.keys(data).length === 0) {
        throw new BadRequestException('هیچ تغییری ارسال نشده است');
      }

      if (dto.quantity != null && dto.quantity !== item.quantity && dto.returnToStock && this.holdsStock(order)) {
        // کاهش تعداد → موجودی برمی‌گردد (delta مثبت)؛ افزایش → از موجودی کم می‌شود
        await this.adjustStock(tx, item.productVariantId, item.quantity - dto.quantity);
      }
      await tx.orderItem.update({ where: { id: item.id }, data });

      const after = await this.recalc(tx, order.id, before);
      return this.impact(before, after, order.paymentStatus === 'PAID');
    });
    this.logger.log(`order ${orderCode} item ${itemId} edited by ${actorId ?? 'unknown'}: ${JSON.stringify(dto)}`);
    return result;
  }

  async deleteItem(orderCode: string, itemId: string, returnToStock: boolean, actorId?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await this.loadOrder(tx, orderCode);
      this.assertEditable(order);
      const item = order.items.find((i) => i.id === itemId);
      if (!item) throw new NotFoundException('آیتم سفارش یافت نشد');
      if (order.items.length <= 1) {
        throw new BadRequestException(
          'این آخرین آیتم سفارش است؛ برای حذف آن کل سفارش را حذف کنید.',
        );
      }
      const before = this.snapshot(order);

      if (returnToStock && this.holdsStock(order)) {
        await this.adjustStock(tx, item.productVariantId, item.quantity);
      }
      await tx.orderItem.update({
        where: { id: item.id },
        data: { isDeleted: true, deletedAt: new Date() },
      });

      const after = await this.recalc(tx, order.id, before);
      return this.impact(before, after, order.paymentStatus === 'PAID');
    });
    this.logger.log(`order ${orderCode} item ${itemId} deleted by ${actorId ?? 'unknown'} (returnToStock=${returnToStock})`);
    return result;
  }

  async deleteOrder(orderCode: string, returnToStock: boolean, actorId?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await this.loadOrder(tx, orderCode);
      if (order.paymentStatus === 'PENDING') {
        throw new BadRequestException(
          'سفارش در انتظار پرداخت است؛ تا پایان پرداخت (یا لغو خودکار) قابل حذف نیست.',
        );
      }
      const before = this.snapshot(order);
      const paid = order.paymentStatus === 'PAID';

      if (returnToStock && this.holdsStock(order)) {
        const byVariant = new Map<string, number>();
        for (const it of order.items) {
          byVariant.set(it.productVariantId, (byVariant.get(it.productVariantId) ?? 0) + it.quantity);
        }
        for (const [variantId, qty] of byVariant) {
          await this.adjustStock(tx, variantId, qty);
        }
      }

      // سفارش پرداخت‌نشده/لغوشده قبلاً کد تخفیفش را آزاد کرده (releaseOrder)؛ فقط PAID باید آزاد شود
      if (paid && order.discountCode) {
        await tx.discountCode.updateMany({
          where: { code: order.discountCode, usedCount: { gt: 0 }, isDeleted: false },
          data: { usedCount: { decrement: 1 } },
        });
      }

      const now = new Date();
      await tx.orderItem.updateMany({
        where: { orderId: order.id, isDeleted: false },
        data: { isDeleted: true, deletedAt: now },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { isDeleted: true, deletedAt: now },
      });

      const warnings: string[] = [];
      if (paid && (order.incentiveRedemptions.length > 0 || order.referralRedemption)) {
        warnings.push(
          'این سفارش از تخفیف وفاداری/رفرال استفاده کرده بود؛ سابقهٔ استفاده (و هر کش‌بک/کوپنی که بابتش صادر شده) دست‌نخورده باقی می‌ماند و در صورت نیاز باید دستی بررسی شود.',
        );
      }
      // با حذف سفارش، کل مبلغ پرداخت‌شده باید برگردد
      const current: OrderMoneySnapshot = {
        totalAmount: 0,
        discountAmount: 0,
        shippingCost: 0,
        packagingCost: 0,
        walletApplied: 0,
        payableAmount: 0,
      };
      return this.impact(before, current, paid, warnings);
    });
    this.logger.log(`order ${orderCode} deleted by ${actorId ?? 'unknown'} (returnToStock=${returnToStock})`);
    return result;
  }
}
