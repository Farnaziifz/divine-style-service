import { Injectable } from '@nestjs/common';
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

  async create(data: CreateCategoryDto & { slug: string }): Promise<Category> {
    return this.prisma.category.create({
      data: {
        title: data.title,
        description: data.description,
        slug: data.slug,
        image: data.image,
        parentId: data.parentId,
      },
    });
  }

  async findAll(
    pagination?: PaginationDto,
  ): Promise<PaginatedResult<Category>> {
    const page = Number(pagination?.page) || 1;
    const limit = Number(pagination?.limit) || 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.category.findMany({
        skip,
        take: limit,
        include: { children: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.category.count(),
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
    return this.prisma.category.findUnique({
      where: { id },
      include: { children: true },
    });
  }

  async update(
    id: string,
    data: UpdateCategoryDto & { slug: string },
  ): Promise<Category> {
    return this.prisma.category.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        slug: data.slug,
        image: data.image,
        parentId: data.parentId,
      },
    });
  }

  async remove(id: string): Promise<Category> {
    return this.prisma.category.delete({ where: { id } });
  }
}
