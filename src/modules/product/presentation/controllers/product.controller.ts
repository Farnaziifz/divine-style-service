import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { ProductService } from '../../application/services/product.service';
import { CreateProductDto } from '../dtos/create-product.dto';
import { CreateProductVariantDto } from '../dtos/create-product-variant.dto';
import { ProductFilterDto } from '../dtos/product-filter.dto';

@ApiTags('Products')
@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('images'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        categoryId: { type: 'string' },
        'collectionIds[]': {
          type: 'array',
          items: { type: 'string' },
        },
        specifications: { type: 'string', description: 'JSON string' },
        metaTitle: { type: 'string' },
        metaDescription: { type: 'string' },
        images: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    },
  })
  create(
    @Body() createProductDto: CreateProductDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.productService.create(createProductDto, files);
  }

  @Post(':id/variants')
  @UseInterceptors(FilesInterceptor('images'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sku: { type: 'string' },
        size: { type: 'string' },
        color: { type: 'string' },
        colorCode: { type: 'string' },
        price: { type: 'number' },
        discountPrice: { type: 'number' },
        stock: { type: 'number' },
        images: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    },
  })
  addVariant(
    @Param('id') id: string,
    @Body() variantDto: CreateProductVariantDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.productService.addVariant(id, variantDto, files);
  }

  @Get()
  findAll(@Query() filter: ProductFilterDto) {
    return this.productService.findAll(filter);
  }

  @Get(':slug')
  findOne(@Param('slug') slug: string) {
    return this.productService.findOne(slug);
  }
}
