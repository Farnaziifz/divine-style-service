import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { getLatestSegmentPerCustomer } from '../bi/customer-segment-history';
import { tally } from '../bi/bi-rules';
import { SEGMENT_KEYS } from '../segment-definitions';
import { IncentiveReportQueryDto } from './dtos/incentive-report-query.dto';
import {
  computeSuccessRatePercent,
  resolveReportRange,
} from './incentive-report-rules';

@Injectable()
export class IncentiveReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getPerformanceReport(query: IncentiveReportQueryDto) {
    const { start, end } = resolveReportRange({
      from: query.from,
      to: query.to,
      period: query.period,
    });

    const [latestSegments, incentives, redemptionStats, revenueByIncentive] =
      await Promise.all([
        getLatestSegmentPerCustomer(this.prisma),
        this.prisma.incentive.findMany({
          include: {
            targetSegment: { select: { id: true, key: true, label: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.incentiveRedemption.groupBy({
          by: ['incentiveId'],
          where: { redeemedAt: { gte: start, lte: end } },
          _count: { _all: true },
          _sum: { amountApplied: true },
        }),
        this.prisma.$queryRaw<
          Array<{ incentive_id: string; total_revenue: Prisma.Decimal }>
        >(
          Prisma.sql`
          SELECT ir."incentiveId" AS incentive_id, COALESCE(SUM(o."payableAmount"), 0)::numeric AS total_revenue
          FROM (
            SELECT DISTINCT "incentiveId", "orderId"
            FROM "IncentiveRedemption"
            WHERE "orderId" IS NOT NULL AND "redeemedAt" >= ${start} AND "redeemedAt" <= ${end}
          ) ir
          INNER JOIN "Order" o ON o.id = ir."orderId"
          GROUP BY ir."incentiveId"
        `,
        ),
      ]);

    const segmentTally = tally(latestSegments.map((s) => s.segmentKey));
    const totalCustomers = latestSegments.length;

    const statsByIncentive = new Map(
      redemptionStats.map((r) => [
        r.incentiveId,
        {
          redemptionsCount: r._count._all,
          totalCost: r._sum.amountApplied?.toNumber() ?? 0,
        },
      ]),
    );
    const revenueMap = new Map(
      revenueByIncentive.map((r) => [r.incentive_id, Number(r.total_revenue)]),
    );

    const byIncentive = incentives.map((incentive) => {
      const stats = statsByIncentive.get(incentive.id) ?? {
        redemptionsCount: 0,
        totalCost: 0,
      };
      const totalRevenue = revenueMap.get(incentive.id) ?? 0;
      const eligiblePoolSize = incentive.targetSegmentId
        ? (segmentTally[incentive.targetSegment!.key] ?? 0)
        : totalCustomers;

      return {
        incentiveId: incentive.id,
        type: incentive.type,
        title: incentive.title,
        isActive: incentive.isActive,
        targetSegment: incentive.targetSegment,
        redemptionsCount: stats.redemptionsCount,
        totalCost: stats.totalCost,
        totalRevenue,
        eligiblePoolSize,
        successRatePercent: computeSuccessRatePercent({
          redemptionsCount: stats.redemptionsCount,
          eligiblePoolSize,
        }),
      };
    });

    const [costBySegment, revenueBySegment] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          segment_key: string;
          redemptions_count: bigint;
          total_cost: Prisma.Decimal;
        }>
      >(Prisma.sql`
        WITH latest_segment AS (
          SELECT DISTINCT ON (sm."customerId") sm."customerId" AS customer_id, cs.key AS segment_key
          FROM "SegmentMembership" sm
          INNER JOIN "CustomerSegment" cs ON cs.id = sm."segmentId"
          ORDER BY sm."customerId", sm."computedAt" DESC
        )
        SELECT
          ls.segment_key,
          COUNT(*)::bigint AS redemptions_count,
          COALESCE(SUM(ir."amountApplied"), 0)::numeric AS total_cost
        FROM "IncentiveRedemption" ir
        INNER JOIN latest_segment ls ON ls.customer_id = ir."customerId"
        WHERE ir."redeemedAt" >= ${start} AND ir."redeemedAt" <= ${end}
        GROUP BY ls.segment_key
      `),
      this.prisma.$queryRaw<
        Array<{ segment_key: string; total_revenue: Prisma.Decimal }>
      >(
        Prisma.sql`
          WITH latest_segment AS (
            SELECT DISTINCT ON (sm."customerId") sm."customerId" AS customer_id, cs.key AS segment_key
            FROM "SegmentMembership" sm
            INNER JOIN "CustomerSegment" cs ON cs.id = sm."segmentId"
            ORDER BY sm."customerId", sm."computedAt" DESC
          ),
          distinct_orders AS (
            SELECT DISTINCT ls.segment_key, ir."orderId"
            FROM "IncentiveRedemption" ir
            INNER JOIN latest_segment ls ON ls.customer_id = ir."customerId"
            WHERE ir."orderId" IS NOT NULL AND ir."redeemedAt" >= ${start} AND ir."redeemedAt" <= ${end}
          )
          SELECT segment_key, COALESCE(SUM(o."payableAmount"), 0)::numeric AS total_revenue
          FROM distinct_orders
          INNER JOIN "Order" o ON o.id = distinct_orders."orderId"
          GROUP BY segment_key
        `,
      ),
    ]);

    const costBySegmentMap = new Map(
      costBySegment.map((r) => [
        r.segment_key,
        {
          redemptionsCount: Number(r.redemptions_count),
          totalCost: Number(r.total_cost),
        },
      ]),
    );
    const revenueBySegmentMap = new Map(
      revenueBySegment.map((r) => [r.segment_key, Number(r.total_revenue)]),
    );

    const bySegment = SEGMENT_KEYS.map((key) => {
      const stats = costBySegmentMap.get(key) ?? {
        redemptionsCount: 0,
        totalCost: 0,
      };
      const segmentSize = segmentTally[key] ?? 0;

      return {
        segmentKey: key,
        segmentSize,
        redemptionsCount: stats.redemptionsCount,
        totalCost: stats.totalCost,
        totalRevenue: revenueBySegmentMap.get(key) ?? 0,
        successRatePercent: computeSuccessRatePercent({
          redemptionsCount: stats.redemptionsCount,
          eligiblePoolSize: segmentSize,
        }),
      };
    });

    return {
      range: { from: start.toISOString(), to: end.toISOString() },
      byIncentive,
      bySegment,
    };
  }
}
