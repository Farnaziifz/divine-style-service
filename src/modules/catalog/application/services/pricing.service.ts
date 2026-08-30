import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  private async getPricingSettings(): Promise<{
    packagingCost: number;
    taxPercent: number;
  }> {
    const [packaging, tax] = await this.prisma.$transaction([
      this.prisma.siteSetting.findUnique({
        where: { key: 'PACKAGING_COST' },
        select: { value: true },
      }),
      this.prisma.siteSetting.findUnique({
        where: { key: 'TAX_PERCENT' },
        select: { value: true },
      }),
    ]);
    return {
      packagingCost: Number(packaging?.value) || 0,
      taxPercent: Number(tax?.value) || 0,
    };
  }

  /**
   * finalPrice = (costPrice × profitMultiplier) × (1 + taxPercent/100)
   * هزینه بسته‌بندی دیگر روی قیمت محصول نمی‌آید؛ به‌صورت مبلغ ثابت به ازای کل سفارش در چک‌اوت اضافه می‌شود.
   * taxPercent تنظیم سراسری سایت است (SiteSetting)، profitMultiplier مخصوص دسته‌بندی است.
   * نتیجه به پایین رند می‌شود به نزدیک‌ترین هزار تومان (مثلاً ۲۹۷,۱۹۳ → ۲۹۷,۰۰۰).
   */
  calculateFinalPrice(
    costPrice: number,
    profitMultiplier: number,
    taxPercent: number,
  ): number {
    const base = costPrice * profitMultiplier;
    const raw = base * (1 + taxPercent / 100);
    return Math.floor(raw / 1000) * 1000;
  }

  async computeFinalPrice(
    costPrice: number,
    profitMultiplier: number,
  ): Promise<number> {
    const { taxPercent } = await this.getPricingSettings();
    return this.calculateFinalPrice(costPrice, profitMultiplier, taxPercent);
  }

  /**
   * discountPrice = (costPrice × profitMultiplier) × (1 - discountPercent/100)
   * تخفیف روی هزینه‌تمام‌شده+سود اعمال می‌شود، نه روی قیمت نهایی؛ مالیات و هزینه بسته‌بندی رو قیمت تخفیف‌خورده اعمال نمی‌شود.
   */
  calculateDiscountedPrice(
    costPrice: number,
    profitMultiplier: number,
    discountPercent: number,
  ): number {
    const base = costPrice * profitMultiplier;
    const raw = base * (1 - discountPercent / 100);
    return Math.floor(raw / 1000) * 1000;
  }

  /** هزینه بسته‌بندی سراسری سایت — یک‌بار به ازای کل سفارش در چک‌اوت اضافه می‌شود. */
  async getPackagingCost(): Promise<number> {
    const { packagingCost } = await this.getPricingSettings();
    return packagingCost;
  }

  private async recalculateProductPrices(
    where: Prisma.ProductWhereInput,
    taxPercent: number,
  ): Promise<number> {
    const products = await this.prisma.product.findMany({
      where,
      select: {
        id: true,
        costPrice: true,
        profitMultiplier: true,
        discountPercent: true,
      },
    });

    if (products.length === 0) return 0;

    await this.prisma.$transaction(
      products.map((p) => {
        const profitMultiplier = Number(p.profitMultiplier);
        const costPrice = Number(p.costPrice);
        return this.prisma.product.update({
          where: { id: p.id },
          data: {
            finalPrice: this.calculateFinalPrice(
              costPrice,
              profitMultiplier,
              taxPercent,
            ),
            ...(p.discountPercent != null && p.discountPercent > 0
              ? {
                  discountPrice: this.calculateDiscountedPrice(
                    costPrice,
                    profitMultiplier,
                    p.discountPercent,
                  ),
                }
              : {}),
          },
        });
      }),
    );

    return products.length;
  }

  /** بعد از تغییر TAX_PERCENT، قیمت نهایی همهٔ محصولات را با مقدار جدید دوباره محاسبه می‌کند. */
  async recalculateAllProductPrices(taxPercent: number): Promise<number> {
    return this.recalculateProductPrices({ isDeleted: false }, taxPercent);
  }

  /** دکمهٔ «به‌روزرسانی قیمت محصولات موجود» در لیست ادمین — فقط محصولاتی که حداقل یک واریانت با موجودی دارند. */
  async recalculateInStockProductPrices(): Promise<number> {
    const { taxPercent } = await this.getPricingSettings();
    return this.recalculateProductPrices(
      {
        isDeleted: false,
        variants: { some: { isDeleted: false, stock: { gt: 0 } } },
      },
      taxPercent,
    );
  }
}
