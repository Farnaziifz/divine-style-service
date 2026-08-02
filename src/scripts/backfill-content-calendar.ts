/**
 * یک‌بارمصرف: تمام محصولات فعالِ بدون هیچ برنامه تقویم محتوایی را (به ترتیب
 * قدیمی‌ترین) به اولین روزهای خالی تقویم اضافه می‌کند. برای اجرا بعد از دیپلوی
 * روی سرور، وقتی محصولات موجود هنوز برنامه‌ای ندارند (کرون دوروزه فقط ۱۰ تا در
 * هر اجرا اضافه می‌کند و چند روز طول می‌کشد؛ این اسکریپت همه را یکجا اضافه می‌کند).
 *
 * اجرا (dev):  npx ts-node -r tsconfig-paths/register src/scripts/backfill-content-calendar.ts
 * اجرا (prod، بعد از build):  node dist/src/scripts/backfill-content-calendar.js
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../modules/shared/prisma/prisma.service';
import { ContentCalendarService } from '../modules/content-calendar/content-calendar.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const prisma = app.get(PrismaService);
  const contentCalendar = app.get(ContentCalendarService);

  const unscheduled = await prisma.product.findMany({
    where: { isActive: true, contentCalendarEntries: { none: {} } },
    select: { id: true, title: true, code: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`${unscheduled.length} محصول بدون برنامه تقویم محتوایی پیدا شد.`);

  for (const product of unscheduled) {
    await contentCalendar.scheduleProduct(product.id);
    console.log(`  زمان‌بندی شد: [${product.code}] ${product.title}`);
  }

  console.log('تمام.');
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
