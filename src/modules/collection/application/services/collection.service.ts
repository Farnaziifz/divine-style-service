import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { MinioService } from '../../../shared/minio/minio.service';
import { CreateCollectionDto } from '../../presentation/dtos/create-collection.dto';
import { UpdateCollectionDto } from '../../presentation/dtos/update-collection.dto';
import slugify from 'slugify';

@Injectable()
export class CollectionService {
  constructor(
    private prisma: PrismaService,
    private minioService: MinioService,
  ) {}

  async create(createCollectionDto: CreateCollectionDto, file?: Express.Multer.File) {
    const slug = slugify(createCollectionDto.title, { lower: true });
    
    let imageUrl: string | undefined;
    if (file) {
      imageUrl = await this.minioService.uploadFile(file, 'collections');
    }

    return this.prisma.collection.create({
      data: {
        ...createCollectionDto,
        isActive: createCollectionDto.isActive !== undefined ? String(createCollectionDto.isActive) === 'true' : true,
        slug,
        image: imageUrl,
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

  async update(id: string, updateCollectionDto: UpdateCollectionDto, file?: Express.Multer.File) {
    const collection = await this.findOne(id);
    
    let imageUrl = collection.image;
    if (file) {
      imageUrl = await this.minioService.uploadFile(file, 'collections');
    }
    
    const slug = updateCollectionDto.title 
      ? slugify(updateCollectionDto.title, { lower: true }) 
      : collection.slug;

    return this.prisma.collection.update({
      where: { id },
      data: {
        ...updateCollectionDto,
        isActive: updateCollectionDto.isActive !== undefined ? String(updateCollectionDto.isActive) === 'true' : collection.isActive,
        slug,
        image: imageUrl,
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
