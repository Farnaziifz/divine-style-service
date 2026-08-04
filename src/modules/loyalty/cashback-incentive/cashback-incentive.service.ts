import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IncentiveType, IncentiveValueType, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateCashbackIncentiveDto } from './dtos/create-cashback-incentive.dto';
import { UpdateCashbackIncentiveDto } from './dtos/update-cashback-incentive.dto';
import { CashbackIncentiveQueryDto } from './dtos/cashback-incentive-query.dto';

const detailInclude = {
  cashbackDetail: true,
  targetSegment: { select: { id: true, key: true, label: true } },
} satisfies Prisma.IncentiveInclude;

type IncentiveWithDetail = Prisma.IncentiveGetPayload<{
  include: typeof detailInclude;
}>;

@Injectable()
export class CashbackIncentiveService {
  constructor(private readonly prisma: PrismaService) {}

  private assertValueRules(valueType: IncentiveValueType, value: number) {
    if (valueType === IncentiveValueType.PERCENTAGE) {
      if (value <= 0 || value > 100) {
        throw new BadRequestException(
          'مقدار کش‌بک درصدی باید بین ۱ تا ۱۰۰ باشد',
        );
      }
    } else if (value <= 0) {
      throw new BadRequestException('مقدار کش‌بک باید بزرگ‌تر از صفر باشد');
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
    const { cashbackDetail, targetSegment, ...rest } = incentive;
    return {
      ...rest,
      targetSegment,
      cashbackDetail: cashbackDetail
        ? {
            valueType: cashbackDetail.valueType,
            value: cashbackDetail.value.toNumber(),
            expiresAfterDays: cashbackDetail.expiresAfterDays,
            minPurchaseAmount:
              cashbackDetail.minPurchaseAmount?.toNumber() ?? null,
          }
        : null,
    };
  }

  async create(dto: CreateCashbackIncentiveDto) {
    this.assertValueRules(dto.valueType, dto.value);

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    this.assertDates(startsAt, endsAt);

    await this.assertSegmentExists(dto.targetSegmentId);

    const created = await this.prisma.incentive.create({
      data: {
        type: IncentiveType.CASHBACK,
        title: dto.title.trim(),
        targetSegmentId: dto.targetSegmentId ?? null,
        isActive: dto.isActive ?? true,
        startsAt,
        endsAt,
        cashbackDetail: {
          create: {
            valueType: dto.valueType,
            value: new Prisma.Decimal(dto.value),
            expiresAfterDays: dto.expiresAfterDays ?? null,
            minPurchaseAmount:
              dto.minPurchaseAmount != null
                ? new Prisma.Decimal(dto.minPurchaseAmount)
                : null,
          },
        },
      },
      include: detailInclude,
    });

    return this.serialize(created);
  }

  async findAll(query: CashbackIncentiveQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.IncentiveWhereInput = { type: IncentiveType.CASHBACK };
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.targetSegmentId !== undefined) {
      where.targetSegmentId = query.targetSegmentId;
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
      where: { id, type: IncentiveType.CASHBACK },
      include: detailInclude,
    });
    if (!incentive || !incentive.cashbackDetail) {
      throw new NotFoundException('کش‌بک یافت نشد');
    }
    return incentive;
  }

  async findOne(id: string) {
    return this.serialize(await this.findIncentiveOrThrow(id));
  }

  async update(id: string, dto: UpdateCashbackIncentiveDto) {
    const current = await this.findIncentiveOrThrow(id);
    const detail = current.cashbackDetail!;

    const valueType = dto.valueType ?? detail.valueType;
    const value = dto.value ?? detail.value.toNumber();
    if (dto.valueType !== undefined || dto.value !== undefined) {
      this.assertValueRules(valueType, value);
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

      await tx.cashbackDetail.update({
        where: { incentiveId: id },
        data: {
          ...(dto.valueType !== undefined ? { valueType } : {}),
          ...(dto.value !== undefined
            ? { value: new Prisma.Decimal(value) }
            : {}),
          ...(dto.expiresAfterDays !== undefined
            ? { expiresAfterDays: dto.expiresAfterDays ?? null }
            : {}),
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
