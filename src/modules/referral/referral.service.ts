import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ReferralCode } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import { CreateReferralCodeDto } from './dtos/create-referral-code.dto';
import { CreateBloggerReferralCodeDto } from './dtos/create-blogger-referral-code.dto';
import { UpdateReferralCodeDto } from './dtos/update-referral-code.dto';
import { ReferralCodeQueryDto } from './dtos/referral-code-query.dto';

export const MAX_COMBINED_REFERRAL_PERCENT = 20;

/** هر کد ریفرال فقط برای ۳ خرید اول هر خریدار قابل استفاده است */
export const MAX_REFERRAL_USES_PER_BUYER = 3;

export interface ReferralCheckoutLookup {
  referralCodeId: string;
  discountAmountCents: number;
  cashbackAmount: number;
}

@Injectable()
export class ReferralService {
  constructor(private readonly prisma: PrismaService) {}

  private assertPercentRules(discountPercent: number, cashbackPercent: number) {
    if (discountPercent < 0 || cashbackPercent < 0) {
      throw new BadRequestException('درصدها نمی‌توانند منفی باشند');
    }
    if (discountPercent + cashbackPercent > MAX_COMBINED_REFERRAL_PERCENT) {
      throw new BadRequestException(
        `مجموع درصد تخفیف و کش‌بک نباید از ${MAX_COMBINED_REFERRAL_PERCENT}٪ بیشتر باشد`,
      );
    }
  }

  private serialize(rc: ReferralCode) {
    return {
      ...rc,
      discountPercent: rc.discountPercent.toNumber(),
      cashbackPercent: rc.cashbackPercent.toNumber(),
    };
  }

