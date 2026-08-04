import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import { segmentationRulesConfig } from './config/segmentation-rules.config';
import { SEGMENT_DEFINITIONS, SegmentKey } from './segment-definitions';

const DAY_MS = 24 * 60 * 60 * 1000;

interface CustomerRfm {
  customerId: string;
  recencyDays: number;
  frequencyCount: number;
  monetaryTotal: number;
}

@Injectable()
export class SegmentationService {
  private readonly logger = new Logger(SegmentationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** ایجاد/به‌روزرسانی ردیف‌های CustomerSegment (idempotent) و برگرداندن نگاشت key -> id */
  private async ensureSegments(): Promise<Map<SegmentKey, string>> {
    const idByKey = new Map<SegmentKey, string>();
    for (const def of SEGMENT_DEFINITIONS) {
      const segment = await this.prisma.customerSegment.upsert({
        where: { key: def.key },
        create: def,
        update: { label: def.label, description: def.description },
      });
      idByKey.set(def.key, segment.id);
    }
    return idByKey;
  }

  /**
   * RFM بر اساس سفارش‌های پرداخت‌شدهٔ واقعی هر مشتری (role=USER، حذف‌نشده).
   * مشتری بدون هیچ سفارش پرداخت‌شده‌ای در این محاسبه شرکت نمی‌کند — عضو باشگاه مشتریان محسوب نمی‌شود.
   */
  private async computeRfmForAllCustomers(): Promise<CustomerRfm[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        customer_id: string;
        last_paid_at: Date;
        frequency: bigint;
        monetary: Prisma.Decimal;
      }>
    >(Prisma.sql`
      SELECT
        o."userId" AS customer_id,
        MAX(o."paidAt") AS last_paid_at,
        COUNT(*)::bigint AS frequency,
        COALESCE(SUM(o."payableAmount"), 0)::numeric AS monetary
      FROM "Order" o
      INNER JOIN "User" u ON u.id = o."userId"
      WHERE
        o."isDeleted" = false
        AND o."paymentStatus" = 'PAID'
        AND o."paidAt" IS NOT NULL
        AND u."isDeleted" = false
        AND u.role = 'USER'
      GROUP BY o."userId"
    `);

    const now = Date.now();
    return rows.map((r) => ({
      customerId: r.customer_id,
      recencyDays: Math.max(
        0,
        Math.floor((now - new Date(r.last_paid_at).getTime()) / DAY_MS),
      ),
      frequencyCount: Number(r.frequency),
      monetaryTotal: Number(r.monetary),
    }));
  }

  /** آستانهٔ مبلغی که ۲۰٪ برتر مشتریان (بر اساس monetaryTotal) از آن بالاترند */
  private computeMonetaryTopThreshold(rfmRows: CustomerRfm[]): number {
    if (rfmRows.length === 0) return Infinity;
    const sorted = rfmRows.map((r) => r.monetaryTotal).sort((a, b) => a - b);
    const percentile = 1 - segmentationRulesConfig.vip.monetaryTopPercentile;
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil(percentile * sorted.length) - 1),
    );
    return sorted[index];
  }

  /**
   * اولویت قوانین (چون بازه‌ها می‌توانند هم‌پوشانی داشته باشند):
   * vip (بهترین مشتریان صرف‌نظر از تازگی) > lost > at_risk > new > regular
   */
  private resolveSegmentKey(
    rfm: CustomerRfm,
    monetaryTopThreshold: number,
  ): SegmentKey {
    const rules = segmentationRulesConfig;

    if (
      rfm.frequencyCount >= rules.vip.minFrequency &&
      rfm.monetaryTotal >= monetaryTopThreshold
    ) {
      return 'vip';
    }
    if (rfm.recencyDays > rules.lost.minRecencyDays) {
      return 'lost';
    }
    if (
      rfm.recencyDays >= rules.atRisk.minRecencyDays &&
      rfm.recencyDays <= rules.atRisk.maxRecencyDays
    ) {
      return 'at_risk';
    }
    if (
      rfm.frequencyCount === rules.new.maxFrequency &&
      rfm.recencyDays <= rules.new.maxRecencyDays
    ) {
      return 'new';
    }
    return 'regular';
  }

  /**
   * محاسبهٔ RFM برای همهٔ مشتریان و درج یک اسنپ‌شات جدید عضویت سگمنت برای هرکدام
   * (تاریخچه‌ای — رکورد قبلی هرگز rewrite/حذف نمی‌شود).
   * خروجی: تعداد مشتریان در هر سگمنت.
   */
  async runSegmentation(): Promise<Record<SegmentKey, number>> {
    const [segmentIdByKey, rfmRows] = await Promise.all([
      this.ensureSegments(),
      this.computeRfmForAllCustomers(),
    ]);

    const monetaryTopThreshold = this.computeMonetaryTopThreshold(rfmRows);

    const summary = SEGMENT_DEFINITIONS.reduce(
      (acc, def) => ({ ...acc, [def.key]: 0 }),
      {} as Record<SegmentKey, number>,
    );

    const data = rfmRows.map((rfm) => {
      const key = this.resolveSegmentKey(rfm, monetaryTopThreshold);
      summary[key]++;
      return {
        customerId: rfm.customerId,
        segmentId: segmentIdByKey.get(key)!,
        recencyDays: rfm.recencyDays,
        frequencyCount: rfm.frequencyCount,
        monetaryTotal: new Prisma.Decimal(rfm.monetaryTotal),
      };
    });

    if (data.length > 0) {
      await this.prisma.segmentMembership.createMany({ data });
    }

    this.logger.log(
      `Segmentation computed for ${rfmRows.length} customer(s): ` +
        Object.entries(summary)
          .map(([key, count]) => `${key}=${count}`)
          .join(', '),
    );

    return summary;
  }
}
