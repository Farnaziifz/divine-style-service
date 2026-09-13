/**
 * حذف محصولات تستیِ ساخته‌شده توسط seed-style-game-test-products.ts
 * (هر محصولی که عنوانش با «[تستی]» شروع می‌شود).
 *
 * اجرا: npm run unseed:style-game-test-products
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../modules/shared/prisma/prisma.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);

  const { count } = await prisma.product.deleteMany({
    where: { title: { startsWith: '[تستی]' } },
  });
  console.log(`${count} محصول تستی حذف شد.`);

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
