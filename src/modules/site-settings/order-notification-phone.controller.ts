import {
  Body,
  ConflictException,
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
import { CreateOrderNotificationPhoneDto } from './dtos/create-order-notification-phone.dto';
import { UpdateOrderNotificationPhoneDto } from './dtos/update-order-notification-phone.dto';

@ApiTags('Order notification phones')
@Controller('order-notification-phones')
export class OrderNotificationPhoneController {
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

  private readonly selectFields = {
    id: true,
    phoneNumber: true,
    label: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
  };

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'لیست شماره‌های اطلاع‌رسانی سفارش' })
  async findAll(@Req() req: any) {
    this.assertCanManage(req);
    return this.prisma.orderNotificationPhone.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
      select: this.selectFields,
    });
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'افزودن شماره اطلاع‌رسانی سفارش' })
  async create(@Req() req: any, @Body() dto: CreateOrderNotificationPhoneDto) {
    this.assertCanManage(req);

    const existing = await this.prisma.orderNotificationPhone.findFirst({
      where: { phoneNumber: dto.phoneNumber, isDeleted: false },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('این شماره قبلاً ثبت شده است');
    }

    return this.prisma.orderNotificationPhone.create({
      data: {
        phoneNumber: dto.phoneNumber,
        label: dto.label?.trim() || null,
        isActive: true,
      },
      select: this.selectFields,
    });
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'ویرایش شماره اطلاع‌رسانی سفارش' })
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateOrderNotificationPhoneDto,
  ) {
    this.assertCanManage(req);

    if (dto.phoneNumber !== undefined) {
      const existing = await this.prisma.orderNotificationPhone.findFirst({
        where: {
          phoneNumber: dto.phoneNumber,
          isDeleted: false,
          NOT: { id },
        },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('این شماره قبلاً ثبت شده است');
      }
    }

    const data: any = {};
    if (dto.phoneNumber !== undefined) data.phoneNumber = dto.phoneNumber;
    if (dto.label !== undefined) data.label = dto.label?.trim() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return this.prisma.orderNotificationPhone.update({
      where: { id },
      data,
      select: this.selectFields,
    });
  }

  @Patch(':id/toggle')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تغییر وضعیت فعال/غیرفعال' })
  async toggle(@Req() req: any, @Param('id') id: string) {
    this.assertCanManage(req);
    const current = await this.prisma.orderNotificationPhone.findUnique({
      where: { id },
      select: { isActive: true },
    });
    const next = !current?.isActive;
    return this.prisma.orderNotificationPhone.update({
      where: { id },
      data: { isActive: next },
      select: this.selectFields,
    });
  }

  @Patch(':id/delete')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'حذف شماره اطلاع‌رسانی سفارش' })
  async softDelete(@Req() req: any, @Param('id') id: string) {
    this.assertCanManage(req);
    return this.prisma.orderNotificationPhone.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
      select: this.selectFields,
    });
  }
}
