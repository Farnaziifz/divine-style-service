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
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
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

  private assertCanWrite(req: any) {
    const isAdmin = req.user?.role === 'ADMIN';
    const isOperatorWithPermission =
      req.user?.role === 'OPERATOR' &&
      Array.isArray(req.user?.permissions) &&
      req.user.permissions.includes('PRODUCTS_WRITE');
    if (!isAdmin && !isOperatorWithPermission) {
      throw new ForbiddenException();
    }
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create product' })
  async create(@Req() req: any, @Body() createProductDto: CreateProductDto) {
    this.assertCanWrite(req);
    return this.commandBus.execute(
      new CreateProductCommand(createProductDto, createProductDto.images),
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
  async update(
    @Param('id') id: string,
    @Req() req: any,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    this.assertCanWrite(req);
    return this.commandBus.execute(
      new UpdateProductCommand(id, updateProductDto, updateProductDto.images),
    );
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete product' })
  remove(@Param('id') id: string, @Req() req: any) {
    this.assertCanWrite(req);
    return this.commandBus.execute(new DeleteProductCommand(id));
  }
}
