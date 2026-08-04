import { BadRequestException, Injectable } from '@nestjs/common';
import { CreditLedgerReason, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ApplyCashbackDto } from './dtos/apply-cashback.dto';
import {
  computeAvailableCashback,
  resolveCashbackApplyAmount,
} from './cashback-rules';

@Injectable()
export class CashbackApplyService {
  constructor(private readonly prisma: PrismaService) {}

  async apply(dto: ApplyCashbackDto) {
    const customer = await this.prisma.user.findFirst({
      where: { id: dto.customerId, isDeleted: false },
      select: { id: true },
    });
    if (!customer) {
      throw new BadRequestException('مشتری یافت نشد');
    }

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: dto.customerId },
      include: {
        ledgerEntries: {
          where: {
            reason: {
              in: [CreditLedgerReason.CASHBACK, CreditLedgerReason.USED],
            },
          },
          select: { amount: true, reason: true, expiresAt: true },
        },
      },
    });

    const now = new Date();
    const available = wallet
      ? computeAvailableCashback(
          wallet.ledgerEntries.map((e) => ({
            amount: e.amount.toNumber(),
            reason: e.reason,
            expiresAt: e.expiresAt,
          })),
          now,
        )
      : 0;

    const amountToApply = resolveCashbackApplyAmount({
      available,
      orderAmount: dto.orderAmount,
      requestedAmount: dto.amountToApply,
    });

    if (amountToApply <= 0) {
      throw new BadRequestException(
        'موجودی کش‌بک معتبر و منقضی‌نشده‌ای برای اعمال وجود ندارد',
      );
    }

    await this.prisma.$transaction([
      this.prisma.creditLedgerEntry.create({
        data: {
          walletId: wallet!.id,
          amount: new Prisma.Decimal(-amountToApply),
          reason: CreditLedgerReason.USED,
        },
      }),
      this.prisma.wallet.update({
        where: { id: wallet!.id },
        data: { balance: { decrement: amountToApply } },
      }),
    ]);

    return {
      appliedAmount: amountToApply,
      payableAmount: dto.orderAmount - amountToApply,
      remainingCashback: available - amountToApply,
    };
  }
}
