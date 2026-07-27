import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * finalPrice = (costPrice + packagingCost) × profitMultiplier، سپس مالیات روی نتیجه اعمال می‌شود.
   * packagingCost و taxPercent تنظیمات سراسری سایت هستند (SiteSetting)، profitMultiplier مخصوص دسته‌بندی است.
   */
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

    const base = (costPrice + packagingCost) * profitMultiplier;
    return Math.round(base * (1 + taxPercent / 100));
  }
}
