import {
  IncentiveTierType,
  IncentiveUsageType,
  IncentiveValueType,
} from '@prisma/client';

export type RedemptionFailureReason =
  | 'INACTIVE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'WRONG_SEGMENT'
  | 'ALREADY_USED'
  | 'USAGE_LIMIT_REACHED'
  | 'BELOW_MINIMUM';

export interface RedemptionValidationInput {
  isActive: boolean;
  startsAt: Date;
  endsAt: Date;
  /** null = تخفیف برای همه مشتریان است، محدود به سگمنت خاصی نیست */
  targetSegmentId: string | null;
  /** آخرین سگمنتی که مشتری در آن قرار دارد؛ null یعنی مشتری هنوز هیچ سگمنتی ندارد */
  customerCurrentSegmentId: string | null;
  usageType: IncentiveUsageType;
  alreadyUsedByCustomer: boolean;
  minPurchaseAmount: number | null;
  orderAmount: number;
  /** فقط برای tierType = USAGE_STEPPED لازم است */
  tierType?: IncentiveTierType;
  /** تعداد دفعاتی که همین مشتری قبلاً این کد را استفاده کرده (برای USAGE_STEPPED) */
  usageCount?: number;
  /** تعداد پله‌های کد (سقف دفعات مجاز استفاده برای USAGE_STEPPED) */
  tierCount?: number;
  /** برای تست‌پذیری؛ پیش‌فرض زمان واقعی */
  now?: Date;
}

export interface RedemptionValidationResult {
  valid: boolean;
  reason?: RedemptionFailureReason;
}

/** خالص، بدون وابستگی به DB — همهٔ داده‌های لازم از قبل واکشی و پاس داده می‌شوند */
export function validateRedemption(
  input: RedemptionValidationInput,
): RedemptionValidationResult {
  const now = input.now ?? new Date();

  if (!input.isActive) {
    return { valid: false, reason: 'INACTIVE' };
  }
  if (now < input.startsAt) {
    return { valid: false, reason: 'NOT_STARTED' };
  }
  if (now > input.endsAt) {
    return { valid: false, reason: 'EXPIRED' };
  }
  if (
    input.targetSegmentId != null &&
    input.customerCurrentSegmentId !== input.targetSegmentId
  ) {
    return { valid: false, reason: 'WRONG_SEGMENT' };
  }
  if (
    input.usageType === IncentiveUsageType.SINGLE_USE &&
    input.alreadyUsedByCustomer
  ) {
    return { valid: false, reason: 'ALREADY_USED' };
  }
  if (
    input.tierType === IncentiveTierType.USAGE_STEPPED &&
    (input.usageCount ?? 0) >= (input.tierCount ?? 0)
  ) {
    return { valid: false, reason: 'USAGE_LIMIT_REACHED' };
  }
  if (
    input.minPurchaseAmount != null &&
    input.orderAmount < input.minPurchaseAmount
  ) {
    return { valid: false, reason: 'BELOW_MINIMUM' };
  }

  return { valid: true };
}

export interface DiscountCalcTier {
  /** برای tierType = STEPPED */
  minAmount?: number;
  /** برای tierType = USAGE_STEPPED */
  usageIndex?: number;
  value: number;
}

export interface DiscountCalcInput {
  valueType: IncentiveValueType;
  tierType: IncentiveTierType;
  /** استفاده‌شده وقتی tierType = FLAT */
  value: number;
  /** استفاده‌شده وقتی tierType = STEPPED یا USAGE_STEPPED */
  tiers: DiscountCalcTier[];
  orderAmount: number;
  /** تعداد دفعاتی که مشتری قبلاً این کد را استفاده کرده (برای USAGE_STEPPED) */
  usageCount?: number;
}

/**
 * FLAT: مقدار value مستقیم اعمال می‌شود.
 * STEPPED (flat-at-tier): بالاترین پله‌ای که minAmount آن <= مبلغ سفارش باشد انتخاب
 * و مقدار همان پله روی کل مبلغ سفارش اعمال می‌شود؛ اگر هیچ پله‌ای واجد شرایط نباشد تخفیف صفر است.
 * USAGE_STEPPED: پله‌ای که usageIndex آن برابر با «امین بار استفاده» (usageCount + 1) باشد.
 * خروجی همیشه بین ۰ و مبلغ سفارش کلمپ می‌شود.
 */
export function calculateDiscountAmount(input: DiscountCalcInput): number {
  let rate: number | null = null;

  if (input.tierType === IncentiveTierType.FLAT) {
    rate = input.value;
  } else if (input.tierType === IncentiveTierType.USAGE_STEPPED) {
    const currentUse = (input.usageCount ?? 0) + 1;
    const applicableTier = input.tiers.find((t) => t.usageIndex === currentUse);
    rate = applicableTier ? applicableTier.value : null;
  } else {
    const applicableTier = [...input.tiers]
      .filter((t) => (t.minAmount ?? Infinity) <= input.orderAmount)
      .sort((a, b) => (b.minAmount ?? 0) - (a.minAmount ?? 0))[0];
    rate = applicableTier ? applicableTier.value : null;
  }

  if (rate == null) {
    return 0;
  }

  const raw =
    input.valueType === IncentiveValueType.PERCENTAGE
      ? (input.orderAmount * rate) / 100
      : rate;

  return Math.min(Math.max(raw, 0), input.orderAmount);
}
