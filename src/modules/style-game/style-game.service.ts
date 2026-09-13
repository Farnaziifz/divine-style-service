import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { MinioService } from '../shared/minio/minio.service';
import { GapgptService } from './gapgpt.service';
import { StyleGameStatus } from '@prisma/client';

const EARRING_CATEGORY_SLUG = 'gwshwarh';
const SCORE_PASS_THRESHOLD = 70;
const CANDIDATE_POOL_SIZE = 5;

type ProductCard = {
  id: string;
  title: string;
  images: string[];
  finalPrice: number;
};

@Injectable()
export class StyleGameService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minioService: MinioService,
    private readonly gapgptService: GapgptService,
  ) {}

  private async getEarringCategoryId(): Promise<string> {
    const category = await this.prisma.category.findFirst({
      where: { slug: EARRING_CATEGORY_SLUG },
      select: { id: true },
    });
    if (!category) {
      throw new BadRequestException('دسته‌بندی گوشواره یافت نشد');
    }
    return category.id;
  }

  private toCard(p: { id: string; title: string; images: string[]; finalPrice: any }): ProductCard {
    return { id: p.id, title: p.title, images: p.images, finalPrice: p.finalPrice.toNumber() };
  }

  async getEligibleProducts(): Promise<ProductCard[]> {
    const categoryId = await this.getEarringCategoryId();
    const products = await this.prisma.product.findMany({
      where: { categoryId, isActive: true, isDeleted: false },
      select: { id: true, title: true, images: true, finalPrice: true },
      orderBy: { createdAt: 'desc' },
    });
    return products.map((p) => this.toCard(p));
  }

  async startSession(userId: string, eventCode: string | undefined, photoUrl: string) {
    let eventId: string | null = null;
    if (eventCode) {
      const event = await this.prisma.event.findFirst({
        where: { eventCode, isActive: true, isDeleted: false },
        select: { id: true },
      });
      if (!event) {
        throw new NotFoundException('رویداد یافت نشد');
      }
      eventId = event.id;
    }

    const session = await this.prisma.styleGameSession.create({
      data: { userId, eventId, photoUrl },
    });
    return { id: session.id, status: session.status };
  }

  async submitAttempt(sessionId: string, userId: string, productId: string) {
    const session = await this.prisma.styleGameSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) {
      throw new NotFoundException('نشست بازی یافت نشد');
    }
    if (session.status === StyleGameStatus.COMPLETED) {
      throw new BadRequestException('این بازی قبلاً تمام شده است');
    }

    const categoryId = await this.getEarringCategoryId();
    const attemptNumber = session.status === StyleGameStatus.AWAITING_ATTEMPT_1 ? 1 : 2;

    if (attemptNumber === 1) {
      const product = await this.prisma.product.findFirst({
        where: { id: productId, categoryId, isActive: true, isDeleted: false },
        select: { id: true, title: true, images: true },
      });
      if (!product) {
        throw new BadRequestException('محصول انتخابی معتبر نیست');
      }
      if (!product.images[0]) {
        throw new BadRequestException('این محصول عکس ندارد');
      }

      const candidates = await this.prisma.product.findMany({
        where: { categoryId, isActive: true, isDeleted: false, id: { not: productId } },
        select: { id: true, title: true },
        take: CANDIDATE_POOL_SIZE,
      });

      const imageBuffer = await this.gapgptService.generateStyledImage(
        session.photoUrl,
        product.images[0],
        product.title,
      );
      const imageUrl = await this.minioService.uploadBuffer(imageBuffer, 'image/png', 'style-game', '.png');
      const { score, alternativeProductIds } = await this.gapgptService.evaluateStyleFit(
        imageBuffer,
        { id: product.id, title: product.title },
        candidates,
      );

      const passed = score >= SCORE_PASS_THRESHOLD;
      const suggestedIds = passed
        ? []
        : alternativeProductIds.length === 2
          ? alternativeProductIds
          : candidates.slice(0, 2).map((c) => c.id);

      await this.prisma.styleGameSession.update({
        where: { id: session.id },
        data: {
          attempt1ProductId: productId,
          attempt1ImageUrl: imageUrl,
          attempt1Score: score,
          status: passed ? StyleGameStatus.COMPLETED : StyleGameStatus.AWAITING_ATTEMPT_2,
          suggestedProductIds: suggestedIds,
          passed,
        },
      });

      let alternatives: ProductCard[] | null = null;
      if (!passed) {
        const alternativeProducts = await this.prisma.product.findMany({
          where: { id: { in: suggestedIds } },
          select: { id: true, title: true, images: true, finalPrice: true },
        });
        alternatives = alternativeProducts.map((p) => this.toCard(p));
      }

      return { attemptNumber, imageUrl, score, final: passed, alternatives };
    }

    // attemptNumber === 2
    if (!session.suggestedProductIds.includes(productId)) {
      throw new BadRequestException('محصول انتخابی باید یکی از دو گزینهٔ پیشنهادی باشد');
    }
    const product = await this.prisma.product.findFirst({
      where: { id: productId, categoryId, isActive: true, isDeleted: false },
      select: { id: true, title: true, images: true },
    });
    if (!product || !product.images[0]) {
      throw new BadRequestException('محصول انتخابی معتبر نیست');
    }

    const candidates = await this.prisma.product.findMany({
      where: { categoryId, isActive: true, isDeleted: false, id: { not: productId } },
      select: { id: true, title: true },
      take: CANDIDATE_POOL_SIZE,
    });

    const imageBuffer = await this.gapgptService.generateStyledImage(
      session.photoUrl,
      product.images[0],
      product.title,
    );
    const imageUrl = await this.minioService.uploadBuffer(imageBuffer, 'image/png', 'style-game', '.png');
    const { score } = await this.gapgptService.evaluateStyleFit(
      imageBuffer,
      { id: product.id, title: product.title },
      candidates,
    );

    await this.prisma.styleGameSession.update({
      where: { id: session.id },
      data: {
        attempt2ProductId: productId,
        attempt2ImageUrl: imageUrl,
        attempt2Score: score,
        status: StyleGameStatus.COMPLETED,
        passed: score >= SCORE_PASS_THRESHOLD,
      },
    });

    // طبق تصمیم محصولی: تلاش دوم همیشه به‌عنوان نتیجهٔ نهایی (موفق) نمایش داده می‌شود
    return { attemptNumber, imageUrl, score, final: true, alternatives: null };
  }
}
