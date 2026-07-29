import { BadRequestException, Injectable } from '@nestjs/common';
import { ICategoryRepository } from '../../domain/repositories/category.repository.interface';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { Category } from '@prisma/client';
import { CreateCategoryDto } from '../../presentation/dtos/create-category.dto';
import { UpdateCategoryDto } from '../../presentation/dtos/update-category.dto';
import { PaginationDto } from '../../../shared/dtos/pagination.dto';
import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface';

@Injectable()
export class PrismaCategoryRepository implements ICategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** جلوگیری از تداخل بازهٔ کد این دسته‌بندی با بازهٔ کد استفاده‌شدهٔ دسته‌بندی‌های دیگر */
  private async assertNoCodeRangeOverlap(codeStart: number, excludeId?: string) {
    const overlapping = await this.prisma.category.findFirst({
      where: {
        ...(excludeId ? { id: { not: excludeId } } : {}),
        isDeleted: false,
        codeStart: { lte: codeStart },
        nextCode: { gt: codeStart },
      },
      select: { id: true, title: true },
    });
    if (overlapping) {
      throw new BadRequestException(
        `بازهٔ کد وارد شده با دسته‌بندی «${overlapping.title}» تداخل دارد`,
      );
    }
  }

  async create(data: CreateCategoryDto & { slug: string }): Promise<Category> {
    await this.assertNoCodeRangeOverlap(data.codeStart);
    return this.prisma.category.create({
      data: {
        title: data.title,
        description: data.description,
        slug: data.slug,
        image: data.image,
        parentId: data.parentId,
        codeStart: data.codeStart,
        nextCode: data.codeStart,
        profitMultiplier: data.profitMultiplier ?? 1,
      },
    });
  }

  async findAll(
    pagination?: PaginationDto,
  ): Promise<PaginatedResult<Category>> {
    const page = Number(pagination?.page) || 1;
    const limit = Number(pagination?.limit) || 10;
    const skip = (page - 1) * limit;
    const search = pagination?.search?.trim();
    const where = search
      ? {
          isDeleted: false,
          title: { contains: search, mode: 'insensitive' as const },
        }
      : { isDeleted: false };

    const [data, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        skip,
        take: limit,
        include: { children: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.category.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
        limit,
      },
    };
  }

  async findById(id: string): Promise<Category | null> {
    return this.prisma.category.findFirst({
      where: { id, isDeleted: false },
      include: { children: true },
    });
  }

  async update(
    id: string,
    data: UpdateCategoryDto & { slug: string; nextCode?: number },
  ): Promise<Category> {
    if (data.codeStart != null) {
      await this.assertNoCodeRangeOverlap(data.codeStart, id);
    }
    return this.prisma.category.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        slug: data.slug,
        image: data.image,
        parentId: data.parentId,
        codeStart: data.codeStart,
        nextCode: data.nextCode,
        profitMultiplier: data.profitMultiplier,
      },
    });
  }

  async remove(id: string): Promise<Category> {
    return this.prisma.category.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }

  async allocateNextProductCode(categoryId: string): Promise<number> {
    const updated = await this.prisma.category.update({
      where: { id: categoryId },
      data: { nextCode: { increment: 1 } },
      select: { nextCode: true },
    });
    return updated.nextCode - 1;
  }

  async countProducts(categoryId: string): Promise<number> {
    return this.prisma.product.count({
      where: { categoryId, isDeleted: false },
    });
  }
}
