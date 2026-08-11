import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

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

    const packagingCost = Number(packaging?.value) || 0;
    const taxPercent = Number(tax?.value) || 0;

    return this.calculateFinalPrice(
      costPrice,
      profitMultiplier,
      packagingCost,
      taxPercent,
    );
  }

  /** بعد از تغییر PACKAGING_COST یا TAX_PERCENT، قیمت نهایی همهٔ محصولات را با مقادیر جدید دوباره محاسبه می‌کند. */
  async recalculateAllProductPrices(
    packagingCost: number,
    taxPercent: number,
  ): Promise<number> {
    const products = await this.prisma.product.findMany({
      where: { isDeleted: false },
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
}
