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
    data: CreateProductDto & {
      slug: string;
      images: string[];
      code: number;
      finalPrice: number;
    },
  ): Promise<Product> {
    const { collectionIds, variants, slug, ...rest } = data;
    const uniqueSlug = await this.ensureUniqueSlug(slug);
    const product = await this.prisma.product.create({
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
                size: variant.size,
                color: variant.color,
                colorCode: variant.colorCode,
                stock: variant.stock,
                specifications: variant.specifications ?? undefined,
              })),
            }
          : undefined,
      },
      include: { category: true, collections: true, variants: true },
    });
    return this.attachVariantPricing(product);
  }

  /**
   * قیمت در سطح محصول است؛ برای سازگاری با فرانت‌هایی که هنوز variant.price می‌خوانند
   * (سایت مشتری)، همان مقدار محصول را روی هر واریانت هم آینه می‌کنیم.
   */
  private attachVariantPricing<T extends { finalPrice: any; discountPrice: any; discountPercent: any; variants?: any[] }>(
    product: T,
  ): T {
    if (Array.isArray(product.variants)) {
      product.variants = product.variants.map((v) => ({
        ...v,
        price: product.finalPrice,
        discountPrice: product.discountPrice ?? null,
        discountPercent: product.discountPercent ?? null,
      }));
    }
    return product;
  }

  async findAll(
    filter?: ProductFilterDto,
    includeInactive = false,
  ): Promise<PaginatedResult<Product>> {
    const page = Number(filter?.page) || 1;
    const limit = Number(filter?.limit) || 10;
    const skip = (page - 1) * limit;

    const where: any = { isDeleted: false };
    if (!includeInactive) {
      where.isActive = true;
      // موجودی هیچ واریانتی نداره -> برای مشتری نمایش داده نشه (فقط ادمین/اپراتور ببینه)
      where.variants = { some: { isDeleted: false, stock: { gt: 0 } } };
    }

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

    if (filter?.showInRack != null) {
      where.showInRack = filter.showInRack;
    }

    if (filter?.minPrice || filter?.maxPrice) {
      where.finalPrice = {
        gte: filter.minPrice,
        lte: filter.maxPrice,
      };
    }

    const orderBy: any = {};
    if (filter?.sort) {
      if (filter.sort === 'newest') orderBy.createdAt = 'desc';
      if (filter.sort === 'sold') orderBy.soldCount = 'desc';
      if (filter.sort === 'price_asc') orderBy.finalPrice = 'asc';
      if (filter.sort === 'price_desc') orderBy.finalPrice = 'desc';
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
      data: data.map((p) => this.attachVariantPricing(p)),
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string, includeInactive = false): Promise<Product | null> {
    const where: any = { id, isDeleted: false };
    if (!includeInactive) {
      where.isActive = true;
      where.variants = { some: { isDeleted: false, stock: { gt: 0 } } };
    }
    const product = await this.prisma.product.findFirst({
      where,
      include: {
        category: true,
        collections: true,
        variants: true,
      },
    });
    return product ? this.attachVariantPricing(product) : null;
  }

  async findBySlug(slug: string, includeInactive = false): Promise<Product | null> {
    const where: any = { slug, isDeleted: false };
    if (!includeInactive) {
      where.isActive = true;
    }
    const product = await this.prisma.product.findFirst({
      where,
      include: {
        category: true,
        collections: true,
        variants: true,
      },
    });
    return product ? this.attachVariantPricing(product) : null;
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
      const updated = await this.prisma.product.update({
        where: { id },
        data: updateData,
        include: { category: true, collections: true, variants: true },
      });
      return this.attachVariantPricing(updated);
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
        if (v.sku && existingSkuSet.has(v.sku)) {
          await tx.productVariant.update({
            where: { sku: v.sku },
            data: {
              size: v.size,
              color: v.color,
              colorCode: v.colorCode,
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

    const updated = await this.prisma.product.findFirst({
      where: { id },
      include: {
        category: true,
        collections: true,
        variants: true,
      },
    });
    return (
      updated ? this.attachVariantPricing(updated) : updated
    ) as unknown as Product;
  }

  async countRackItems(categoryId: string, excludeProductId?: string): Promise<number> {
    return this.prisma.product.count({
      where: {
        categoryId,
        showInRack: true,
        isDeleted: false,
        ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
      },
    });
  }

  async remove(id: string): Promise<Product> {
    return this.prisma.product.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date(), isActive: false },
    });
  }
}
