import { IncentiveValueType } from '@prisma/client';

export type CouponWindowDisqualifyReason =
  | 'INACTIVE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'WRONG_SEGMENT';

export interface CouponWindowQualificationInput {
  isActive: boolean;
  startsAt: Date;
  endsAt: Date;
  /** null = برای همه مشتریان است، محدود به سگمنت خاصی نیست */
  targetSegmentId: string | null;
  /** آخرین سگمنتی که مشتری در آن قرار دارد؛ null یعنی مشتری هنوز هیچ سگمنتی ندارد */
  customerCurrentSegmentId: string | null;
  /** برای تست‌پذیری؛ پیش‌فرض زمان واقعی */
  now?: Date;
}

export interface CouponWindowQualificationResult {
  qualifies: boolean;
  reason?: CouponWindowDisqualifyReason;
}

/**
 * پیش‌شرط‌های مشترک همهٔ انواع تریگر کوپن (فعال بودن، بازهٔ زمانی، سگمنت).
 * تطبیق خودِ تریگر (اولین خرید/مبلغ/دسته/ارجاع) جدا و با matchesXTrigger چک می‌شود.
 */
export function qualifiesCouponWindow(
  input: CouponWindowQualificationInput,
): CouponWindowQualificationResult {
  const now = input.now ?? new Date();

  if (!input.isActive) {
    return { qualifies: false, reason: 'INACTIVE' };
  }
  if (now < input.startsAt) {
    return { qualifies: false, reason: 'NOT_STARTED' };
  }
  if (now > input.endsAt) {
    return { qualifies: false, reason: 'EXPIRED' };
  }
  if (
    input.targetSegmentId != null &&
    input.customerCurrentSegmentId !== input.targetSegmentId
  ) {
    return { qualifies: false, reason: 'WRONG_SEGMENT' };
  }

  return { qualifies: true };
}

/** { minAmount: number } را از triggerConfig آزاد استخراج می‌کند؛ نامعتبر/غایب => null */
export function extractMinAmountFromConfig(
  triggerConfig: unknown,
): number | null {
  if (
    triggerConfig &&
    typeof triggerConfig === 'object' &&
    'minAmount' in (triggerConfig as Record<string, unknown>)
  ) {
    const raw = (triggerConfig as Record<string, unknown>).minAmount;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  return null;
}

/** { categoryId: string } را از triggerConfig آزاد استخراج می‌کند؛ نامعتبر/غایب => null */
export function extractCategoryIdFromConfig(
  triggerConfig: unknown,
): string | null {
  if (
    triggerConfig &&
    typeof triggerConfig === 'object' &&
    'categoryId' in (triggerConfig as Record<string, unknown>)
  ) {
    const raw = (triggerConfig as Record<string, unknown>).categoryId;
    return typeof raw === 'string' && raw.length > 0 ? raw : null;
  }
  return null;
}

/** FIRST_PURCHASE: این سفارش باید اولین سفارش پرداخت‌شدهٔ مشتری باشد */
export function matchesFirstPurchaseTrigger(params: {
  isFirstPaidOrder: boolean;
}): boolean {
  return params.isFirstPaidOrder;
}

/** PURCHASE_ABOVE_AMOUNT: مبلغ سفارش باید حداقل به‌اندازهٔ triggerConfig.minAmount باشد */
export function matchesPurchaseAboveAmountTrigger(params: {
  orderAmount: number;
  triggerConfig: unknown;
}): boolean {
  const minAmount = extractMinAmountFromConfig(params.triggerConfig);
  if (minAmount == null) return false;
  return params.orderAmount >= minAmount;
}

/** CATEGORY_PURCHASE: سفارش باید حداقل یک آیتم از دستهٔ triggerConfig.categoryId داشته باشد */
export function matchesCategoryPurchaseTrigger(params: {
  purchasedCategoryIds: string[];
  triggerConfig: unknown;
}): boolean {
  const categoryId = extractCategoryIdFromConfig(params.triggerConfig);
  if (!categoryId) return false;
  return params.purchasedCategoryIds.includes(categoryId);
}

/**
 * REFERRAL: خودِ رخداد "ارجاع تایید شد" کافی است — هیچ سیستم ارجاع واقعی در این کدبیس
 * وجود ندارد؛ این تابع صرفاً محل مستندسازی آن قرارداد است (همیشه true، فراخوان مسئول
 * صحت رخداد است).
 */
export function matchesReferralTrigger(): boolean {
  return true;
}

export interface CouponRewardAmountInput {
  rewardValueType: IncentiveValueType;
  rewardValue: number;
  /** undefined برای REFERRAL — سفارشی که پاداش درصدی روی آن محاسبه شود وجود ندارد */
  orderAmount?: number;
}

/**
 * FIXED_AMOUNT: مقدار مستقیم؛ اگر سفارشی در کار باشد کلمپ به مبلغ سفارش می‌شود.
 * PERCENTAGE: بدون orderAmount قابل‌محاسبه نیست => صفر.
 */
export function calculateCouponRewardAmount(
  input: CouponRewardAmountInput,
): number {
  if (input.rewardValueType === IncentiveValueType.FIXED_AMOUNT) {
    const raw = Math.max(input.rewardValue, 0);
    return input.orderAmount != null ? Math.min(raw, input.orderAmount) : raw;
  }

  if (input.orderAmount == null) {
    return 0;
  }
  const raw = (input.orderAmount * input.rewardValue) / 100;
  return Math.min(Math.max(raw, 0), input.orderAmount);
}
