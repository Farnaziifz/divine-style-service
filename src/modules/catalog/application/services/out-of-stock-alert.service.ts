import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { SmsTextService } from '../../../shared/sms/sms-text.service';

/**
 * Periodically checks for products whose stock just dropped to zero across
 * all their variants, and alerts the admin notification numbers once per
 * stockout (outOfStockNotifiedAt gates re-sending until it's restocked).
 */
@Injectable()
export class OutOfStockAlertService {
  private readonly logger = new Logger(OutOfStockAlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly smsText: SmsTextService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep() {
    await this.notifyNewlyOutOfStock();
    await this.clearRestocked();
  }

  private async notifyNewlyOutOfStock() {
    const candidates = await this.prisma.product.findMany({
      where: {
        isActive: true,
        isDeleted: false,
        outOfStockNotifiedAt: null,
        variants: { none: { isDeleted: false, stock: { gt: 0 } } },
      },
      select: { id: true, title: true },
    });
    if (candidates.length === 0) return;

    await this.prisma.product.updateMany({
      where: { id: { in: candidates.map((p) => p.id) } },
      data: { outOfStockNotifiedAt: new Date() },
    });

    try {
      const recipients = await this.prisma.orderNotificationPhone.findMany({
        where: { isActive: true, isDeleted: false },
        select: { phoneNumber: true },
      });
      const text = this.smsText.buildOutOfStockAlertText(
        candidates.map((p) => p.title),
      );
      await Promise.all(
        recipients.map((r) => this.smsText.send(r.phoneNumber, text)),
      );
    } catch {
      // Notification failure must never break the sweep.
    }

    this.logger.log(
      `Flagged ${candidates.length} product(s) as newly out of stock`,
    );
  }

  private async clearRestocked() {
    await this.prisma.product.updateMany({
      where: {
        isDeleted: false,
        outOfStockNotifiedAt: { not: null },
        variants: { some: { isDeleted: false, stock: { gt: 0 } } },
      },
      data: { outOfStockNotifiedAt: null },
    });
  }
}
