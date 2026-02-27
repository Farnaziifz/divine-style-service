import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { MinioService } from '../../../shared/minio/minio.service';
import { CreateCategoryDto } from '../../presentation/dtos/create-category.dto';
import { UpdateCategoryDto } from '../../presentation/dtos/update-category.dto';
import slugify from 'slugify';

@Injectable()
export class CategoryService {
  constructor(
    private prisma: PrismaService,
    private minioService: MinioService,
  ) {}

  async create(createCategoryDto: CreateCategoryDto, file?: Express.Multer.File) {
    const slug = slugify(createCategoryDto.title, { lower: true });
    
    let imageUrl: string | undefined;
    if (file) {
      imageUrl = await this.minioService.uploadFile(file, 'categories');
    }

    return this.prisma.category.create({
      data: {
        ...createCategoryDto,
        slug,
        image: imageUrl,
      },
    });
  }

  async findAll() {
    return this.prisma.category.findMany({
      include: {
        children: true,
      },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        children: true,
        parent: true,
      },
    });
    
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    
    return category;
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto, file?: Express.Multer.File) {
    const category = await this.findOne(id);
    
    let imageUrl = category.image;
    if (file) {
      imageUrl = await this.minioService.uploadFile(file, 'categories');
    }
    
    const slug = updateCategoryDto.title 
      ? slugify(updateCategoryDto.title, { lower: true }) 
      : category.slug;

    return this.prisma.category.update({
      where: { id },
      data: {
        ...updateCategoryDto,
        slug,
        image: imageUrl,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.category.delete({
      where: { id },
    });
  }
}
