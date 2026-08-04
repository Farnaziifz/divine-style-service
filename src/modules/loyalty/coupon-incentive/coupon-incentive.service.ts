import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CouponTriggerType,
  IncentiveType,
  IncentiveValueType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateCouponIncentiveDto } from './dtos/create-coupon-incentive.dto';
import { UpdateCouponIncentiveDto } from './dtos/update-coupon-incentive.dto';
import { CouponIncentiveQueryDto } from './dtos/coupon-incentive-query.dto';
import {
  extractCategoryIdFromConfig,
  extractMinAmountFromConfig,
} from './coupon-rules';

const detailInclude = {
  couponDetail: true,
  targetSegment: { select: { id: true, key: true, label: true } },
} satisfies Prisma.IncentiveInclude;

type IncentiveWithDetail = Prisma.IncentiveGetPayload<{
  include: typeof detailInclude;
}>;

@Injectable()
export class CouponIncentiveService {
  constructor(private readonly prisma: PrismaService) {}

  private assertRewardValueRules(
    rewardValueType: IncentiveValueType,
    rewardValue: number,
  ) {
    if (rewardValueType === IncentiveValueType.PERCENTAGE) {
      if (rewardValue <= 0 || rewardValue > 100) {
        throw new BadRequestException('پاداش درصدی باید بین ۱ تا ۱۰۰ باشد');
      }
    } else if (rewardValue <= 0) {
      throw new BadRequestException('پاداش کوپن باید بزرگ‌تر از صفر باشد');
    }
  }

  private async assertTriggerConfig(
    triggerType: CouponTriggerType,
    triggerConfig: Record<string, unknown> | undefined,
    rewardValueType: IncentiveValueType,
  ) {
    if (triggerType === CouponTriggerType.PURCHASE_ABOVE_AMOUNT) {
      const minAmount = extractMinAmountFromConfig(triggerConfig);
      if (minAmount == null) {
        throw new BadRequestException(
          'برای triggerType=PURCHASE_ABOVE_AMOUNT، triggerConfig.minAmount عددی الزامی است',
        );
      }
    } else if (triggerType === CouponTriggerType.CATEGORY_PURCHASE) {
      const categoryId = extractCategoryIdFromConfig(triggerConfig);
      if (!categoryId) {
        throw new BadRequestException(
          'برای triggerType=CATEGORY_PURCHASE، triggerConfig.categoryId الزامی است',
        );
      }
      const category = await this.prisma.category.findUnique({
        where: { id: categoryId },
        select: { id: true },
      });
      if (!category) {
        throw new BadRequestException('دسته‌بندی موردنظر یافت نشد');
      }
    } else if (triggerType === CouponTriggerType.REFERRAL) {
      if (rewardValueType === IncentiveValueType.PERCENTAGE) {
        throw new BadRequestException(
          'برای triggerType=REFERRAL هیچ سفارش پایه‌ای برای محاسبهٔ درصد وجود ندارد؛ rewardValueType باید FIXED_AMOUNT باشد',
        );
      }
    }
    // FIRST_PURCHASE: نیازی به triggerConfig ندارد
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
    const { couponDetail, targetSegment, ...rest } = incentive;
    return {
      ...rest,
      targetSegment,
      couponDetail: couponDetail
        ? {
            triggerType: couponDetail.triggerType,
            triggerConfig: couponDetail.triggerConfig,
            rewardDescription: couponDetail.rewardDescription,
            rewardValueType: couponDetail.rewardValueType,
            rewardValue: couponDetail.rewardValue.toNumber(),
          }
        : null,
    };
  }

  async create(dto: CreateCouponIncentiveDto) {
    this.assertRewardValueRules(dto.rewardValueType, dto.rewardValue);
    await this.assertTriggerConfig(
      dto.triggerType,
      dto.triggerConfig,
      dto.rewardValueType,
    );

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    this.assertDates(startsAt, endsAt);

    await this.assertSegmentExists(dto.targetSegmentId);

    const created = await this.prisma.incentive.create({
      data: {
        type: IncentiveType.COUPON,
        title: dto.title.trim(),
        targetSegmentId: dto.targetSegmentId ?? null,
        isActive: dto.isActive ?? true,
        startsAt,
        endsAt,
        couponDetail: {
          create: {
            triggerType: dto.triggerType,
            triggerConfig: (dto.triggerConfig ?? {}) as Prisma.InputJsonValue,
            rewardDescription: dto.rewardDescription.trim(),
            rewardValueType: dto.rewardValueType,
            rewardValue: new Prisma.Decimal(dto.rewardValue),
          },
        },
      },
      include: detailInclude,
    });

    return this.serialize(created);
  }

  async findAll(query: CouponIncentiveQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.IncentiveWhereInput = { type: IncentiveType.COUPON };
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.targetSegmentId !== undefined) {
      where.targetSegmentId = query.targetSegmentId;
    }
    if (query.triggerType !== undefined) {
      where.couponDetail = { triggerType: query.triggerType };
    }
    if (query.search?.trim()) {
      where.title = { contains: query.search.trim(), mode: 'insensitive' };
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
      where: { id, type: IncentiveType.COUPON },
      include: detailInclude,
    });
    if (!incentive || !incentive.couponDetail) {
      throw new NotFoundException('کوپن یافت نشد');
    }
    return incentive;
  }

  async findOne(id: string) {
    return this.serialize(await this.findIncentiveOrThrow(id));
  }

  async update(id: string, dto: UpdateCouponIncentiveDto) {
    const current = await this.findIncentiveOrThrow(id);
    const detail = current.couponDetail!;

    const triggerType = dto.triggerType ?? detail.triggerType;
    const rewardValueType = dto.rewardValueType ?? detail.rewardValueType;
    const rewardValue = dto.rewardValue ?? detail.rewardValue.toNumber();
    const triggerConfig =
      dto.triggerConfig !== undefined
        ? dto.triggerConfig
        : (detail.triggerConfig as Record<string, unknown>);

    if (
      dto.rewardValueType !== undefined ||
      dto.rewardValue !== undefined ||
      dto.triggerType !== undefined ||
      dto.triggerConfig !== undefined
    ) {
      this.assertRewardValueRules(rewardValueType, rewardValue);
      await this.assertTriggerConfig(
        triggerType,
        triggerConfig,
        rewardValueType,
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

      await tx.couponDetail.update({
        where: { incentiveId: id },
        data: {
          ...(dto.triggerType !== undefined ? { triggerType } : {}),
          ...(dto.triggerConfig !== undefined
            ? { triggerConfig: dto.triggerConfig as Prisma.InputJsonValue }
            : {}),
          ...(dto.rewardDescription !== undefined
            ? { rewardDescription: dto.rewardDescription.trim() }
            : {}),
          ...(dto.rewardValueType !== undefined ? { rewardValueType } : {}),
          ...(dto.rewardValue !== undefined
            ? { rewardValue: new Prisma.Decimal(rewardValue) }
            : {}),
        },
      });

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
