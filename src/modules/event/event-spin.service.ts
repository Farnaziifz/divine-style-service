import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { CreditLedgerReason, EventSpinPrize, Prisma } from '@prisma/client';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { SmsTextService } from '../shared/sms/sms-text.service';

/** همهٔ جایزه‌ها شانس برابر دارند */
const PRIZES: EventSpinPrize[] = [
  EventSpinPrize.EVENT_CASHBACK_10,
  EventSpinPrize.SITE_DISCOUNT_20,
  EventSpinPrize.FREE_SHIPPING_3,
  EventSpinPrize.WALLET_60K,
  EventSpinPrize.WALLET_120K,
];

const WALLET_PRIZE_AMOUNT: Partial<Record<EventSpinPrize, number>> = {
  WALLET_60K: 60_000,
  WALLET_120K: 120_000,
};

const CASHBACK_PERCENT = 10;
const SITE_DISCOUNT_PERCENT = 20;
const SITE_DISCOUNT_VALID_DAYS = 30;
const FREE_SHIPPING_USES = 3;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

export function serializeSpin(spin: {
  prize: EventSpinPrize;
  rewardCode: string | null;
  rewardAmount: Prisma.Decimal | null;
}) {
  return {
    prize: spin.prize,
    rewardCode: spin.rewardCode,
    rewardAmount: spin.rewardAmount?.toNumber() ?? null,
  };
}

@Injectable()
export class EventSpinService {
  private readonly logger = new Logger(EventSpinService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly smsText: SmsTextService,
  ) {}

  /** ارسال پیامک جایزه best-effort است؛ شکستش نباید چرخش ثبت‌شده را خراب کند */
  private async sendPrizeSms(
    userId: string,
    spin: { prize: EventSpinPrize; rewardCode: string | null; rewardAmount: Prisma.Decimal | null },
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { mobile: true },
      });
      if (!user) return;
      await this.smsText.send(
        user.mobile,
        this.smsText.buildEventPrizeText({
          prize: spin.prize,
          rewardAmount: spin.rewardAmount?.toNumber() ?? null,
          rewardCode: spin.rewardCode,
        }),
      );
    } catch (err) {
      this.logger.warn(`Event prize SMS failed for user ${userId}: ${(err as Error).message}`);
    }
  }

  private async creditWallet(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    reason: CreditLedgerReason,
  ) {
    const value = new Prisma.Decimal(amount);
    const wallet = await tx.wallet.upsert({
      where: { userId },
      create: { userId, balance: value },
      update: { balance: { increment: value } },
    });
    await tx.creditLedgerEntry.create({
      data: { walletId: wallet.id, amount: value, reason },
    });
  }

  private async uniqueDiscountCode(tx: Prisma.TransactionClient): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = `EVT-${randomCode(8)}`;
      const exists = await tx.discountCode.findUnique({ where: { code }, select: { id: true } });
      if (!exists) return code;
    }
    throw new BadRequestException('ساخت کد تخفیف ناموفق بود، دوباره تلاش کنید');
  }

  /** هر پرداخت موفق دقیقاً یک بار می‌تواند بچرخد؛ جایزه در همان تراکنش صادر می‌شود */
  async spin(userId: string, paymentId: string) {
    const payment = await this.prisma.eventPayment.findFirst({
      where: { id: paymentId },
      include: { spin: true },
    });
    if (!payment) throw new NotFoundException('پرداخت یافت نشد');
    if (payment.userId !== userId) throw new ForbiddenException();
    if (payment.status !== 'PAID') {
      throw new BadRequestException('چرخش فقط بعد از پرداخت موفق ممکن است');
    }
    if (payment.spin) {
      throw new BadRequestException('برای این پرداخت قبلاً چرخانده‌اید');
    }

    const prize = PRIZES[randomInt(PRIZES.length)];

    try {
      const spin = await this.prisma.$transaction(async (tx) => {
        let rewardCode: string | null = null;
        let rewardAmount: number | null = null;

        switch (prize) {
          case EventSpinPrize.EVENT_CASHBACK_10:
            rewardAmount = Math.round((payment.amount.toNumber() * CASHBACK_PERCENT) / 100);
            await this.creditWallet(tx, userId, rewardAmount, CreditLedgerReason.CASHBACK);
            break;
          case EventSpinPrize.WALLET_60K:
          case EventSpinPrize.WALLET_120K:
            rewardAmount = WALLET_PRIZE_AMOUNT[prize]!;
            await this.creditWallet(tx, userId, rewardAmount, CreditLedgerReason.GIFT);
            break;
          case EventSpinPrize.SITE_DISCOUNT_20: {
            rewardCode = await this.uniqueDiscountCode(tx);
            const now = new Date();
            await tx.discountCode.create({
              data: {
                code: rewardCode,
                title: 'جایزهٔ چرخ‌گردون رویداد',
                scope: 'SINGLE_USER',
                userId,
                valueType: 'PERCENT',
                value: new Prisma.Decimal(SITE_DISCOUNT_PERCENT),
                validFrom: now,
                validTo: new Date(now.getTime() + SITE_DISCOUNT_VALID_DAYS * 86_400_000),
                maxTotalUses: 1,
              },
            });
            break;
          }
          case EventSpinPrize.FREE_SHIPPING_3:
            await tx.freeShippingGrant.create({
              data: { userId, remainingUses: FREE_SHIPPING_USES },
            });
            break;
        }

        // unique روی eventPaymentId جلوی چرخش هم‌زمان دوباره را می‌گیرد و کل تراکنش را برمی‌گرداند
        return tx.eventSpin.create({
          data: {
            eventPaymentId: payment.id,
            userId,
            prize,
            rewardCode,
            rewardAmount: rewardAmount != null ? new Prisma.Decimal(rewardAmount) : null,
          },
        });
      });
      await this.sendPrizeSms(userId, spin);
      return serializeSpin(spin);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('برای این پرداخت قبلاً چرخانده‌اید');
      }
      throw e;
    }
  }
}
