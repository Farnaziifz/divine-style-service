import { Injectable } from '@nestjs/common';
import { ICollectionRepository } from '../../domain/repositories/collection.repository.interface';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { Collection } from '@prisma/client';
import { CreateCollectionDto } from '../../presentation/dtos/create-collection.dto';
import { UpdateCollectionDto } from '../../presentation/dtos/update-collection.dto';
import { PaginationDto } from '../../../shared/dtos/pagination.dto';
import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface';

@Injectable()
export class PrismaCollectionRepository implements ICollectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: CreateCollectionDto & { slug: string; image?: string },
  ): Promise<Collection> {
    return this.prisma.collection.create({
      data: {
        title: data.title,
        description: data.description,
        isActive: data.isActive ?? true,
        slug: data.slug,
        image: data.image,
      },
    });
  }

  async findAll(
    pagination?: PaginationDto,
  ): Promise<PaginatedResult<Collection>> {
    const page = Number(pagination?.page) || 1;
    const limit = Number(pagination?.limit) || 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.collection.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.collection.count(),
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

  async findById(id: string): Promise<Collection | null> {
    return this.prisma.collection.findUnique({ where: { id } });
  }

  async update(
    id: string,
    data: UpdateCollectionDto & { slug: string; image?: string },
  ): Promise<Collection> {
    return this.prisma.collection.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        isActive: data.isActive,
        slug: data.slug,
        image: data.image,
      },
    });
  }

  async remove(id: string): Promise<Collection> {
    return this.prisma.collection.delete({ where: { id } });
  }
}
