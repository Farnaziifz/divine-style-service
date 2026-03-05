import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { CreateCollectionDto } from '../../presentation/dtos/create-collection.dto';
import { UpdateCollectionDto } from '../../presentation/dtos/update-collection.dto';
import slugify from 'slugify';

@Injectable()
export class CollectionService {
  constructor(private prisma: PrismaService) {}

  async create(createCollectionDto: CreateCollectionDto) {
    const slug = slugify(createCollectionDto.title, { lower: true });

    return this.prisma.collection.create({
      data: {
        title: createCollectionDto.title,
        description: createCollectionDto.description,
        isActive: createCollectionDto.isActive ?? true,
        slug,
        image: createCollectionDto.image,
      },
    });
  }

  async findAll() {
    return this.prisma.collection.findMany();
  }

  async findOne(id: string) {
    const collection = await this.prisma.collection.findUnique({
      where: { id },
    });

    if (!collection) {
      throw new NotFoundException(`Collection with ID ${id} not found`);
    }

    return collection;
  }

  async update(id: string, updateCollectionDto: UpdateCollectionDto) {
    const collection = await this.findOne(id);

    const slug = updateCollectionDto.title
      ? slugify(updateCollectionDto.title, { lower: true })
      : collection.slug;

    return this.prisma.collection.update({
      where: { id },
      data: {
        title: updateCollectionDto.title,
        description: updateCollectionDto.description,
        isActive: updateCollectionDto.isActive,
        slug,
        image: updateCollectionDto.image,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.collection.delete({
      where: { id },
    });
  }
}
