import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { PaginationDto } from '../shared/dtos/pagination.dto';
import { CreateOfflineSaleDto } from './dtos/create-offline-sale.dto';
import { OfflineSaleService } from './offline-sale.service';

@ApiTags('Admin Offline Sales')
@Controller('admin/offline-sales')
export class OfflineSaleController {
  constructor(private readonly offlineSaleService: OfflineSaleService) {}

  private hasPermission(user: any, permission: string) {
    return (
      Array.isArray(user?.permissions) && user.permissions.includes(permission)
    );
  }

  private canRead(user: any) {
    return (
      user?.role === 'ADMIN' ||
      (user?.role === 'OPERATOR' && this.hasPermission(user, 'OFFLINE_SALES_READ')) ||
      (user?.role === 'OPERATOR' && this.hasPermission(user, 'OFFLINE_SALES_WRITE'))
    );
  }

  private canWrite(user: any) {
    return (
      user?.role === 'ADMIN' ||
      (user?.role === 'OPERATOR' && this.hasPermission(user, 'OFFLINE_SALES_WRITE'))
    );
  }

  private parseDate(value?: string): Date | undefined {
    if (!value) return undefined;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a manual offline sale (Instagram / in-person / event)' })
  async create(@Req() req: any, @Body() dto: CreateOfflineSaleDto) {
    if (!this.canWrite(req.user)) {
      throw new ForbiddenException();
    }
    return this.offlineSaleService.create(dto, req.user?.id);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List offline sales' })
  async findAll(
    @Req() req: any,
    @Query() pagination: PaginationDto,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!this.canRead(req.user)) {
      throw new ForbiddenException();
    }
    return this.offlineSaleService.findAll({
      page: pagination.page ?? 1,
      limit: pagination.limit ?? 10,
      search: pagination.search,
      from: this.parseDate(from),
      to: this.parseDate(to),
    });
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get offline sale details' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    if (!this.canRead(req.user)) {
      throw new ForbiddenException();
    }
    const sale = await this.offlineSaleService.findOne(id);
    if (!sale) {
      throw new BadRequestException('فروش پیدا نشد');
    }
    return sale;
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete offline sale and restock its items' })
  async remove(@Req() req: any, @Param('id') id: string) {
    if (!this.canWrite(req.user)) {
      throw new ForbiddenException();
    }
    return this.offlineSaleService.remove(id);
  }
}
