import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { getLatestSegmentPerCustomer } from '../bi/customer-segment-history';
import { tally } from '../bi/bi-rules';
import { SEGMENT_KEYS } from '../segment-definitions';

@Injectable()
export class SegmentService {
  constructor(private readonly prisma: PrismaService) {}

  /** همهٔ سگمنت‌ها با تعداد مشتریان *فعلی* هرکدام (بر اساس آخرین SegmentMembership هر مشتری) */
  async listSegments() {
    const [segments, latestSegments] = await Promise.all([
      this.prisma.customerSegment.findMany(),
      getLatestSegmentPerCustomer(this.prisma),
    ]);

    const counts = tally(latestSegments.map((s) => s.segmentKey));
    const order = SEGMENT_KEYS as readonly string[];

    return segments
      .map((s) => ({
        id: s.id,
        key: s.key,
        label: s.label,
        description: s.description,
        membersCount: counts[s.key] ?? 0,
      }))
      .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  }

  /** مشتریانی که *الان* آخرین سگمنتشان همین سگمنت است، با آخرین مقادیر RFM */
  async getSegmentMembers(segmentId: string) {
    const segment = await this.prisma.customerSegment.findUnique({
      where: { id: segmentId },
    });
    if (!segment) {
      throw new NotFoundException('سگمنت یافت نشد');
    }

    const rows = await this.prisma.$queryRaw<
      Array<{
        customer_id: string;
        name: string | null;
        last_name: string | null;
        mobile: string;
        recency_days: number;
        frequency_count: number;
        monetary_total: Prisma.Decimal;
        computed_at: Date;
      }>
    >(Prisma.sql`
      WITH latest AS (
        SELECT DISTINCT ON (sm."customerId") sm.*
        FROM "SegmentMembership" sm
        ORDER BY sm."customerId", sm."computedAt" DESC
      )
      SELECT
        latest."customerId" AS customer_id,
        u.name AS name,
        u."lastName" AS last_name,
        u.mobile AS mobile,
        latest."recencyDays" AS recency_days,
        latest."frequencyCount" AS frequency_count,
        latest."monetaryTotal" AS monetary_total,
        latest."computedAt" AS computed_at
      FROM latest
      INNER JOIN "User" u ON u.id = latest."customerId"
      WHERE latest."segmentId" = ${segmentId}::uuid
      ORDER BY latest."computedAt" DESC
    `);

    return rows.map((r) => ({
      customerId: r.customer_id,
      name: r.name,
      lastName: r.last_name,
      mobile: r.mobile,
      recencyDays: r.recency_days,
      frequencyCount: r.frequency_count,
      monetaryTotal: r.monetary_total.toNumber(),
      computedAt: r.computed_at,
    }));
  }
}
