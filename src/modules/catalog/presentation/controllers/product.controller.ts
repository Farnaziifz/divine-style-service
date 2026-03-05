import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CreateProductDto } from '../dtos/create-product.dto';
import { UpdateProductDto } from '../dtos/update-product.dto';
import { ProductFilterDto } from '../dtos/product-filter.dto';
import { CreateProductCommand } from '../../application/commands/create-product.command';
import { UpdateProductCommand } from '../../application/commands/update-product.command';
import { DeleteProductCommand } from '../../application/commands/delete-product.command';
import { GetProductsQuery } from '../../application/queries/get-products.query';
import { GetProductQuery } from '../../application/queries/get-product.query';
import { MinioService } from '../../../shared/minio/minio.service';

@ApiTags('Products')
@Controller('products')
export class ProductController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly minioService: MinioService,
  ) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create product' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('images'))
  async create(
    @Body() createProductDto: CreateProductDto,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    const images: string[] = [];
    if (files && files.length > 0) {
      for (const file of files) {
        const url = await this.minioService.uploadFile(file, 'products');
        images.push(url);
      }
    }
    return this.commandBus.execute(
      new CreateProductCommand(createProductDto, images),
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all products' })
  findAll(@Query() filter: ProductFilterDto) {
    return this.queryBus.execute(new GetProductsQuery(filter));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by id' })
  findOne(@Param('id') id: string) {
    return this.queryBus.execute(new GetProductQuery(id));
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('images'))
  async update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    const images: string[] = [];
    if (files && files.length > 0) {
      for (const file of files) {
        const url = await this.minioService.uploadFile(file, 'products');
        images.push(url);
      }
    }
    return this.commandBus.execute(
      new UpdateProductCommand(
        id,
        updateProductDto,
        images.length > 0 ? images : undefined,
      ),
    );
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete product' })
  remove(@Param('id') id: string) {
    return this.commandBus.execute(new DeleteProductCommand(id));
  }
}
