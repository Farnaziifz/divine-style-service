import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreditLedgerReason, Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import { PaymentService } from '../payment/payment.service';
import { TopUpWalletDto } from './dtos/topup-wallet.dto';
import { RequestWithdrawalDto } from './dtos/request-withdrawal.dto';
import { ResolveWithdrawalDto } from './dtos/resolve-withdrawal.dto';
import { WithdrawalQueryDto } from './dtos/withdrawal-query.dto';

function toCents(value: any): number {
  const n =
    value && typeof value.toNumber === 'function' ? value.toNumber() : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function fromCents(cents: number): number {
  return cents / 100;
}

type ProviderName = 'ZARINPAL' | 'ZIBAL';

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
  ) {}

  private parseActiveProviders(raw: string | null | undefined): ProviderName[] {
    if (!raw) return ['ZARINPAL'];
    const trimmed = raw.trim();
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .map((x) => String(x).toUpperCase())
          .filter((x) => x === 'ZARINPAL' || x === 'ZIBAL') as ProviderName[];
        return normalized.length > 0 ? Array.from(new Set(normalized)) : ['ZARINPAL'];
      }
    } catch {
      // ignore
    }
    const normalized = trimmed
      .split(',')
      .map((x) => x.trim().toUpperCase())
      .filter((x) => x === 'ZARINPAL' || x === 'ZIBAL') as ProviderName[];
    return normalized.length > 0 ? Array.from(new Set(normalized)) : ['ZARINPAL'];
  }

  private normalizeDefaultProvider(
    active: ProviderName[],
    rawDefault: string | null | undefined,
  ): ProviderName {
    const desired = String(rawDefault ?? '').trim().toUpperCase();
    const fallback = active[0] ?? 'ZARINPAL';
    if (desired === 'ZARINPAL' || desired === 'ZIBAL') {
      return active.includes(desired as ProviderName)
        ? (desired as ProviderName)
        : fallback;
    }
    return fallback;
  }

  private async resolveProvider(requested?: ProviderName): Promise<ProviderName> {
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
    const active = this.parseActiveProviders(activeSetting?.value);
    const fallback = this.normalizeDefaultProvider(active, defaultSetting?.value);
    return requested && active.includes(requested) ? requested : fallback;
  }

  private serializeLedgerEntry(e: {
    id: string;
    amount: Prisma.Decimal;
    reason: CreditLedgerReason;
    expiresAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: e.id,
      amount: e.amount.toNumber(),
      reason: e.reason,
      expiresAt: e.expiresAt,
      createdAt: e.createdAt,
    };
  }

  private serializeWithdrawal(w: {
    id: string;
    amount: Prisma.Decimal;
    cardNumber: string;
    status: string;
    adminNote: string | null;
    requestedAt: Date;
    resolvedAt: Date | null;
  }) {
    return {
      id: w.id,
      amount: w.amount.toNumber(),
      cardNumber: w.cardNumber,
      status: w.status,
      adminNote: w.adminNote,
      requestedAt: w.requestedAt,
      resolvedAt: w.resolvedAt,
    };
  }

  async getMine(userId: string) {
    const [priorPaidCount, wallet, withdrawals] = await Promise.all([
      this.prisma.order.count({
        where: { userId, paymentStatus: 'PAID', isDeleted: false },
      }),
      this.prisma.wallet.findUnique({
        where: { userId },
        include: {
          ledgerEntries: {
            orderBy: { createdAt: 'desc' },
            take: 50,
          },
        },
      }),
      this.prisma.walletWithdrawalRequest.findMany({
        where: { userId },
        orderBy: { requestedAt: 'desc' },
        take: 20,
      }),
    ]);

    return {
      eligible: priorPaidCount > 0,
      balance: wallet?.balance.toNumber() ?? 0,
      ledger: (wallet?.ledgerEntries ?? []).map((e) => this.serializeLedgerEntry(e)),
      withdrawals: withdrawals.map((w) => this.serializeWithdrawal(w)),
    };
  }

  async topUp(userId: string, dto: TopUpWalletDto) {
    const provider = await this.resolveProvider(dto.provider);

    const topUp = await this.prisma.walletTopUp.create({
      data: {
        userId,
        provider,
        amount: new Prisma.Decimal(dto.amount),
        status: 'INITIATED',
      },
    });

    const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3005';
    const lang = dto.lang === 'en' ? 'en' : 'fa';
    const callbackUrl =
      provider === 'ZIBAL'
        ? `${backendUrl}/wallet/topup/zibal/callback?lang=${lang}`
        : `${backendUrl}/wallet/topup/zarinpal/callback?lang=${lang}`;

    let requested: { authority: string; paymentUrl: string | null; isMock: boolean };
    try {
      if (provider === 'ZIBAL') {
        requested = await this.paymentService.requestZibalPayment({
          amountRial: dto.amount * 10,
          description: `Wallet top-up ${topUp.id}`,
          callbackUrl,
        });
      } else {
        requested = await this.paymentService.requestZarinpalPayment({
          amountToman: dto.amount,
          description: `Wallet top-up ${topUp.id}`,
          callbackUrl,
        });
      }
    } catch (e) {
      await this.prisma.walletTopUp.update({
        where: { id: topUp.id },
        data: { status: 'FAILED' },
      });
      throw e;
    }

    if (requested.isMock) {
      await this.prisma.$transaction(async (tx) => {
        await tx.walletTopUp.update({
          where: { id: topUp.id },
          data: {
            authority: requested.authority,
            status: 'PAID',
            refId: `MOCK-${Date.now()}`,
            verifiedAt: new Date(),
          },
        });
        const wallet = await tx.wallet.upsert({
          where: { userId },
          create: { userId, balance: new Prisma.Decimal(dto.amount) },
          update: { balance: { increment: dto.amount } },
        });
        await tx.creditLedgerEntry.create({
          data: {
            walletId: wallet.id,
            amount: new Prisma.Decimal(dto.amount),
            reason: CreditLedgerReason.TOPUP,
          },
        });
      });
      return { status: 'PAID' as const, paymentUrl: null };
    }

    await this.prisma.walletTopUp.update({
      where: { id: topUp.id },
      data: { authority: requested.authority },
    });
    return { status: 'INITIATED' as const, paymentUrl: requested.paymentUrl };
  }

  async verifyTopUpCallback(
    provider: ProviderName,
    authority: string,
    zarinpalStatus: string | undefined,
    lang: string,
  ): Promise<string> {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const language = lang === 'en' ? 'en' : 'fa';
    const successRedirect = `${frontendUrl}/${language}/dashboard/wallet?topup=success`;
    const failedRedirect = `${frontendUrl}/${language}/dashboard/wallet?topup=failed`;

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wallet-topup:${authority}`}))`;

      const topUp = await tx.walletTopUp.findFirst({ where: { authority } });
      if (!topUp) return failedRedirect;
      if (topUp.status === 'PAID') return successRedirect;

      if (provider === 'ZARINPAL' && zarinpalStatus !== 'OK') {
        await tx.walletTopUp.update({
          where: { id: topUp.id },
          data: { status: 'FAILED' },
        });
        return failedRedirect;
      }

      const amountToman = Math.round(Number(topUp.amount));
      let verified: { refId: string };
      try {
        verified =
          provider === 'ZIBAL'
            ? await this.paymentService.verifyZibalPayment({ trackId: authority })
            : await this.paymentService.verifyZarinpalPayment({
                authority,
                amountToman,
              });
      } catch {
        await tx.walletTopUp.update({
          where: { id: topUp.id },
          data: { status: 'FAILED' },
        });
        return failedRedirect;
      }

      await tx.walletTopUp.update({
        where: { id: topUp.id },
        data: { status: 'PAID', refId: verified.refId || null, verifiedAt: new Date() },
      });
      const wallet = await tx.wallet.upsert({
        where: { userId: topUp.userId },
        create: { userId: topUp.userId, balance: topUp.amount },
        update: { balance: { increment: topUp.amount } },
      });
      await tx.creditLedgerEntry.create({
        data: {
          walletId: wallet.id,
          amount: topUp.amount,
          reason: CreditLedgerReason.TOPUP,
        },
      });

      return successRedirect;
    });
  }

  async requestWithdrawal(userId: string, dto: RequestWithdrawalDto) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || wallet.balance.toNumber() < dto.amount) {
      throw new BadRequestException('موجودی کیف‌پول کافی نیست');
    }

    const request = await this.prisma.$transaction(async (tx) => {
      const decremented = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: new Prisma.Decimal(dto.amount) } },
        data: { balance: { decrement: dto.amount } },
      });
      if (decremented.count === 0) {
        throw new BadRequestException('موجودی کیف‌پول کافی نیست');
      }
      await tx.creditLedgerEntry.create({
        data: {
          walletId: wallet.id,
          amount: new Prisma.Decimal(-dto.amount),
          reason: CreditLedgerReason.WITHDRAWAL_REQUEST,
        },
      });
      return tx.walletWithdrawalRequest.create({
        data: {
          userId,
          amount: new Prisma.Decimal(dto.amount),
          cardNumber: dto.cardNumber.trim(),
          status: 'PENDING',
        },
      });
    });

    return this.serializeWithdrawal(request);
  }

  async listMyWithdrawals(userId: string) {
    const rows = await this.prisma.walletWithdrawalRequest.findMany({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
    });
    return rows.map((w) => this.serializeWithdrawal(w));
  }

  async listWithdrawalsForAdmin(query: WithdrawalQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.WalletWithdrawalRequestWhereInput = {};
    if (query.status) where.status = query.status;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.walletWithdrawalRequest.count({ where }),
      this.prisma.walletWithdrawalRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { requestedAt: 'desc' },
        include: {
          user: { select: { id: true, mobile: true, name: true, lastName: true } },
        },
      }),
    ]);

    return {
      data: rows.map((r) => {
        const { user, ...w } = r;
        return { ...this.serializeWithdrawal(w), user };
      }),
      meta: { total, page, limit, lastPage: Math.ceil(total / limit) || 1 },
    };
  }

  async resolveWithdrawal(id: string, dto: ResolveWithdrawalDto) {
    const request = await this.prisma.walletWithdrawalRequest.findFirst({
      where: { id },
    });
    if (!request) throw new NotFoundException('درخواست برداشت یافت نشد');
    if (request.status !== 'PENDING') {
      throw new BadRequestException('این درخواست قبلاً رسیدگی شده است');
    }

    if (dto.action === 'REJECTED') {
      await this.prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.upsert({
          where: { userId: request.userId },
          create: { userId: request.userId, balance: request.amount },
          update: { balance: { increment: request.amount } },
        });
        await tx.creditLedgerEntry.create({
          data: {
            walletId: wallet.id,
            amount: request.amount,
            reason: CreditLedgerReason.ADJUSTMENT,
          },
        });
        await tx.walletWithdrawalRequest.update({
          where: { id },
          data: {
            status: 'REJECTED',
            adminNote: dto.adminNote ?? null,
            resolvedAt: new Date(),
          },
        });
      });
    } else {
      await this.prisma.walletWithdrawalRequest.update({
        where: { id },
        data: {
          status: 'PAID',
          adminNote: dto.adminNote ?? null,
          resolvedAt: new Date(),
        },
      });
    }

    const updated = await this.prisma.walletWithdrawalRequest.findFirst({
      where: { id },
    });
    return this.serializeWithdrawal(updated!);
  }

  /**
   * چک‌اوت سبد خرید — فقط محاسبهٔ مبلغ قابل‌اعمال از کیف‌پول؛ نوشتن واقعی
   * (کسر موجودی + ledger) داخل تراکنش ساخت سفارش در BasketController انجام
   * می‌شود، دقیقاً مثل الگوی referralLookup.
   */
  async applyToCheckout(
    userId: string,
    requestedAmountCents: number,
    remainingPayableCents: number,
  ): Promise<number> {
    if (requestedAmountCents <= 0 || remainingPayableCents <= 0) return 0;
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) return 0;
    const balanceCents = toCents(wallet.balance);
    return Math.max(
      0,
      Math.min(requestedAmountCents, balanceCents, remainingPayableCents),
    );
  }

  /**
   * خرج موجودی کیف‌پول در چک‌اوت — reason=USED. فقط بعد از applyToCheckout
   * صدا زده می‌شود، پس یعنی کیف‌پولی با موجودی کافی از قبل وجود دارد.
   */
  async debitForCheckout(
    tx: Prisma.TransactionClient,
    userId: string,
    amountCents: number,
  ): Promise<void> {
    if (amountCents <= 0) return;
    const amountToman = fromCents(amountCents);
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      throw new BadRequestException('کیف‌پول یافت نشد');
    }
    const decremented = await tx.wallet.updateMany({
      where: { id: wallet.id, balance: { gte: new Prisma.Decimal(amountToman) } },
      data: { balance: { decrement: amountToman } },
    });
    if (decremented.count === 0) {
      throw new BadRequestException('موجودی کیف‌پول کافی نیست');
    }
    await tx.creditLedgerEntry.create({
      data: {
        walletId: wallet.id,
        amount: new Prisma.Decimal(-amountToman),
        reason: CreditLedgerReason.USED,
      },
    });
  }
}
