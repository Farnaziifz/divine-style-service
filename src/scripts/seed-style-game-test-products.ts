/**
 * فقط برای dev لوکال: چند محصول تستیِ دسته گوشواره با عکس تولیدشده در همان لحظه
 * (نه عکس واقعی کاتالوگ) می‌سازد و مستقیماً در همان MinIO محلی آپلود می‌کند.
 *
 * چرا لازم است: `.env` لوکال به دیتابیس ریموت وصل است ولی MinIO محلی (خالی)
 * استفاده می‌کند — پس محصولات واقعی گوشواره عکس‌شون توی MinIO لوکال وجود نداره
 * و بازی استایل با «The specified key does not exist» شکست می‌خوره. این اسکریپت
 * محصول‌های تستیِ خودکفا (عکسشون همینجا در MinIO لوکال ساخته و آپلود می‌شه) اضافه
 * می‌کنه تا بشه کل مسیر بازی رو لوکال تست کرد.
 *
 * اجرا:   npm run seed:style-game-test-products
 * حذف:    npm run unseed:style-game-test-products
 */
import * as zlib from 'zlib';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../modules/shared/prisma/prisma.service';
import { MinioService } from '../modules/shared/minio/minio.service';

const TITLE_PREFIX = '[تستی]';

const TEST_PRODUCTS: { title: string; color: [number, number, number] }[] = [
  { title: `${TITLE_PREFIX} گوشواره طلایی`, color: [212, 175, 55] },
  { title: `${TITLE_PREFIX} گوشواره نقره‌ای`, color: [192, 192, 192] },
  { title: `${TITLE_PREFIX} گوشواره رزگلد`, color: [183, 110, 121] },
  { title: `${TITLE_PREFIX} گوشواره مشکی`, color: [30, 30, 30] },
];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/** یک PNG تک‌رنگ RGB معتبر (بدون هیچ وابستگی خارجی) می‌سازد */
function makeSolidPng(size: number, [r, g, b]: [number, number, number]): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: truecolor (RGB)
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = pngChunk('IHDR', ihdrData);

  const row = Buffer.alloc(1 + size * 3); // filter byte + RGB per pixel
  for (let x = 0; x < size; x++) {
    row[1 + x * 3] = r;
    row[1 + x * 3 + 1] = g;
    row[1 + x * 3 + 2] = b;
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const idat = pngChunk('IDAT', zlib.deflateSync(raw));
  const iend = pngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);
  const minio = app.get(MinioService);

  const category = await prisma.category.findFirst({ where: { slug: 'gwshwarh' } });
  if (!category) {
    console.error('دسته‌بندی گوشواره (slug: gwshwarh) پیدا نشد.');
    await app.close();
    return;
  }

  for (const { title, color } of TEST_PRODUCTS) {
    const existing = await prisma.product.findFirst({ where: { title } });
    if (existing) {
      console.log(`از قبل وجود دارد، رد شد: ${title}`);
      continue;
    }

    const png = makeSolidPng(512, color);
    const imageUrl = await minio.uploadBuffer(png, 'image/png', 'uploads', '.png');

    const product = await prisma.product.create({
      data: {
        title,
        slug: `test-style-game-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        description: 'محصول تستی برای بازی استایل — فقط محیط dev لوکال، عکس واقعی نیست.',
        images: [imageUrl],
        categoryId: category.id,
        code: Math.floor(100000 + Math.random() * 800000),
        costPrice: 100000,
        finalPrice: 150000,
        isActive: true,
      },
    });
    console.log(`ساخته شد: ${title} (${product.id})`);
  }

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
