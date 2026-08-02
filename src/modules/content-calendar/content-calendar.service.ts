import { Injectable, NotFoundException } from '@nestjs/common';
import { ContentEntryType } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';

const MAX_LOOKAHEAD_DAYS = 90;
const PRODUCT_SELECT = { id: true, title: true, images: true } as const;
const REPLAN_INTERVAL_SETTING_KEY = 'CONTENT_REPLAN_INTERVAL_DAYS';
const DEFAULT_REPLAN_INTERVAL_DAYS = 10;

@Injectable()
export class ContentCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  findRange(from: string, to: string) {
    return this.prisma.contentCalendarEntry.findMany({
      where: { date: { gte: new Date(from), lte: new Date(to) } },
      include: { products: { select: PRODUCT_SELECT } },
      orderBy: { date: 'asc' },
    });
  }

  async toggle(id: string, isDone: boolean) {
    const entry = await this.prisma.contentCalendarEntry.findFirst({
      where: { id },
      include: { products: { select: { id: true, contentPostedAt: true } } },
    });
    if (!entry) throw new NotFoundException('برنامه یافت نشد');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.contentCalendarEntry.update({
        where: { id },
        data: { isDone, doneAt: isDone ? new Date() : null },
        include: { products: { select: PRODUCT_SELECT } },
      });

      if (isDone) {
        const productIds = entry.products
          .filter((p) => p.contentPostedAt === null)
          .map((p) => p.id);
        if (productIds.length > 0) {
          await tx.product.updateMany({
            where: { id: { in: productIds } },
            data: { contentPostedAt: new Date() },
          });
        }
      }

      return updated;
    });
  }

  async createManual(dto: {
    date: string;
    type: ContentEntryType;
    title?: string;
    productIds?: string[];
  }) {
    return this.prisma.contentCalendarEntry.create({
      data: {
        date: new Date(dto.date),
        type: dto.type,
        title: dto.title,
        products: dto.productIds?.length
          ? { connect: dto.productIds.map((id) => ({ id })) }
          : undefined,
      },
      include: { products: { select: PRODUCT_SELECT } },
    });
  }

  async remove(id: string) {
    await this.prisma.contentCalendarEntry.delete({ where: { id } });
  }

  /** اولین روزی که هنوز هیچ آیتمی توش برنامه‌ریزی نشده، از fromDate به بعد. */
  private async findNextEmptyDate(fromDate: Date): Promise<Date> {
    const cursor = new Date(
      Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate()),
    );
    for (let i = 0; i < MAX_LOOKAHEAD_DAYS; i++) {
      const candidate = new Date(cursor);
      candidate.setUTCDate(candidate.getUTCDate() + i);
      const existing = await this.prisma.contentCalendarEntry.findFirst({
        where: { date: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
    }
    throw new Error(
      `No empty calendar day found within ${MAX_LOOKAHEAD_DAYS} days`,
    );
  }

  async scheduleProduct(productId: string, fromDate: Date = new Date()) {
    const date = await this.findNextEmptyDate(fromDate);
    const connect = { connect: [{ id: productId }] };
    await this.prisma.$transaction([
      this.prisma.contentCalendarEntry.create({
        data: { date, type: ContentEntryType.POST, products: connect },
      }),
      this.prisma.contentCalendarEntry.create({
        data: { date, type: ContentEntryType.STORY, products: connect },
      }),
    ]);
  }

  async getSettings() {
    const setting = await this.prisma.siteSetting.findUnique({
      where: { key: REPLAN_INTERVAL_SETTING_KEY },
      select: { value: true },
    });
    return {
      replanIntervalDays: setting ? Number(setting.value) : DEFAULT_REPLAN_INTERVAL_DAYS,
    };
  }

  async updateSettings(replanIntervalDays: number) {
    await this.prisma.siteSetting.upsert({
      where: { key: REPLAN_INTERVAL_SETTING_KEY },
      create: { key: REPLAN_INTERVAL_SETTING_KEY, value: String(replanIntervalDays) },
      update: { value: String(replanIntervalDays) },
    });
    return { replanIntervalDays };
  }

  /**
   * محصولاتی که قبلاً حداقل یکبار برنامه محتوایی داشتن، هنوز موجودی دارن، ولی از
   * آخرین برنامه‌شون بیش از فاصله تنظیم‌شده گذشته — دوباره به اولین روز خالی اضافه می‌شن.
   */
  async replanStaleProducts(): Promise<number> {
    const { replanIntervalDays } = await this.getSettings();
    const cutoff = new Date(Date.now() - replanIntervalDays * 24 * 60 * 60 * 1000);

    const inStockProducts = await this.prisma.product.findMany({
      where: { isActive: true, variants: { some: { stock: { gt: 0 } } } },
      select: { id: true },
    });
    const eligibleIds = new Set(inStockProducts.map((p) => p.id));
    if (eligibleIds.size === 0) return 0;

    const entries = await this.prisma.contentCalendarEntry.findMany({
      where: { products: { some: { id: { in: [...eligibleIds] } } } },
      select: { date: true, products: { select: { id: true } } },
    });

    const lastDateByProduct = new Map<string, Date>();
    for (const entry of entries) {
      for (const product of entry.products) {
        if (!eligibleIds.has(product.id)) continue;
        const prev = lastDateByProduct.get(product.id);
        if (!prev || entry.date > prev) lastDateByProduct.set(product.id, entry.date);
      }
    }

    let replanned = 0;
    for (const [productId, lastDate] of lastDateByProduct) {
      if (lastDate <= cutoff) {
        await this.scheduleProduct(productId);
        replanned++;
      }
    }
    return replanned;
  }
}
