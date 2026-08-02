import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ContentCalendarService } from './content-calendar.service';

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const MAX_BACKFILL_PRODUCTS = 10;

/**
 * هر ۲ روز چک می‌کند: اگر محصول جدیدی در این بازه اضافه نشده، از محصولات
 * فعالِ بدون هیچ برنامه تقویم محتوایی، چند تا را برای روزهای خالی بعدی زمان‌بندی می‌کند.
 */
@Injectable()
export class ContentCalendarSweeperService {
  private readonly logger = new Logger(ContentCalendarSweeperService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentCalendarService: ContentCalendarService,
  ) {}

  @Cron('0 3 */2 * *')
  async sweep() {
    const twoDaysAgo = new Date(Date.now() - TWO_DAYS_MS);
    const recentProductCount = await this.prisma.product.count({
      where: { createdAt: { gte: twoDaysAgo } },
    });
    if (recentProductCount > 0) return;

    const unscheduled = await this.prisma.product.findMany({
      where: { isActive: true, contentCalendarEntries: { none: {} } },
      select: { id: true },
      take: MAX_BACKFILL_PRODUCTS,
    });
    if (unscheduled.length === 0) return;

    let scheduled = 0;
    for (const product of unscheduled) {
      await this.contentCalendarService.scheduleProduct(product.id);
      scheduled++;
    }
    this.logger.log(
      `Scheduled content calendar entries for ${scheduled} old product(s)`,
    );
  }

  @Cron('0 2 * * *')
  async replanStale() {
    const replanned = await this.contentCalendarService.replanStaleProducts();
    if (replanned > 0) {
      this.logger.log(`Replanned content calendar for ${replanned} stale product(s)`);
    }
  }
}
