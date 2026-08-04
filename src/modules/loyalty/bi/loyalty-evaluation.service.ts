import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { getLatestTwoFrequenciesPerCustomer } from './customer-segment-history';
import { computeLoyaltyRatePercent, isPromisingCustomer } from './bi-rules';
import { SnapshotHistoryQueryDto } from './dtos/snapshot-history-query.dto';

@Injectable()
export class LoyaltyEvaluationService {
  private readonly logger = new Logger(LoyaltyEvaluationService.name);

  constructor(private readonly prisma: PrismaService) {}

  private serialize(snapshot: {
    id: string;
    computedAt: Date;
    totalCustomers: number;
    loyalCount: number;
    promisingCount: number;
    regularCount: number;
    loyaltyRatePercent: Prisma.Decimal;
  }) {
    return {
      ...snapshot,
      loyaltyRatePercent: snapshot.loyaltyRatePercent.toNumber(),
    };
  }

  /**
   * از آخرین دو اسنپ‌شات هر مشتری، نرخ وفاداری (سهم vip) و زیرگروه «امیدوارکننده»
   * (فرکانس خرید رو به افزایش، هنوز vip نیست) را محاسبه و یک اسنپ‌شات جدید ثبت می‌کند.
   */
  async runEvaluation() {
    const trends = await getLatestTwoFrequenciesPerCustomer(this.prisma);

    let loyalCount = 0;
    let promisingCount = 0;
    let regularCount = 0;

    for (const trend of trends) {
      if (trend.segmentKey === 'vip') {
        loyalCount++;
        continue;
      }
      if (isPromisingCustomer(trend)) {
        promisingCount++;
      } else if (trend.segmentKey === 'regular') {
        regularCount++;
      }
    }

    const totalCustomers = trends.length;
    const loyaltyRatePercent = computeLoyaltyRatePercent({
      loyalCount,
      totalCustomers,
    });

    const snapshot = await this.prisma.loyaltyEvaluationSnapshot.create({
      data: {
        totalCustomers,
        loyalCount,
        promisingCount,
        regularCount,
        loyaltyRatePercent: new Prisma.Decimal(loyaltyRatePercent),
      },
    });

    this.logger.log(
      `Loyalty evaluation: total=${totalCustomers} loyal=${loyalCount} promising=${promisingCount} rate=${loyaltyRatePercent}%`,
    );

    return this.serialize(snapshot);
  }

  async getLatest() {
    const snapshot = await this.prisma.loyaltyEvaluationSnapshot.findFirst({
      orderBy: { computedAt: 'desc' },
    });
    return snapshot ? this.serialize(snapshot) : null;
  }

  async getHistory(query: SnapshotHistoryQueryDto) {
    const where: Prisma.LoyaltyEvaluationSnapshotWhereInput = {};
    if (query.from || query.to) {
      where.computedAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const rows = await this.prisma.loyaltyEvaluationSnapshot.findMany({
      where,
      orderBy: { computedAt: 'desc' },
      take: query.limit ?? 30,
    });

    return rows.map((r) => this.serialize(r)).reverse();
  }
}
