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
import { Request } from 'express';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { CreateProductDto } from '../dtos/create-product.dto';
import { UpdateProductDto } from '../dtos/update-product.dto';
import { ProductFilterDto } from '../dtos/product-filter.dto';
import { CreateProductCommand } from '../../application/commands/create-product.command';
import { UpdateProductCommand } from '../../application/commands/update-product.command';
import { DeleteProductCommand } from '../../application/commands/delete-product.command';
import { GetProductsQuery } from '../../application/queries/get-products.query';
import { GetProductQuery } from '../../application/queries/get-product.query';
import { MinioService } from '../../../shared/minio/minio.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@ApiTags('Products')
@Controller('products')
export class ProductController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly minioService: MinioService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
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

  // این روت‌ها public هستن (بدون گارد) تا فروشگاه بدون لاگین کار کنه؛
  // ولی اگه توکن معتبر ادمین/اپراتور بود، محصولات غیرفعال هم دیده بشن (برای مدیریت)
  private async isStaffRequest(req: Request): Promise<boolean> {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) return false;
    const token = authHeader.slice(7);
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: 'secretKey', // TODO: Use env variable
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      return user?.role === 'ADMIN' || user?.role === 'OPERATOR';
    } catch {
      return false;
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
  async findAll(@Query() filter: ProductFilterDto, @Req() req: Request) {
    const includeInactive = await this.isStaffRequest(req);
    return this.queryBus.execute(new GetProductsQuery(filter, includeInactive));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by id' })
  async findOne(@Param('id') id: string, @Req() req: Request) {
    const includeInactive = await this.isStaffRequest(req);
    return this.queryBus.execute(new GetProductQuery(id, includeInactive));
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
