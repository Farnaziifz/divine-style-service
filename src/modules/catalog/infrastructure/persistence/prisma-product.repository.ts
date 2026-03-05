import { Injectable } from '@nestjs/common';
import { IProductRepository } from '../../domain/repositories/product.repository.interface';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { Product } from '@prisma/client';
import { CreateProductDto } from '../../presentation/dtos/create-product.dto';
import { ProductFilterDto } from '../../presentation/dtos/product-filter.dto';

@Injectable()
export class PrismaProductRepository implements IProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: CreateProductDto & { slug: string; images: string[] },
  ): Promise<Product> {
    const { collectionIds, ...rest } = data;
    return this.prisma.product.create({
      data: {
        ...rest,
        collections: collectionIds
          ? {
              connect: collectionIds.map((id) => ({ id })),
            }
          : undefined,
      },
    });
  }

  async findAll(filter?: ProductFilterDto): Promise<Product[]> {
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

    return this.prisma.product.findMany({
      where,
      orderBy,
      include: {
        category: true,
        collections: true,
        variants: true,
      },
    });
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
    const { collectionIds, ...rest } = data;
    const updateData: any = { ...rest };

    if (collectionIds) {
      updateData.collections = {
        set: collectionIds.map((id: string) => ({ id })),
      };
    }

    return this.prisma.product.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string): Promise<Product> {
    return this.prisma.product.delete({ where: { id } });
  }
}
