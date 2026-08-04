import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';

export interface LatestCustomerSegment {
  customerId: string;
  segmentKey: string;
}

/** آخرین سگمنت هر مشتری (بر اساس جدیدترین SegmentMembership) — یک ردیف به‌ازای هر مشتری */
export async function getLatestSegmentPerCustomer(
  prisma: PrismaService,
): Promise<LatestCustomerSegment[]> {
  return prisma.$queryRaw<LatestCustomerSegment[]>(Prisma.sql`
    SELECT DISTINCT ON (sm."customerId")
      sm."customerId" AS "customerId",
      cs.key AS "segmentKey"
    FROM "SegmentMembership" sm
    INNER JOIN "CustomerSegment" cs ON cs.id = sm."segmentId"
    ORDER BY sm."customerId", sm."computedAt" DESC
  `);
}

export interface CustomerFrequencyTrend {
  customerId: string;
  segmentKey: string;
  latestFrequency: number;
  /** null یعنی این مشتری فقط یک اسنپ‌شات تاریخی دارد — روند قابل‌محاسبه نیست */
  previousFrequency: number | null;
}

/** دو اسنپ‌شات آخر هر مشتری (برای تشخیص روند صعودی/نزولی فرکانس خرید) */
export async function getLatestTwoFrequenciesPerCustomer(
  prisma: PrismaService,
): Promise<CustomerFrequencyTrend[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      customer_id: string;
      segment_key: string;
      frequency_count: number;
      rn: bigint;
    }>
  >(Prisma.sql`
    SELECT customer_id, segment_key, frequency_count, rn FROM (
      SELECT
        sm."customerId" AS customer_id,
        cs.key AS segment_key,
        sm."frequencyCount" AS frequency_count,
        ROW_NUMBER() OVER (PARTITION BY sm."customerId" ORDER BY sm."computedAt" DESC) AS rn
      FROM "SegmentMembership" sm
      INNER JOIN "CustomerSegment" cs ON cs.id = sm."segmentId"
    ) ranked
    WHERE rn <= 2
    ORDER BY customer_id, rn
  `);

  const byCustomer = new Map<
    string,
    { latest?: (typeof rows)[number]; previous?: (typeof rows)[number] }
  >();
  for (const row of rows) {
    const entry = byCustomer.get(row.customer_id) ?? {};
    if (Number(row.rn) === 1) entry.latest = row;
    else entry.previous = row;
    byCustomer.set(row.customer_id, entry);
  }

  return [...byCustomer.entries()]
    .filter(([, v]) => v.latest)
    .map(([customerId, { latest, previous }]) => ({
      customerId,
      segmentKey: latest!.segment_key,
      latestFrequency: Number(latest!.frequency_count),
      previousFrequency: previous ? Number(previous.frequency_count) : null,
    }));
}
