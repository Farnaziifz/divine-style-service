import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IncentiveTierType,
  IncentiveType,
  IncentiveUsageType,
  IncentiveValueType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateDiscountIncentiveDto } from './dtos/create-discount-incentive.dto';
import { UpdateDiscountIncentiveDto } from './dtos/update-discount-incentive.dto';
import { DiscountIncentiveQueryDto } from './dtos/discount-incentive-query.dto';

const detailInclude = {
  discountCodeDetail: { include: { tiers: true } },
  targetSegment: { select: { id: true, key: true, label: true } },
} satisfies Prisma.IncentiveInclude;

type IncentiveWithDetail = Prisma.IncentiveGetPayload<{
  include: typeof detailInclude;
}>;

@Injectable()
export class DiscountIncentiveService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private assertValueRules(
    valueType: IncentiveValueType,
    value: number,
    label = 'مقدار تخفیف',
  ) {
    if (valueType === IncentiveValueType.PERCENTAGE) {
      if (value <= 0 || value > 100) {
        throw new BadRequestException(`${label} درصدی باید بین ۱ تا ۱۰۰ باشد`);
      }
    } else if (value <= 0) {
      throw new BadRequestException(`${label} باید بزرگ‌تر از صفر باشد`);
    }
  }

  private assertTierRules(
    tierType: IncentiveTierType,
    valueType: IncentiveValueType,
    tiers:
      | { minAmount?: number; usageIndex?: number; value: number }[]
      | undefined,
    usageType?: IncentiveUsageType,
  ) {
    if (tierType === IncentiveTierType.STEPPED) {
      if (!tiers || tiers.length === 0) {
        throw new BadRequestException(
          'برای tierType=STEPPED حداقل یک پله لازم است',
        );
      }
      const seen = new Set<number>();
      for (const tier of tiers) {
        if (tier.minAmount == null) {
          throw new BadRequestException(
            'برای tierType=STEPPED باید minAmount هر پله مشخص باشد',
          );
        }
        if (seen.has(tier.minAmount)) {
          throw new BadRequestException('حداقل مبلغ پله‌ها نباید تکراری باشد');
        }
        seen.add(tier.minAmount);
        this.assertValueRules(valueType, tier.value, 'مقدار پله');
      }
    } else if (tierType === IncentiveTierType.USAGE_STEPPED) {
      if (!tiers || tiers.length === 0) {
        throw new BadRequestException(
          'برای tierType=USAGE_STEPPED حداقل یک پله لازم است',
        );
      }
      if (usageType !== IncentiveUsageType.MULTI_USE) {
        throw new BadRequestException(
          'برای tierType=USAGE_STEPPED باید usageType=MULTI_USE باشد',
        );
      }
      const indexes = tiers
        .map((t) => t.usageIndex)
        .sort((a, b) => (a ?? 0) - (b ?? 0));
      const expected = tiers.map((_, i) => i + 1);
      const isSequential = indexes.every((v, i) => v === expected[i]);
      if (!isSequential) {
        throw new BadRequestException(
          'پله‌های USAGE_STEPPED باید پیوسته از ۱ شروع شوند (مثلاً ۱، ۲، ۳)',
        );
      }
      for (const tier of tiers) {
        this.assertValueRules(valueType, tier.value, 'مقدار پله');
      }
    } else if (tiers && tiers.length > 0) {
      throw new BadRequestException('برای tierType=FLAT نباید پله ارسال شود');
    }
  }

  private assertDates(startsAt: Date, endsAt: Date) {
    if (startsAt >= endsAt) {
      throw new BadRequestException('تاریخ پایان باید بعد از تاریخ شروع باشد');
    }
  }

  private async assertSegmentExists(targetSegmentId?: string | null) {
    if (!targetSegmentId) return;
    const segment = await this.prisma.customerSegment.findUnique({
      where: { id: targetSegmentId },
      select: { id: true },
    });
    if (!segment) {
      throw new BadRequestException('سگمنت هدف یافت نشد');
    }
  }

  private serialize(incentive: IncentiveWithDetail) {
    const { discountCodeDetail, targetSegment, ...rest } = incentive;
    return {
      ...rest,
      targetSegment,
      discountCodeDetail: discountCodeDetail
        ? {
            code: discountCodeDetail.code,
            valueType: discountCodeDetail.valueType,
            value: discountCodeDetail.value.toNumber(),
            tierType: discountCodeDetail.tierType,
            usageType: discountCodeDetail.usageType,
            minPurchaseAmount:
              discountCodeDetail.minPurchaseAmount?.toNumber() ?? null,
            tiers:
              discountCodeDetail.tierType === IncentiveTierType.USAGE_STEPPED
                ? discountCodeDetail.tiers
                    .map((t) => ({
                      usageIndex: t.usageIndex,
                      value: t.value.toNumber(),
                    }))
                    .sort((a, b) => (a.usageIndex ?? 0) - (b.usageIndex ?? 0))
                : discountCodeDetail.tiers
                    .map((t) => ({
                      minAmount: t.minAmount?.toNumber() ?? 0,
                      value: t.value.toNumber(),
                    }))
                    .sort((a, b) => a.minAmount - b.minAmount),
          }
        : null,
    };
  }

  async create(dto: CreateDiscountIncentiveDto) {
    const code = this.normalizeCode(dto.code);
    const valueType = dto.valueType;
    const tierType = dto.tierType ?? IncentiveTierType.FLAT;
    const usageType = dto.usageType ?? IncentiveUsageType.SINGLE_USE;

    this.assertValueRules(valueType, dto.value);
    this.assertTierRules(tierType, valueType, dto.tiers, usageType);

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    this.assertDates(startsAt, endsAt);

    await this.assertSegmentExists(dto.targetSegmentId);

    const existing = await this.prisma.discountCodeDetail.findUnique({
      where: { code },
    });
    if (existing) {
      throw new ConflictException('این کد تخفیف قبلاً ثبت شده است');
    }

    const created = await this.prisma.incentive.create({
      data: {
        type: IncentiveType.DISCOUNT_CODE,
        title: dto.title.trim(),
        targetSegmentId: dto.targetSegmentId ?? null,
        isActive: dto.isActive ?? true,
        startsAt,
        endsAt,
        discountCodeDetail: {
          create: {
            code,
            valueType,
            value: new Prisma.Decimal(dto.value),
            tierType,
            usageType,
            minPurchaseAmount:
              dto.minPurchaseAmount != null
                ? new Prisma.Decimal(dto.minPurchaseAmount)
                : null,
            tiers: dto.tiers?.length
              ? {
                  createMany: {
                    data: dto.tiers.map((t) =>
                      tierType === IncentiveTierType.USAGE_STEPPED
                        ? {
                            usageIndex: t.usageIndex,
                            value: new Prisma.Decimal(t.value),
                          }
                        : {
                            minAmount: new Prisma.Decimal(t.minAmount!),
                            value: new Prisma.Decimal(t.value),
                          },
                    ),
                  },
                }
              : undefined,
          },
        },
      },
      include: detailInclude,
    });

    return this.serialize(created);
  }

  async findAll(query: DiscountIncentiveQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.IncentiveWhereInput = {
      type: IncentiveType.DISCOUNT_CODE,
    };
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.targetSegmentId !== undefined) {
      where.targetSegmentId = query.targetSegmentId;
    }
    if (query.search?.trim()) {
      const s = query.search.trim();
      where.OR = [
        { title: { contains: s, mode: 'insensitive' } },
        { discountCodeDetail: { code: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.incentive.count({ where }),
      this.prisma.incentive.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: detailInclude,
      }),
    ]);

    return {
      data: rows.map((r) => this.serialize(r)),
      meta: { total, page, limit, lastPage: Math.ceil(total / limit) || 1 },
    };
  }

  private async findIncentiveOrThrow(id: string): Promise<IncentiveWithDetail> {
    const incentive = await this.prisma.incentive.findFirst({
      where: { id, type: IncentiveType.DISCOUNT_CODE },
      include: detailInclude,
    });
    if (!incentive || !incentive.discountCodeDetail) {
      throw new NotFoundException('تخفیف یافت نشد');
    }
    return incentive;
  }

  async findOne(id: string) {
    return this.serialize(await this.findIncentiveOrThrow(id));
  }

  async update(id: string, dto: UpdateDiscountIncentiveDto) {
    const current = await this.findIncentiveOrThrow(id);
    const detail = current.discountCodeDetail!;

    const valueType = dto.valueType ?? detail.valueType;
    const tierType = dto.tierType ?? detail.tierType;
    const usageType = dto.usageType ?? detail.usageType;
    const value = dto.value ?? detail.value.toNumber();

    if (dto.valueType !== undefined || dto.value !== undefined) {
      this.assertValueRules(valueType, value);
    }

    const nextTiers =
      dto.tiers !== undefined
        ? dto.tiers
        : detail.tiers.map((t) => ({
            minAmount: t.minAmount?.toNumber(),
            usageIndex: t.usageIndex ?? undefined,
            value: t.value.toNumber(),
          }));
    if (dto.tiers !== undefined || dto.tierType !== undefined) {
      this.assertTierRules(
        tierType,
        valueType,
        tierType === IncentiveTierType.STEPPED ||
          tierType === IncentiveTierType.USAGE_STEPPED
          ? nextTiers
          : undefined,
        usageType,
      );
    }

    const startsAt =
      dto.startsAt !== undefined ? new Date(dto.startsAt) : current.startsAt;
    const endsAt =
      dto.endsAt !== undefined ? new Date(dto.endsAt) : current.endsAt;
    if (dto.startsAt !== undefined || dto.endsAt !== undefined) {
      this.assertDates(startsAt, endsAt);
    }

    if (dto.targetSegmentId !== undefined) {
      await this.assertSegmentExists(dto.targetSegmentId);
    }

    let code = detail.code;
    if (dto.code !== undefined) {
      code = this.normalizeCode(dto.code);
      const clash = await this.prisma.discountCodeDetail.findFirst({
        where: { code, NOT: { incentiveId: id } },
      });
      if (clash) {
        throw new ConflictException('این کد تخفیف قبلاً ثبت شده است');
      }
    }

    const tiersChanged = dto.tiers !== undefined || dto.tierType !== undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.incentive.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.targetSegmentId !== undefined
            ? { targetSegmentId: dto.targetSegmentId }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          startsAt,
          endsAt,
        },
      });

      await tx.discountCodeDetail.update({
        where: { incentiveId: id },
        data: {
          code,
          ...(dto.valueType !== undefined ? { valueType } : {}),
          ...(dto.value !== undefined
            ? { value: new Prisma.Decimal(value) }
            : {}),
          ...(dto.tierType !== undefined ? { tierType } : {}),
          ...(dto.usageType !== undefined ? { usageType } : {}),
          ...(dto.minPurchaseAmount !== undefined
            ? {
                minPurchaseAmount:
                  dto.minPurchaseAmount == null
                    ? null
                    : new Prisma.Decimal(dto.minPurchaseAmount),
              }
            : {}),
        },
      });

      if (tiersChanged) {
        await tx.discountCodeTier.deleteMany({
          where: { discountCodeDetailId: id },
        });
        if (
          (tierType === IncentiveTierType.STEPPED ||
            tierType === IncentiveTierType.USAGE_STEPPED) &&
          nextTiers.length
        ) {
          await tx.discountCodeTier.createMany({
            data: nextTiers.map((t) =>
              tierType === IncentiveTierType.USAGE_STEPPED
                ? {
                    discountCodeDetailId: id,
                    usageIndex: t.usageIndex,
                    value: new Prisma.Decimal(t.value),
                  }
                : {
                    discountCodeDetailId: id,
                    minAmount: new Prisma.Decimal(t.minAmount!),
                    value: new Prisma.Decimal(t.value),
                  },
            ),
          });
        }
      }

      return tx.incentive.findFirstOrThrow({
        where: { id },
        include: detailInclude,
      });
    });

    return this.serialize(updated);
  }

  async deactivate(id: string) {
    await this.findIncentiveOrThrow(id);
    const updated = await this.prisma.incentive.update({
      where: { id },
      data: { isActive: false },
      include: detailInclude,
    });
    return this.serialize(updated);
  }
}
