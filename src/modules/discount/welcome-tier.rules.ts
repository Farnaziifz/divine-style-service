export interface WelcomeTier {
  /** یک‌مبنا: چندمین خرید مشتری این تخفیف را می‌گیرد (۱=اول، ۲=دوم، ۳=سوم) */
  index: number;
  value: number;
  label: string;
}

/**
 * تخفیف خوش‌آمدگویی پلکانی — بدون نیاز به کد: خرید اول ۱۰٪، دوم ۱۵٪، سوم ۲۰٪.
 * از خرید چهارم به بعد اعمال نمی‌شود.
 */
export const WELCOME_TIERS: WelcomeTier[] = [
  { index: 1, value: 10, label: 'خرید اول' },
  { index: 2, value: 15, label: 'خرید دوم' },
  { index: 3, value: 20, label: 'خرید سوم' },
];

/** priorPaidCount = تعداد سفارش‌های PAID قبلی مشتری (سفارش جاری حساب نمی‌شود) */
export function welcomeTierForPriorPaidCount(
  priorPaidCount: number,
): WelcomeTier | null {
  return WELCOME_TIERS[priorPaidCount] ?? null;
}

export function formatWelcomeTierLabel(tier: WelcomeTier): string {
  return `${tier.label} (${tier.value}٪)`;
}

export function formatWelcomeTierMessage(tier: WelcomeTier): string {
  return `${tier.value}٪ تخفیف ${tier.label} شما به‌صورت خودکار اعمال شد`;
}
