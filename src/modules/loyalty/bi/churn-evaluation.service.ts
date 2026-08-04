import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { getLatestSegmentPerCustomer } from './customer-segment-history';
import { computeChurnRatePercent, tally } from './bi-rules';
import { SnapshotHistoryQueryDto } from './dtos/snapshot-history-query.dto';

@Injectable()
export class ChurnEvaluationService {
  private readonly logger = new Logger(ChurnEvaluationService.name);

  constructor(private readonly prisma: PrismaService) {}

  private serialize(snapshot: {
    id: string;
    computedAt: Date;
    totalCustomers: number;
    atRiskCount: number;
    lostCount: number;
    regularCount: number;
    churnRatePercent: Prisma.Decimal;
  }) {
    return {
      ...snapshot,
      churnRatePercent: snapshot.churnRatePercent.toNumber(),
    };
  }

  /** از آخرین سگمنت هر مشتری، نرخ ریزش را محاسبه و یک اسنپ‌شات جدید ثبت می‌کند */
  async runEvaluation() {
    const latestSegments = await getLatestSegmentPerCustomer(this.prisma);
    const counts = tally(latestSegments.map((s) => s.segmentKey));

    const totalCustomers = latestSegments.length;
    const atRiskCount = counts['at_risk'] ?? 0;
    const lostCount = counts['lost'] ?? 0;
    const regularCount = counts['regular'] ?? 0;
    const churnRatePercent = computeChurnRatePercent({
      atRiskCount,
      lostCount,
      totalCustomers,
    });

    const snapshot = await this.prisma.churnEvaluationSnapshot.create({
      data: {
        totalCustomers,
        atRiskCount,
        lostCount,
        regularCount,
        churnRatePercent: new Prisma.Decimal(churnRatePercent),
      },
    });

    this.logger.log(
      `Churn evaluation: total=${totalCustomers} atRisk=${atRiskCount} lost=${lostCount} rate=${churnRatePercent}%`,
    );

    return this.serialize(snapshot);
  }

  async getLatest() {
    const snapshot = await this.prisma.churnEvaluationSnapshot.findFirst({
      orderBy: { computedAt: 'desc' },
    });
    return snapshot ? this.serialize(snapshot) : null;
  }

  async getHistory(query: SnapshotHistoryQueryDto) {
    const where: Prisma.ChurnEvaluationSnapshotWhereInput = {};
    if (query.from || query.to) {
      where.computedAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const rows = await this.prisma.churnEvaluationSnapshot.findMany({
      where,
      orderBy: { computedAt: 'desc' },
      take: query.limit ?? 30,
    });

    return rows.map((r) => this.serialize(r)).reverse();
  }
}
