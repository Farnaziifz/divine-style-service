/**
 * یک‌بارمصرف: محاسبهٔ RFM و ثبت اولین اسنپ‌شات SegmentMembership برای همهٔ مشتریان موجود.
 * اجراهای بعدی توسط SegmentationSchedulerService به‌صورت شبانه انجام می‌شود.
 *
 * اجرا (dev): npm run backfill:customer-segments
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SegmentationService } from '../modules/loyalty/segmentation.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const segmentationService = app.get(SegmentationService);
  const summary = await segmentationService.runSegmentation();

  console.log('توزیع سگمنت مشتریان:');
  for (const [key, count] of Object.entries(summary)) {
    console.log(`  ${key}: ${count}`);
  }

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
