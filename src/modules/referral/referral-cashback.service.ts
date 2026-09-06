import { Injectable, Logger } from '@nestjs/common';
import { CreditLedgerReason, Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';

@Injectable()
export class ReferralCashbackService {
  private readonly logger = new Logger(ReferralCashbackService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * روی سفارشی که پرداختش تأیید شد، اگر با کد ریفرال ثبت شده باشد، کش‌بک
   * معرف را به کیف‌پولش واریز می‌کند. Idempotent بر اساس orderId — اگر قبلاً
   * CREDITED شده باشد دوباره واریز نمی‌شود (دقیقاً مثل CashbackGrantService).
   */
  async grantForOrder(orderId: string): Promise<void> {
    const redemption = await this.prisma.referralRedemption.findUnique({
      where: { orderId },
      include: { referralCode: { select: { ownerId: true } } },
    });
    if (!redemption || redemption.cashbackStatus === 'CREDITED') return;
    if (redemption.cashbackAmount.toNumber() <= 0) return;

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, isDeleted: false },
      select: { paymentStatus: true },
    });
    if (!order || order.paymentStatus !== 'PAID') return;

    const ownerId = redemption.referralCode.ownerId;
    const amount = redemption.cashbackAmount;

    await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.upsert({
        where: { userId: ownerId },
        create: { userId: ownerId, balance: amount },
        update: { balance: { increment: amount } },
      });

      await tx.creditLedgerEntry.create({
        data: {
          walletId: wallet.id,
          amount: new Prisma.Decimal(amount),
          reason: CreditLedgerReason.CASHBACK,
        },
      });

      await tx.referralRedemption.update({
        where: { id: redemption.id },
        data: { cashbackStatus: 'CREDITED', creditedAt: new Date() },
      });
    });

    this.logger.log(
      `Granted referral cashback for order ${orderId} to user ${ownerId}: ${amount.toString()}`,
    );
  }
}
