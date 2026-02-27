import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { MinioService } from '../../../shared/minio/minio.service';
import { CreateProductDto } from '../../presentation/dtos/create-product.dto';
import { CreateProductVariantDto } from '../../presentation/dtos/create-product-variant.dto';
import { ProductFilterDto } from '../../presentation/dtos/product-filter.dto';
import slugify from 'slugify';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProductService {
  constructor(
    private prisma: PrismaService,
    private minioService: MinioService,
  ) {}

  async create(
    createProductDto: CreateProductDto,
    files: Express.Multer.File[],
  ) {
    const slug = slugify(createProductDto.title, { lower: true });

    // Upload images
    const imageUrls: string[] = [];
    if (files && files.length > 0) {
      for (const file of files) {
        const url = await this.minioService.uploadFile(file, 'products');
        imageUrls.push(url);
      }
    }

    // Prepare collections connection
    const collections =
      createProductDto.collectionIds?.map((id) => ({ id })) || [];

    // Parse specifications if string (from multipart form)
    let specs = createProductDto.specifications;
    if (typeof specs === 'string') {
      try {
        specs = JSON.parse(specs);
      } catch (e) {
        // keep as string or ignore
      }
    }

    return this.prisma.product.create({
      data: {
        title: createProductDto.title,
        description: createProductDto.description,
        slug,
        categoryId: createProductDto.categoryId,
        specifications: specs || Prisma.JsonNull,
        images: imageUrls,
        collections: {
          connect: collections,
        },
        metaTitle: createProductDto.metaTitle,
        metaDescription: createProductDto.metaDescription,
      },
      include: {
        variants: true,
        category: true,
        collections: true,
      },
    });
  }

  async addVariant(
    productId: string,
    variantDto: CreateProductVariantDto,
    files: Express.Multer.File[],
  ) {
    // Verify product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Product not found');

    const imageUrls: string[] = [];
    if (files && files.length > 0) {
      for (const file of files) {
        const url = await this.minioService.uploadFile(file, 'variants');
        imageUrls.push(url);
      }
    }

    return this.prisma.productVariant.create({
      data: {
        productId,
        sku: variantDto.sku,
        size: variantDto.size,
        color: variantDto.color,
        colorCode: variantDto.colorCode,
        price: variantDto.price,
        discountPrice: variantDto.discountPrice,
        stock: variantDto.stock,
        images: imageUrls,
      },
    });
  }

  async findAll(filter: ProductFilterDto) {
    const where: Prisma.ProductWhereInput = {
      isActive: true,
    };

    if (filter.search) {
      where.OR = [
        { title: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    if (filter.categoryId) {
      where.categoryId = filter.categoryId;
    }

    if (filter.collectionId) {
      where.collections = {
        some: {
          id: filter.collectionId,
        },
      };
    }

    if (filter.minPrice !== undefined || filter.maxPrice !== undefined) {
      where.variants = {
        some: {
          price: {
            gte: filter.minPrice,
            lte: filter.maxPrice,
          },
        },
      };
    }

    const orderBy: Prisma.ProductOrderByWithRelationInput = {};
    switch (filter.sort) {
      case 'price_asc':
        // Sort by lowest variant price? Complex in Prisma without aggregate.
        // Simplification: sort by createdAt for now or raw query.
        // Prisma doesn't support easy sorting by related field aggregate yet.
        orderBy.createdAt = 'desc';
        break;
      case 'price_desc':
        orderBy.createdAt = 'desc';
        break;
      case 'sold':
        orderBy.soldCount = 'desc';
        break;
      case 'newest':
      default:
        orderBy.createdAt = 'desc';
        break;
    }

    return this.prisma.product.findMany({
      where,
      orderBy,
      include: {
        category: true,
        variants: true, // Include variants to show price
      },
    });
  }

  async findOne(slug: string) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: {
        category: true,
        collections: true,
        variants: true,
        reviews: {
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!product) throw new NotFoundException('Product not found');
    return product;
  }
}
