import { CreditLedgerReason, IncentiveValueType } from '@prisma/client';

export type CashbackDisqualifyReason =
  | 'INACTIVE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'WRONG_SEGMENT'
  | 'BELOW_MINIMUM';

export interface CashbackQualificationInput {
  isActive: boolean;
  startsAt: Date;
  endsAt: Date;
  /** null = برای همه مشتریان است، محدود به سگمنت خاصی نیست */
  targetSegmentId: string | null;
  /** آخرین سگمنتی که مشتری در آن قرار دارد؛ null یعنی مشتری هنوز هیچ سگمنتی ندارد */
  customerCurrentSegmentId: string | null;
  minPurchaseAmount: number | null;
  orderAmount: number;
  /** برای تست‌پذیری؛ پیش‌فرض زمان واقعی */
  now?: Date;
}

export interface CashbackQualificationResult {
  qualifies: boolean;
  reason?: CashbackDisqualifyReason;
}

/** خالص، بدون وابستگی به DB — آیا این سفارش واجد شرایط اعطای کش‌بک این incentive است */
export function qualifiesForCashback(
  input: CashbackQualificationInput,
): CashbackQualificationResult {
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
  if (
    input.minPurchaseAmount != null &&
    input.orderAmount < input.minPurchaseAmount
  ) {
    return { qualifies: false, reason: 'BELOW_MINIMUM' };
  }

  return { qualifies: true };
}

export interface CashbackAmountInput {
  valueType: IncentiveValueType;
  value: number;
  orderAmount: number;
}

/** درصد یا مبلغ ثابت روی مبلغ سفارش؛ کلمپ‌شده بین ۰ و مبلغ سفارش */
export function calculateCashbackAmount(input: CashbackAmountInput): number {
  const raw =
    input.valueType === IncentiveValueType.PERCENTAGE
      ? (input.orderAmount * input.value) / 100
      : input.value;
  return Math.min(Math.max(raw, 0), input.orderAmount);
}

export interface CreditLedgerEntryLike {
  amount: number;
  reason: CreditLedgerReason;
  expiresAt: Date | null;
}

/**
 * موجودی کش‌بک قابل‌استفاده *همین الان*: مجموع اعطاهای CASHBACK هنوز منقضی‌نشده
 * منهای مجموع مصرف‌شده‌ها (رکوردهای USED با amount منفی).
 * ساده‌سازی آگاهانه: چون امروز فقط جریان کش‌بک روی این ولت رکورد USED می‌سازد، محاسبهٔ
 * تجمیعی کافی است؛ اگر بعداً منبع اعتبار دیگری (مثل CREDIT_GIFT) هم به همین ولت اضافه شود،
 * باید مصرف هر منبع را جدا ردیابی کرد (این تابع آن را فرض نمی‌گیرد).
 */
export function computeAvailableCashback(
  entries: CreditLedgerEntryLike[],
  now: Date = new Date(),
): number {
  const validGrants = entries
    .filter((e) => e.reason === CreditLedgerReason.CASHBACK)
    .filter((e) => e.expiresAt == null || e.expiresAt > now)
    .reduce((sum, e) => sum + e.amount, 0);

  const used = entries
    .filter((e) => e.reason === CreditLedgerReason.USED)
    .reduce((sum, e) => sum + e.amount, 0);

  return Math.max(0, validGrants + used);
}

export interface CashbackApplyAmountInput {
  available: number;
  orderAmount: number;
  requestedAmount?: number;
}

/** مبلغ نهایی قابل‌اعمال: بین ۰ و min(موجودی معتبر, مبلغ سفارش) */
export function resolveCashbackApplyAmount(
  input: CashbackApplyAmountInput,
): number {
  const ceiling = Math.min(input.available, input.orderAmount);
  if (input.requestedAmount == null) {
    return Math.max(0, ceiling);
  }
  return Math.max(0, Math.min(input.requestedAmount, ceiling));
}
