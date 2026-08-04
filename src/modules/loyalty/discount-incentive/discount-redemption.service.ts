import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedeemDiscountCodeDto } from './dtos/redeem-discount-code.dto';
import {
  RedemptionFailureReason,
  calculateDiscountAmount,
  validateRedemption,
} from './discount-redemption.rules';

const FAILURE_MESSAGES: Record<RedemptionFailureReason, string> = {
  INACTIVE: 'این کد تخفیف غیرفعال است',
  NOT_STARTED: 'این کد تخفیف هنوز شروع نشده است',
  EXPIRED: 'این کد تخفیف منقضی شده است',
  WRONG_SEGMENT: 'این کد تخفیف برای سگمنت مشتری شما معتبر نیست',
  ALREADY_USED: 'شما قبلاً از این کد تخفیف استفاده کرده‌اید',
  BELOW_MINIMUM: 'مبلغ سفارش کمتر از حداقل مجاز برای این کد تخفیف است',
};

@Injectable()
export class DiscountRedemptionService {
  constructor(private readonly prisma: PrismaService) {}

  async redeem(dto: RedeemDiscountCodeDto) {
    const code = dto.code.trim().toUpperCase();

    const detail = await this.prisma.discountCodeDetail.findUnique({
      where: { code },
      include: { incentive: true, tiers: true },
    });
    if (!detail) {
      throw new NotFoundException('کد تخفیف یافت نشد');
    }

    const customer = await this.prisma.user.findFirst({
      where: { id: dto.customerId, isDeleted: false },
      select: { id: true },
    });
    if (!customer) {
      throw new BadRequestException('مشتری یافت نشد');
    }

    const [latestMembership, priorRedemptionCount] = await Promise.all([
      this.prisma.segmentMembership.findFirst({
        where: { customerId: dto.customerId },
        orderBy: { computedAt: 'desc' },
        select: { segmentId: true },
      }),
      this.prisma.incentiveRedemption.count({
        where: { incentiveId: detail.incentiveId, customerId: dto.customerId },
      }),
    ]);

    const result = validateRedemption({
      isActive: detail.incentive.isActive,
      startsAt: detail.incentive.startsAt,
      endsAt: detail.incentive.endsAt,
      targetSegmentId: detail.incentive.targetSegmentId,
      customerCurrentSegmentId: latestMembership?.segmentId ?? null,
      usageType: detail.usageType,
      alreadyUsedByCustomer: priorRedemptionCount > 0,
      minPurchaseAmount: detail.minPurchaseAmount?.toNumber() ?? null,
      orderAmount: dto.orderAmount,
    });

    if (!result.valid) {
      throw new BadRequestException(FAILURE_MESSAGES[result.reason!]);
    }

    const discountAmount = calculateDiscountAmount({
      valueType: detail.valueType,
      tierType: detail.tierType,
      value: detail.value.toNumber(),
      tiers: detail.tiers.map((t) => ({
        minAmount: t.minAmount.toNumber(),
        value: t.value.toNumber(),
      })),
      orderAmount: dto.orderAmount,
    });

    const redemption = await this.prisma.incentiveRedemption.create({
      data: {
        incentiveId: detail.incentiveId,
        customerId: dto.customerId,
        orderId: dto.orderId ?? null,
        amountApplied: new Prisma.Decimal(discountAmount),
      },
    });

    return {
      redemptionId: redemption.id,
      code: detail.code,
      discountAmount,
      payableAmount: dto.orderAmount - discountAmount,
      redeemedAt: redemption.redeemedAt,
    };
  }
}