  private async generateUniqueCode(): Promise<string> {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 5; attempt++) {
      let code = '';
      for (let i = 0; i < 8; i++) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      const existing = await this.prisma.referralCode.findFirst({
        where: { code },
        select: { id: true },
      });
      if (!existing) return code;
    }
    return `${Date.now()}`.slice(-8);
  }

  async createForSelf(ownerId: string, dto: CreateReferralCodeDto) {
    this.assertPercentRules(dto.discountPercent, dto.cashbackPercent);

    const priorPaidCount = await this.prisma.order.count({
      where: { userId: ownerId, paymentStatus: 'PAID', isDeleted: false },
    });
    if (priorPaidCount === 0) {
      throw new BadRequestException(
        'برای ساخت کد ریفرال باید حداقل یک خرید موفق داشته باشید',
      );
    }

    const code = await this.generateUniqueCode();
    const created = await this.prisma.referralCode.create({
      data: {
        code,
        ownerId,
        discountPercent: new Prisma.Decimal(dto.discountPercent),
        cashbackPercent: new Prisma.Decimal(dto.cashbackPercent),
        createdByAdmin: false,
      },
    });
    return this.serialize(created);
  }

  async createForBlogger(dto: CreateBloggerReferralCodeDto) {
    this.assertPercentRules(dto.discountPercent, dto.cashbackPercent);

    let owner = await this.prisma.user.findUnique({
      where: { mobile: dto.mobile },
    });
    if (!owner) {
      owner = await this.prisma.user.create({
        data: { mobile: dto.mobile, name: dto.name },
      });
    }

    const code = await this.generateUniqueCode();
    const created = await this.prisma.referralCode.create({
      data: {
        code,
        ownerId: owner.id,
        discountPercent: new Prisma.Decimal(dto.discountPercent),
        cashbackPercent: new Prisma.Decimal(dto.cashbackPercent),
        createdByAdmin: true,
      },
    });
    return { ...this.serialize(created), owner };
  }

  private async withStats<T extends { id: string }>(codes: T[]) {
    if (codes.length === 0) return [];
    const ids = codes.map((c) => c.id);
    const grouped = await this.prisma.referralRedemption.groupBy({
      by: ['referralCodeId', 'cashbackStatus'],
      where: { referralCodeId: { in: ids } },
      _sum: { cashbackAmount: true },
      _count: { _all: true },
    });
    const statsByCode = new Map<
      string,
      { usedCount: number; totalCashbackCredited: number; totalCashbackPending: number }
    >();
    for (const row of grouped) {
      const entry = statsByCode.get(row.referralCodeId) ?? {
        usedCount: 0,
        totalCashbackCredited: 0,
        totalCashbackPending: 0,
      };
      entry.usedCount += row._count._all;
      const sum = row._sum.cashbackAmount?.toNumber() ?? 0;
      if (row.cashbackStatus === 'CREDITED') entry.totalCashbackCredited += sum;
      else entry.totalCashbackPending += sum;
      statsByCode.set(row.referralCodeId, entry);
    }
    return codes.map((c) => ({
      ...c,
      stats: statsByCode.get(c.id) ?? {
        usedCount: 0,
        totalCashbackCredited: 0,
        totalCashbackPending: 0,
      },
    }));
  }

  async findMine(ownerId: string) {
    const [rows, priorPaidCount] = await Promise.all([
      this.prisma.referralCode.findMany({
        where: { ownerId, isDeleted: false },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.count({
        where: { userId: ownerId, paymentStatus: 'PAID', isDeleted: false },
      }),
    ]);
    return {
      eligible: priorPaidCount > 0,
      codes: await this.withStats(rows.map((r) => this.serialize(r))),
    };
  }

  async findAllForAdmin(query: ReferralCodeQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.ReferralCodeWhereInput = { isDeleted: false };
    if (query.isActive !== undefined) {
      where.isActive = query.isActive === 'true';
    }
    if (query.search?.trim()) {
      const s = query.search.trim();
      where.OR = [
        { code: { contains: s, mode: 'insensitive' } },
        { owner: { mobile: { contains: s, mode: 'insensitive' } } },
        { owner: { name: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.referralCode.count({ where }),
      this.prisma.referralCode.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          owner: {
            select: { id: true, mobile: true, name: true, lastName: true },
          },
        },
      }),
    ]);

    const data = await this.withStats(
      rows.map((r) => {
        const { owner, ...rc } = r;
        return { ...this.serialize(rc), owner };
      }),
    );

    return {
      data,
      meta: { total, page, limit, lastPage: Math.ceil(total / limit) || 1 },
    };
  }

  private async findOneOwned(id: string, actor: { id: string; role: string }) {
    const row = await this.prisma.referralCode.findFirst({
      where: { id, isDeleted: false },
    });
    if (!row) throw new NotFoundException('کد ریفرال یافت نشد');
    if (actor.role !== 'ADMIN' && row.ownerId !== actor.id) {
      throw new ForbiddenException();
    }
    return row;
  }

  async update(
    id: string,
    dto: UpdateReferralCodeDto,
    actor: { id: string; role: string },
  ) {
    const current = await this.findOneOwned(id, actor);

    const discountPercent =
      dto.discountPercent ?? current.discountPercent.toNumber();
    const cashbackPercent =
      dto.cashbackPercent ?? current.cashbackPercent.toNumber();
    if (dto.discountPercent !== undefined || dto.cashbackPercent !== undefined) {
      this.assertPercentRules(discountPercent, cashbackPercent);
    }

    const updated = await this.prisma.referralCode.update({
      where: { id },
      data: {
        ...(dto.discountPercent !== undefined
          ? { discountPercent: new Prisma.Decimal(discountPercent) }
          : {}),
        ...(dto.cashbackPercent !== undefined
          ? { cashbackPercent: new Prisma.Decimal(cashbackPercent) }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    return this.serialize(updated);
  }

  async deactivate(id: string, actor: { id: string; role: string }) {
    await this.findOneOwned(id, actor);
    await this.prisma.referralCode.update({
      where: { id },
      data: { isActive: false, isDeleted: true, deletedAt: new Date() },
    });
    return { success: true };
  }

  /** اطلاعات عمومی یک کد ریفرال (بدون نیاز به لاگین) — برای بنر «با معرفی فلانی اومدی» */
  async lookupPublic(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return null;

    const referralCode = await this.prisma.referralCode.findFirst({
      where: { code: trimmed, isActive: true, isDeleted: false },
      include: { owner: { select: { name: true, lastName: true } } },
    });
    if (!referralCode) return null;

    const ownerName =
      [referralCode.owner?.name, referralCode.owner?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() || null;

    return {
      code: referralCode.code,
      discountPercent: referralCode.discountPercent.toNumber(),
      ownerName,
    };
  }

  /**
   * چک‌اوت — مثل lookupLoyaltyDiscount تو BasketController: فقط محاسبه و
   * اعتبارسنجی؛ ثبت ReferralRedemption بعد از ساخت سفارش انجام می‌شود.
   * برمی‌گرداند null اگر کد اصلاً پیدا نشد (تا caller بتواند به fallback بعدی برود)؛
   * در غیر این صورت کد پیدا شده ولی نامعتبر است → BadRequestException.
   */
  async lookupForCheckout(
    code: string,
    subtotalCents: number,
    buyerId: string,
  ): Promise<ReferralCheckoutLookup | null> {
    const referralCode = await this.prisma.referralCode.findFirst({
      where: { code },
    });
    if (!referralCode) return null;

    if (!referralCode.isActive || referralCode.isDeleted) {
      throw new BadRequestException('کد تخفیف معتبر نیست');
    }
    if (referralCode.ownerId === buyerId) {
      throw new BadRequestException('نمی‌توانید از کد ریفرال خودتان استفاده کنید');
    }

    const priorUses = await this.prisma.referralRedemption.count({
      where: { referralCodeId: referralCode.id, buyerId },
    });
    if (priorUses >= MAX_REFERRAL_USES_PER_BUYER) {
      throw new BadRequestException('این کد ریفرال قبلاً حداکثر تعداد مجاز استفاده را داشته است');
    }

    const discountAmountCents = Math.round(
      (subtotalCents * referralCode.discountPercent.toNumber()) / 100,
    );
    const subtotalToman = subtotalCents / 100;
    const cashbackAmount = Math.round(
      (subtotalToman * referralCode.cashbackPercent.toNumber()) / 100,
    );

    return {
      referralCodeId: referralCode.id,
      discountAmountCents,
      cashbackAmount,
    };
  }
}
