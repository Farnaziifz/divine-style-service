import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreditLedgerReason, IncentiveType, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  calculateCashbackAmount,
  qualifiesForCashback,
} from './cashback-rules';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CashbackGrantResult {
  incentiveId: string;
  amount: number;
  expiresAt: Date | null;
}

@Injectable()
export class CashbackGrantService {
  private readonly logger = new Logger(CashbackGrantService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * روی یک سفارش پرداخت‌شده، همهٔ Incentiveهای فعال نوع CASHBACK را چک می‌کند و
   * برای هرکدام که مشتری واجد شرایط باشد یک اعتبار کش‌بک در انتظار (با انقضا) می‌سازد.
   * Idempotent: اگر برای این (incentive, order) قبلاً اعطا شده باشد، دوباره اعطا نمی‌کند.
   */
  async grantForOrder(orderId: string): Promise<CashbackGrantResult[]> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, isDeleted: false },
      select: {
        id: true,
        userId: true,
        payableAmount: true,
        paymentStatus: true,
        paidAt: true,
      },
    });
    if (!order) {
      throw new NotFoundException('سفارش یافت نشد');
    }
    if (order.paymentStatus !== 'PAID') {
      throw new BadRequestException('سفارش هنوز پرداخت‌شده نیست');
    }

    const [latestMembership, incentives] = await Promise.all([
      this.prisma.segmentMembership.findFirst({
        where: { customerId: order.userId },
        orderBy: { computedAt: 'desc' },
        select: { segmentId: true },
      }),
      this.prisma.incentive.findMany({
        where: { type: IncentiveType.CASHBACK, isActive: true },
        include: { cashbackDetail: true },
      }),
    ]);

    const now = order.paidAt ?? new Date();
    const orderAmount = order.payableAmount.toNumber();
    const results: CashbackGrantResult[] = [];

    for (const incentive of incentives) {
      if (!incentive.cashbackDetail) continue;

      const alreadyGranted = await this.prisma.incentiveRedemption.findFirst({
        where: { incentiveId: incentive.id, customerId: order.userId, orderId },
        select: { id: true },
      });
      if (alreadyGranted) continue;

      const qualification = qualifiesForCashback({
        isActive: incentive.isActive,
        startsAt: incentive.startsAt,
        endsAt: incentive.endsAt,
        targetSegmentId: incentive.targetSegmentId,
        customerCurrentSegmentId: latestMembership?.segmentId ?? null,
        minPurchaseAmount:
          incentive.cashbackDetail.minPurchaseAmount?.toNumber() ?? null,
        orderAmount,
        now,
      });
      if (!qualification.qualifies) continue;

      const amount = calculateCashbackAmount({
        valueType: incentive.cashbackDetail.valueType,
        value: incentive.cashbackDetail.value.toNumber(),
        orderAmount,
      });
      if (amount <= 0) continue;

      const expiresAt =
        incentive.cashbackDetail.expiresAfterDays != null
          ? new Date(
              now.getTime() +
                incentive.cashbackDetail.expiresAfterDays * DAY_MS,
            )
          : null;

      await this.prisma.$transaction(async (tx) => {
        const redemption = await tx.incentiveRedemption.create({
          data: {
            incentiveId: incentive.id,
            customerId: order.userId,
            orderId,
            amountApplied: new Prisma.Decimal(amount),
          },
        });

        const wallet = await tx.wallet.upsert({
          where: { userId: order.userId },
          create: { userId: order.userId, balance: new Prisma.Decimal(amount) },
          update: { balance: { increment: amount } },
        });

        await tx.creditLedgerEntry.create({
          data: {
            walletId: wallet.id,
            amount: new Prisma.Decimal(amount),
            reason: CreditLedgerReason.CASHBACK,
            incentiveRedemptionId: redemption.id,
            expiresAt,
          },
        });
      });

      results.push({ incentiveId: incentive.id, amount, expiresAt });
    }

    if (results.length > 0) {
      this.logger.log(
        `Granted cashback for order ${orderId}: ` +
          results.map((r) => `${r.incentiveId}=${r.amount}`).join(', '),
      );
    }

    return results;
  }
}
