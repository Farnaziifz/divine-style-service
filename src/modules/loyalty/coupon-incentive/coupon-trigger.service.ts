import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CouponTriggerType,
  CreditLedgerReason,
  IncentiveType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  calculateCouponRewardAmount,
  matchesCategoryPurchaseTrigger,
  matchesFirstPurchaseTrigger,
  matchesPurchaseAboveAmountTrigger,
  matchesReferralTrigger,
  qualifiesCouponWindow,
} from './coupon-rules';

export interface CouponIssueResult {
  incentiveId: string;
  triggerType: CouponTriggerType;
  amount: number;
}

@Injectable()
export class CouponTriggerService {
  private readonly logger = new Logger(CouponTriggerService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async issueCoupon(params: {
    incentiveId: string;
    triggerType: CouponTriggerType;
    customerId: string;
    orderId: string | null;
    amount: number;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const redemption = await tx.incentiveRedemption.create({
        data: {
          incentiveId: params.incentiveId,
          customerId: params.customerId,
          orderId: params.orderId,
          amountApplied: new Prisma.Decimal(params.amount),
        },
      });

      const wallet = await tx.wallet.upsert({
        where: { userId: params.customerId },
        create: {
          userId: params.customerId,
          balance: new Prisma.Decimal(params.amount),
        },
        update: { balance: { increment: params.amount } },
      });

      await tx.creditLedgerEntry.create({
        data: {
          walletId: wallet.id,
          amount: new Prisma.Decimal(params.amount),
          reason: CreditLedgerReason.COUPON,
          incentiveRedemptionId: redemption.id,
        },
      });
    });

    this.logger.log(
      `Issued coupon ${params.incentiveId} (${params.triggerType}) to customer ${params.customerId}: ${params.amount}`,
    );
  }

