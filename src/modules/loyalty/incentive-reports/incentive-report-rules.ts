const DAY_MS = 24 * 60 * 60 * 1000;

export type ReportPeriod = 'week' | 'month' | 'year';

const PERIOD_DAYS: Record<ReportPeriod, number> = {
  week: 7,
  month: 30,
  year: 365,
};

export interface ResolveReportRangeInput {
  from?: string;
  to?: string;
  period?: ReportPeriod;
  now?: Date;
}

export interface ReportDateRange {
  start: Date;
  end: Date;
}

/**
 * period (week/month/year) یک بازهٔ آخرِ-N-روزهٔ منتهی به الان می‌سازد و بر from/to اولویت دارد.
 * بدون period: from/to دلخواه؛ پیش‌فرض end=الان و start=۳۰ روز قبل از end (مثل بقیهٔ گزارش‌های این کدبیس).
 */
export function resolveReportRange(
  input: ResolveReportRangeInput,
): ReportDateRange {
  const now = input.now ?? new Date();

  if (input.period) {
    const end = now;
    const start = new Date(end.getTime() - PERIOD_DAYS[input.period] * DAY_MS);
    return { start, end };
  }

  const end = input.to ? new Date(input.to) : now;
  const start = input.from
    ? new Date(input.from)
    : new Date(end.getTime() - PERIOD_DAYS.month * DAY_MS);
  return { start, end };
}

export interface SuccessRateInput {
  redemptionsCount: number;
  eligiblePoolSize: number;
}

/**
 * نرخ موفقیت = ریدیم‌ها / اندازهٔ استخر واجد شرایط.
 * هیچ رکورد «نمایش داده شد» یا «واجد شرایط بود» در این کدبیس ردیابی نمی‌شود؛ طبق قرارداد
 * fallback، مخرج = اندازهٔ سگمنت هدف (یا کل مشتریان سگمنت‌شده اگر targetSegmentId=null است).
 */
export function computeSuccessRatePercent(input: SuccessRateInput): number {
  if (input.eligiblePoolSize <= 0) return 0;
  return (
    Math.round((input.redemptionsCount / input.eligiblePoolSize) * 10000) / 100
  );
}
