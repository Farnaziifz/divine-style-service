import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { IProductRepository } from '../../domain/repositories/product.repository.interface';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { Product } from '@prisma/client';
import { CreateProductDto } from '../../presentation/dtos/create-product.dto';
import { ProductFilterDto } from '../../presentation/dtos/product-filter.dto';
import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface';

@Injectable()
export class PrismaProductRepository implements IProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureUniqueSlug(baseSlug: string): Promise<string> {
    const normalized = (baseSlug || '').trim();
    if (!normalized) {
      return randomUUID().slice(0, 8);
    }

    let candidate = normalized;
    let i = 2;
    // slug is unique in DB, so findUnique is safe & fast
    // keep trying until we find a free slug; fallback to random after a reasonable amount
    while (
      await this.prisma.product.findUnique({ where: { slug: candidate } })
    ) {
      candidate = `${normalized}-${i}`;
      i += 1;
      if (i > 50) {
        return `${normalized}-${randomUUID().slice(0, 6)}`;
      }
    }
    return candidate;
  }

  async create(
    data: CreateProductDto & { slug: string; images: string[] },
  ): Promise<Product> {
    const { collectionIds, variants, slug, ...rest } = data;
    const uniqueSlug = await this.ensureUniqueSlug(slug);
    return this.prisma.product.create({
      data: {
        ...rest,
        slug: uniqueSlug,
        collections: collectionIds
          ? {
              connect: collectionIds.map((id) => ({ id })),
            }
          : undefined,
        variants: variants
          ? {
              create: variants.map((variant) => ({
                // SKU یکتا در کل دیتابیس تا تداخل با محصولات دیگر نباشد
                sku: `${uniqueSlug}-${randomUUID().slice(0, 8)}`,
                discountPercent: variant.discountPercent ?? undefined,
                size: variant.size,
                color: variant.color,
                colorCode: variant.colorCode,
                price: variant.price,
                discountPrice:
                  typeof variant.discountPercent === 'number' &&
                  variant.discountPercent > 0
                    ? Math.round(
                        ((variant.price * (100 - variant.discountPercent)) /
                          100) *
                          100,
                      ) / 100
                    : variant.discountPrice,
                stock: variant.stock,
                specifications: variant.specifications ?? undefined,
              })),
            }
          : undefined,
      },
    });
  }

  async findAll(filter?: ProductFilterDto): Promise<PaginatedResult<Product>> {
    const page = Number(filter?.page) || 1;
    const limit = Number(filter?.limit) || 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filter?.search) {
      where.OR = [
        { title: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    if (filter?.categoryId) {
      where.categoryId = filter.categoryId;
    }

    if (filter?.collectionId) {
      where.collections = {
        some: { id: filter.collectionId },
      };
    }

    if (filter?.isFeatured === true) {
      where.isFeatured = true;
    }

    if (filter?.showInIntro === true) {
      where.showInIntro = true;
    }

    if (filter?.minPrice || filter?.maxPrice) {
      where.variants = {
        some: {
          price: {
            gte: filter.minPrice,
            lte: filter.maxPrice,
          },
        },
      };
    }

    const orderBy: any = {};
    if (filter?.sort) {
      if (filter.sort === 'newest') orderBy.createdAt = 'desc';
      if (filter.sort === 'sold') orderBy.soldCount = 'desc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          category: true,
          collections: true,
          variants: true,
        },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string): Promise<Product | null> {
    return this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        collections: true,
        variants: true,
      },
    });
  }

  async findBySlug(slug: string): Promise<Product | null> {
    return this.prisma.product.findUnique({
      where: { slug },
      include: {
        category: true,
        collections: true,
        variants: true,
      },
    });
  }

  async update(id: string, data: any): Promise<Product> {
    const { collectionIds, variants, ...rest } = data;
    const updateData: any = { ...rest };

    if (collectionIds) {
      updateData.collections = {
        set: collectionIds.map((id: string) => ({ id })),
      };
    }

    if (!variants) {
      return this.prisma.product.update({
        where: { id },
        data: updateData,
      });
    }

    const product = await this.prisma.product.findFirst({
      where: { id },
      select: { id: true, slug: true },
    });
    if (!product) {
      throw new Error('Product not found');
    }

    const existingVariants = await this.prisma.productVariant.findMany({
      where: { productId: id },
      select: { sku: true },
    });
    const existingSkuSet = new Set(existingVariants.map((v) => v.sku));

    const incoming = (variants as any[]).map((v) => ({
      sku: typeof v.sku === 'string' && v.sku.trim() ? v.sku.trim() : null,
      size: v.size ?? undefined,
      color: v.color ?? undefined,
      colorCode: v.colorCode ?? undefined,
      price: Number(v.price) || 0,
      discountPercent:
        typeof v.discountPercent === 'number'
          ? v.discountPercent
          : v.discountPercent != null
            ? Number(v.discountPercent) || undefined
            : undefined,
      discountPrice:
        typeof v.discountPrice === 'number'
          ? v.discountPrice
          : v.discountPrice != null
            ? Number(v.discountPrice) || undefined
            : undefined,
      stock: Number(v.stock) || 0,
      specifications: v.specifications ?? undefined,
    }));

    const skusToKeep = new Set(
      incoming
        .map((v) => v.sku)
        .filter((sku): sku is string => !!sku && existingSkuSet.has(sku)),
    );
    const skusToSoftDelete = existingVariants
      .map((v) => v.sku)
      .filter((sku) => !skusToKeep.has(sku));

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: updateData,
      });

      for (const v of incoming) {
        const computedDiscountPrice =
          typeof v.discountPercent === 'number' && v.discountPercent > 0
            ? Math.round(((v.price * (100 - v.discountPercent)) / 100) * 100) /
              100
            : v.discountPrice;

        if (v.sku && existingSkuSet.has(v.sku)) {
          await tx.productVariant.update({
            where: { sku: v.sku },
            data: {
              size: v.size,
              color: v.color,
              colorCode: v.colorCode,
              price: v.price,
              discountPercent: v.discountPercent ?? undefined,
              discountPrice: computedDiscountPrice,
              stock: v.stock,
              specifications: v.specifications ?? undefined,
              isDeleted: false,
              deletedAt: null,
            },
          });
        } else {
          await tx.productVariant.create({
            data: {
              productId: id,
              sku: `${product.slug}-${randomUUID().slice(0, 8)}`,
              size: v.size,
              color: v.color,
              colorCode: v.colorCode,
              price: v.price,
              discountPercent: v.discountPercent ?? undefined,
              discountPrice: computedDiscountPrice,
              stock: v.stock,
              specifications: v.specifications ?? undefined,
            },
          });
        }
      }

      if (skusToSoftDelete.length > 0) {
        await tx.productVariant.updateMany({
          where: { productId: id, sku: { in: skusToSoftDelete } },
          data: { isDeleted: true, deletedAt: now },
        });
      }
    });

    return this.prisma.product.findFirst({
      where: { id },
      include: {
        category: true,
        collections: true,
        variants: true,
      },
    }) as unknown as Product;
  }

  async remove(id: string): Promise<Product> {
    return this.prisma.product.delete({ where: { id } });
  }
}
