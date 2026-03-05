import { Injectable } from '@nestjs/common';
import { ICategoryRepository } from '../../domain/repositories/category.repository.interface';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { Category } from '@prisma/client';
import { CreateCategoryDto } from '../../presentation/dtos/create-category.dto';
import { UpdateCategoryDto } from '../../presentation/dtos/update-category.dto';

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

  async findAll(): Promise<Category[]> {
    return this.prisma.category.findMany({ include: { children: true } });
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
