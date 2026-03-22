import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import { PaginationDto } from '../shared/dtos/pagination.dto';
import { UpdateOrderStatusDto } from './dtos/update-order-status.dto';

@ApiTags('Orders')
@Controller('orders')
export class OrderController {
  constructor(private readonly prisma: PrismaService) {}

  private toNumber(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    }
    if (value && typeof value.toNumber === 'function') {
      const n = value.toNumber();
      return Number.isFinite(n) ? n : 0;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all orders' })
  async findAll(
    @Req() req: any,
    @Query() pagination: PaginationDto,
    @Query('q') q?: string,
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: any = { isDeleted: false };
    if (req.user?.role !== 'ADMIN') {
      where.userId = req.user.id;
    }
    const query = (q ?? '').trim();
    if (query) {
      where.OR = [
        { orderCode: { contains: query, mode: 'insensitive' } },
        { orderCode: { endsWith: query, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              mobile: true,
              name: true,
              lastName: true,
            },
          },
          items: {
            where: { isDeleted: false },
            select: {
              id: true,
              productId: true,
              productVariantId: true,
              sku: true,
              title: true,
              quantity: true,
              unitPrice: true,
              unitDiscountPrice: true,
              createdAt: true,
            },
          },
          payments: {
            where: { isDeleted: false },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              provider: true,
              status: true,
              amount: true,
              authority: true,
              refId: true,
              createdAt: true,
              verifiedAt: true,
            },
          },
        },
      }),
    ]);

    return {
      data: data.map((o) => ({
        id: o.id,
        orderCode: o.orderCode,
        paymentStatus: o.paymentStatus,
        orderStatus: o.orderStatus,
        totalAmount: this.toNumber(o.totalAmount),
        discountCode: o.discountCode,
        discountAmount: this.toNumber(o.discountAmount),
        shippingCost: this.toNumber(o.shippingCost),
        payableAmount: this.toNumber(o.payableAmount),
        shippingAddress: o.shippingAddress,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        user: o.user,
        items: o.items.map((it) => ({
          id: it.id,
          productId: it.productId,
          productVariantId: it.productVariantId,
          sku: it.sku,
          title: it.title,
          quantity: it.quantity,
          unitPrice: this.toNumber(it.unitPrice),
          unitDiscountPrice:
            it.unitDiscountPrice != null
              ? this.toNumber(it.unitDiscountPrice)
              : null,
          createdAt: it.createdAt,
        })),
        payment: o.payments[0]
          ? {
              ...o.payments[0],
              amount: this.toNumber(o.payments[0].amount),
            }
          : null,
      })),
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  @Get(':orderCode')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get order details by order code' })
  async findOneByCode(@Req() req: any, @Param('orderCode') orderCode: string) {
    const where: any = { isDeleted: false, orderCode };
    if (req.user?.role !== 'ADMIN') {
      where.userId = req.user.id;
    }

    const order = await this.prisma.order.findFirst({
      where,
      include: {
        user: {
          select: {
            id: true,
            mobile: true,
            name: true,
            lastName: true,
          },
        },
        items: {
          where: { isDeleted: false },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            productId: true,
            productVariantId: true,
            sku: true,
            title: true,
            quantity: true,
            unitPrice: true,
            unitDiscountPrice: true,
            createdAt: true,
            productVariant: {
              select: {
                images: true,
                product: {
                  select: {
                    images: true,
                  },
                },
              },
            },
          },
        },
        payments: {
          where: { isDeleted: false },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            provider: true,
            status: true,
            amount: true,
            authority: true,
            refId: true,
            createdAt: true,
            verifiedAt: true,
          },
        },
      },
    });

    if (!order) {
      return null;
    }

    return {
      id: order.id,
      orderCode: order.orderCode,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      totalAmount: this.toNumber(order.totalAmount),
      discountCode: order.discountCode,
      discountAmount: this.toNumber(order.discountAmount),
      shippingCost: this.toNumber(order.shippingCost),
      payableAmount: this.toNumber(order.payableAmount),
      shippingAddress: order.shippingAddress,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      paidAt: order.paidAt,
      user: order.user,
      items: order.items.map((it) => ({
        id: it.id,
        productId: it.productId,
        productVariantId: it.productVariantId,
        sku: it.sku,
        title: it.title,
        quantity: it.quantity,
        unitPrice: this.toNumber(it.unitPrice),
        unitDiscountPrice:
          it.unitDiscountPrice != null
            ? this.toNumber(it.unitDiscountPrice)
            : null,
        imageUrl:
          it.productVariant?.images?.[0] ??
          it.productVariant?.product?.images?.[0] ??
          null,
        createdAt: it.createdAt,
      })),
      payments: order.payments.map((p) => ({
        ...p,
        amount: this.toNumber(p.amount),
      })),
    };
  }

  @Patch(':orderCode/status')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: update order status' })
  async updateStatus(
    @Req() req: any,
    @Param('orderCode') orderCode: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    if (req.user?.role !== 'ADMIN') {
      throw new BadRequestException('Forbidden');
    }

    const order = await this.prisma.order.findFirst({
      where: { isDeleted: false, orderCode },
      select: { id: true, paymentStatus: true, orderStatus: true },
    });
    if (!order) {
      throw new BadRequestException('Order not found');
    }

    if (dto.status === OrderStatus.PAID && order.paymentStatus !== 'PAID') {
      throw new BadRequestException('Cannot set PAID when payment is not PAID');
    }

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: { orderStatus: dto.status },
      select: { orderCode: true, orderStatus: true },
    });

    return updated;
  }
}
