import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../shared/prisma/prisma.service';
import { CreateShippingMethodDto } from './dtos/create-shipping-method.dto';
import { UpdateShippingMethodDto } from './dtos/update-shipping-method.dto';

@ApiTags('Shipping methods')
@Controller('shipping-methods')
export class ShippingMethodController {
  constructor(private readonly prisma: PrismaService) {}

  private assertCanManage(req: any) {
    const isAdmin = req.user?.role === 'ADMIN';
    const isOperatorWithPermission =
      req.user?.role === 'OPERATOR' &&
      Array.isArray(req.user?.permissions) &&
      req.user.permissions.includes('SITE_SETTINGS_MANAGE');
    if (!isAdmin && !isOperatorWithPermission) {
      throw new ForbiddenException();
    }
  }

  @Get()
  @ApiOperation({ summary: 'لیست روش‌های ارسال' })
  async findAll() {
    return this.prisma.shippingMethod.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        price: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'افزودن روش ارسال' })
  async create(@Req() req: any, @Body() dto: CreateShippingMethodDto) {
    this.assertCanManage(req);
    return this.prisma.shippingMethod.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        price: dto.price ?? null,
        isActive: true,
      },
      select: {
        id: true,
        title: true,
        description: true,
        price: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'ویرایش روش ارسال' })
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateShippingMethodDto,
  ) {
    this.assertCanManage(req);
    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined)
      data.description = dto.description?.trim() || null;
    if (dto.price !== undefined) data.price = dto.price ?? null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.prisma.shippingMethod.update({
      where: { id },
      data,
      select: {
        id: true,
        title: true,
        description: true,
        price: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  @Patch(':id/toggle')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تغییر وضعیت فعال/غیرفعال' })
  async toggle(@Req() req: any, @Param('id') id: string) {
    this.assertCanManage(req);
    const current = await this.prisma.shippingMethod.findUnique({
      where: { id },
      select: { isActive: true },
    });
    const next = !current?.isActive;
    return this.prisma.shippingMethod.update({
      where: { id },
      data: { isActive: next },
      select: {
        id: true,
        title: true,
        description: true,
        price: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  @Patch(':id/delete')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'حذف نرم روش ارسال' })
  async softDelete(@Req() req: any, @Param('id') id: string) {
    this.assertCanManage(req);
    return this.prisma.shippingMethod.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
      select: {
        id: true,
        title: true,
        description: true,
        price: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
