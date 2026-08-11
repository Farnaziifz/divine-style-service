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
   * finalPrice = (costPrice + packagingCost) × profitMultiplier، سپس مالیات روی نتیجه اعمال می‌شود.
   * packagingCost و taxPercent تنظیمات سراسری سایت هستند (SiteSetting)، profitMultiplier مخصوص دسته‌بندی است.
   * نتیجه به پایین رند می‌شود به نزدیک‌ترین هزار تومان (مثلاً ۲۹۷,۱۹۳ → ۲۹۷,۰۰۰).
   */
  calculateFinalPrice(
    costPrice: number,
    profitMultiplier: number,
    packagingCost: number,
    taxPercent: number,
  ): number {
    const base = (costPrice + packagingCost) * profitMultiplier;
    const raw = base * (1 + taxPercent / 100);
    return Math.floor(raw / 1000) * 1000;
  }

  async computeFinalPrice(
    costPrice: number,
    profitMultiplier: number,
  ): Promise<number> {
    const { packagingCost, taxPercent } = await this.getPricingSettings();
    return this.calculateFinalPrice(
      costPrice,
      profitMultiplier,
      packagingCost,
      taxPercent,
    );
  }

  private async recalculateProductPrices(
    where: Prisma.ProductWhereInput,
    packagingCost: number,
    taxPercent: number,
  ): Promise<number> {
    const products = await this.prisma.product.findMany({
      where,
      select: {
        id: true,
        costPrice: true,
        category: { select: { profitMultiplier: true } },
      },
    });

    if (products.length === 0) return 0;

    await this.prisma.$transaction(
      products.map((p) =>
        this.prisma.product.update({
          where: { id: p.id },
          data: {
            finalPrice: this.calculateFinalPrice(
              Number(p.costPrice),
              Number(p.category.profitMultiplier),
              packagingCost,
              taxPercent,
            ),
          },
        }),
      ),
    );

    return products.length;
  }

  /** بعد از تغییر PACKAGING_COST یا TAX_PERCENT، قیمت نهایی همهٔ محصولات را با مقادیر جدید دوباره محاسبه می‌کند. */
  async recalculateAllProductPrices(
    packagingCost: number,
    taxPercent: number,
  ): Promise<number> {
    return this.recalculateProductPrices(
      { isDeleted: false },
      packagingCost,
      taxPercent,
    );
  }

  /** دکمهٔ «به‌روزرسانی قیمت محصولات موجود» در لیست ادمین — فقط محصولاتی که حداقل یک واریانت با موجودی دارند. */
  async recalculateInStockProductPrices(): Promise<number> {
    const { packagingCost, taxPercent } = await this.getPricingSettings();
    return this.recalculateProductPrices(
      {
        isDeleted: false,
        variants: { some: { isDeleted: false, stock: { gt: 0 } } },
      },
      packagingCost,
      taxPercent,
    );
  }
}
