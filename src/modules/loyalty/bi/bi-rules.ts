function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface ChurnRateInput {
  atRiskCount: number;
  lostCount: number;
  totalCustomers: number;
}

/** درصد ریزش = (at_risk + lost) / کل مشتریان × ۱۰۰ */
export function computeChurnRatePercent(input: ChurnRateInput): number {
  if (input.totalCustomers <= 0) return 0;
  return roundTo2(
    ((input.atRiskCount + input.lostCount) / input.totalCustomers) * 100,
  );
}

export interface LoyaltyRateInput {
  loyalCount: number;
  totalCustomers: number;
}

/** درصد وفاداری = مشتریان vip / کل مشتریان × ۱۰۰ */
export function computeLoyaltyRatePercent(input: LoyaltyRateInput): number {
  if (input.totalCustomers <= 0) return 0;
  return roundTo2((input.loyalCount / input.totalCustomers) * 100);
}

export interface PromisingClassificationInput {
  segmentKey: string;
  latestFrequency: number;
  /** null یعنی هنوز اسنپ‌شات قبلی‌ای برای مقایسه نیست */
  previousFrequency: number | null;
}

/**
 * «امیدوارکننده» یعنی: هنوز vip نیست، حداقل یک اسنپ‌شات قبلی برای مقایسه دارد،
 * و فرکانس خریدش نسبت به اسنپ‌شات قبلی افزایش پیدا کرده (روند صعودی).
 */
export function isPromisingCustomer(
  input: PromisingClassificationInput,
): boolean {
  if (input.segmentKey === 'vip') return false;
  if (input.previousFrequency == null) return false;
  return input.latestFrequency > input.previousFrequency;
}

/** شمارش تعداد مشتریان به‌ازای هر مقدار (مثلاً هر segmentKey) */
export function tally(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of values) {
    counts[v] = (counts[v] ?? 0) + 1;
  }
  return counts;
}