  /**
   * روی رویداد «سفارش تکمیل شد» — همهٔ Incentiveهای فعال نوع COUPON که تریگرشان
   * FIRST_PURCHASE / PURCHASE_ABOVE_AMOUNT / CATEGORY_PURCHASE است را چک می‌کند.
   * Idempotent بر اساس (incentiveId, customerId, orderId).
   */
  async onOrderCompleted(orderId: string): Promise<CouponIssueResult[]> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, isDeleted: false },
      select: {
        id: true,
        userId: true,
        payableAmount: true,
        paymentStatus: true,
      },
    });
    if (!order) {
      throw new NotFoundException('سفارش یافت نشد');
    }
    if (order.paymentStatus !== 'PAID') {
      throw new BadRequestException('سفارش هنوز پرداخت‌شده نیست');
    }

    const [priorPaidCount, purchasedItems, latestMembership, incentives] =
      await Promise.all([
        this.prisma.order.count({
          where: {
            userId: order.userId,
            id: { not: orderId },
            paymentStatus: 'PAID',
            isDeleted: false,
          },
        }),
        this.prisma.orderItem.findMany({
          where: { orderId, isDeleted: false },
          select: { product: { select: { categoryId: true } } },
        }),
        this.prisma.segmentMembership.findFirst({
          where: { customerId: order.userId },
          orderBy: { computedAt: 'desc' },
          select: { segmentId: true },
        }),
        this.prisma.incentive.findMany({
          where: {
            type: IncentiveType.COUPON,
            isActive: true,
            couponDetail: {
              triggerType: {
                in: [
                  CouponTriggerType.FIRST_PURCHASE,
                  CouponTriggerType.PURCHASE_ABOVE_AMOUNT,
                  CouponTriggerType.CATEGORY_PURCHASE,
                ],
              },
            },
          },
          include: { couponDetail: true },
        }),
      ]);

    const isFirstPaidOrder = priorPaidCount === 0;
    const purchasedCategoryIds = [
      ...new Set(purchasedItems.map((i) => i.product.categoryId)),
    ];
    const orderAmount = order.payableAmount.toNumber();
    const results: CouponIssueResult[] = [];

    for (const incentive of incentives) {
      const detail = incentive.couponDetail;
      if (!detail) continue;

      const alreadyIssued = await this.prisma.incentiveRedemption.findFirst({
        where: { incentiveId: incentive.id, customerId: order.userId, orderId },
        select: { id: true },
      });
      if (alreadyIssued) continue;

      const window = qualifiesCouponWindow({
        isActive: incentive.isActive,
        startsAt: incentive.startsAt,
        endsAt: incentive.endsAt,
        targetSegmentId: incentive.targetSegmentId,
        customerCurrentSegmentId: latestMembership?.segmentId ?? null,
      });
      if (!window.qualifies) continue;

      let matches = false;
      if (detail.triggerType === CouponTriggerType.FIRST_PURCHASE) {
        matches = matchesFirstPurchaseTrigger({ isFirstPaidOrder });
      } else if (
        detail.triggerType === CouponTriggerType.PURCHASE_ABOVE_AMOUNT
      ) {
        matches = matchesPurchaseAboveAmountTrigger({
          orderAmount,
          triggerConfig: detail.triggerConfig,
        });
      } else if (detail.triggerType === CouponTriggerType.CATEGORY_PURCHASE) {
        matches = matchesCategoryPurchaseTrigger({
          purchasedCategoryIds,
          triggerConfig: detail.triggerConfig,
        });
      }
      if (!matches) continue;

      const amount = calculateCouponRewardAmount({
        rewardValueType: detail.rewardValueType,
        rewardValue: detail.rewardValue.toNumber(),
        orderAmount,
      });
      if (amount <= 0) continue;

      await this.issueCoupon({
        incentiveId: incentive.id,
        triggerType: detail.triggerType,
        customerId: order.userId,
        orderId,
        amount,
      });
      results.push({
        incentiveId: incentive.id,
        triggerType: detail.triggerType,
        amount,
      });
    }

    return results;
  }

  /**
   * روی رویداد «ارجاع تایید شد» — همهٔ Incentiveهای فعال نوع COUPON با تریگر REFERRAL
   * را چک می‌کند و پاداش را به ارجاع‌دهنده (referrerId) می‌دهد.
   * هیچ سیستم ارجاع واقعی در این کدبیس وجود ندارد — این متد صرفاً محل ورود رویداد است؛
   * فراخوان (سیستم ارجاعی که بعداً ساخته می‌شود) مسئول صحت و یک‌باره بودن رخداد است.
   * اگر orderId داده شود idempotency روی (incentiveId, referrerId, orderId) چک می‌شود؛
   * در غیر این صورت (ارجاع بدون سفارش) idempotency چک نمی‌شود.
   */
  async onReferralConfirmed(
    referrerId: string,
    _referredUserId: string,
    orderId?: string,
  ): Promise<CouponIssueResult[]> {
    const referrer = await this.prisma.user.findFirst({
      where: { id: referrerId, isDeleted: false },
      select: { id: true },
    });
    if (!referrer) {
      throw new NotFoundException('کاربر ارجاع‌دهنده یافت نشد');
    }

    const [latestMembership, incentives] = await Promise.all([
      this.prisma.segmentMembership.findFirst({
        where: { customerId: referrerId },
        orderBy: { computedAt: 'desc' },
        select: { segmentId: true },
      }),
      this.prisma.incentive.findMany({
        where: {
          type: IncentiveType.COUPON,
          isActive: true,
          couponDetail: { triggerType: CouponTriggerType.REFERRAL },
        },
        include: { couponDetail: true },
      }),
    ]);

    const results: CouponIssueResult[] = [];

    for (const incentive of incentives) {
      const detail = incentive.couponDetail;
      if (!detail) continue;

      if (orderId) {
        const alreadyIssued = await this.prisma.incentiveRedemption.findFirst({
          where: { incentiveId: incentive.id, customerId: referrerId, orderId },
          select: { id: true },
        });
        if (alreadyIssued) continue;
      }

      const window = qualifiesCouponWindow({
        isActive: incentive.isActive,
        startsAt: incentive.startsAt,
        endsAt: incentive.endsAt,
        targetSegmentId: incentive.targetSegmentId,
        customerCurrentSegmentId: latestMembership?.segmentId ?? null,
      });
      if (!window.qualifies) continue;

      if (!matchesReferralTrigger()) continue;

      const amount = calculateCouponRewardAmount({
        rewardValueType: detail.rewardValueType,
        rewardValue: detail.rewardValue.toNumber(),
      });
      if (amount <= 0) continue;

      await this.issueCoupon({
        incentiveId: incentive.id,
        triggerType: detail.triggerType,
        customerId: referrerId,
        orderId: orderId ?? null,
        amount,
      });
      results.push({
        incentiveId: incentive.id,
        triggerType: detail.triggerType,
        amount,
      });
    }

    return results;
  }
}
