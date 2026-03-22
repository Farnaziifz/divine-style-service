import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../shared/prisma/prisma.service';
import { PaginationDto } from '../shared/dtos/pagination.dto';

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
  async findAll(@Req() req: any, @Query() pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: any = { isDeleted: false };
    if (req.user?.role !== 'ADMIN') {
      where.userId = req.user.id;
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
}
