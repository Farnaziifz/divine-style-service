import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';

@ApiTags('Admin Reports')
@Controller('admin/reports/sales')
export class AdminSalesReportController {
  constructor(private readonly prisma: PrismaService) {}

  private assertCanView(req: any) {
    const isAdmin = req.user?.role === 'ADMIN';
    const isOperatorWithPermission =
      req.user?.role === 'OPERATOR' &&
      Array.isArray(req.user?.permissions) &&
      req.user.permissions.includes('REPORTS_VIEW');
    if (!isAdmin && !isOperatorWithPermission) {
      throw new ForbiddenException();
    }
  }

  private parseDate(value?: string): Date | null {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  private getRange(from?: string, to?: string) {
    const parsedFrom = this.parseDate(from);
    const parsedTo = this.parseDate(to);
    const end = parsedTo ?? new Date();
    const start =
      parsedFrom ?? new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (start.getTime() > end.getTime()) {
      throw new BadRequestException('بازه زمانی نامعتبر است');
    }
    return { start, end };
  }

  private money(value: any): string {
    if (value == null) return '0';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'bigint') return value.toString();
    if (value && typeof value.toString === 'function') return value.toString();
    return String(value);
  }

  @Get('summary')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'خلاصه گزارش فروش' })
  async summary(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    this.assertCanView(req);
    const { start, end } = this.getRange(from, to);

    const where = {
      isDeleted: false,
      paymentStatus: 'PAID' as const,
      paidAt: { gte: start, lte: end },
    };

    const orderAgg = await this.prisma.order.aggregate({
      where,
      _count: { id: true },
      _sum: {
        totalAmount: true,
        discountAmount: true,
        shippingCost: true,
        payableAmount: true,
      },
    });

    const itemAgg = await this.prisma.orderItem.aggregate({
      where: {
        isDeleted: false,
        order: where,
      },
      _sum: { quantity: true },
      _count: { id: true },
    });

    const ordersCount = orderAgg._count.id ?? 0;
    const payable = orderAgg._sum.payableAmount ?? new Prisma.Decimal(0);
    const averageOrderValue =
      ordersCount > 0 ? payable.div(ordersCount) : new Prisma.Decimal(0);

    return {
      range: { from: start.toISOString(), to: end.toISOString() },
      ordersCount,
      itemsCount: itemAgg._sum.quantity ?? 0,
      orderItemsCount: itemAgg._count.id ?? 0,
      totalAmount: this.money(orderAgg._sum.totalAmount),
      discountAmount: this.money(orderAgg._sum.discountAmount),
      shippingCost: this.money(orderAgg._sum.shippingCost),
      payableAmount: this.money(orderAgg._sum.payableAmount),
      averageOrderValue: this.money(averageOrderValue),
    };
  }

  @Get('daily')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'گزارش فروش روزانه' })
  async daily(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('timezone') timezone?: string,
  ) {
    this.assertCanView(req);
    const { start, end } = this.getRange(from, to);
    const tz = (timezone || 'Asia/Tehran').trim() || 'Asia/Tehran';

    const rows = await this.prisma.$queryRaw<
      Array<{
        day: string;
        orders_count: bigint;
        payable_amount: Prisma.Decimal;
      }>
    >(Prisma.sql`
      SELECT
        to_char(date_trunc('day', ("paidAt" AT TIME ZONE ${tz})), 'YYYY-MM-DD') AS day,
        COUNT(*)::bigint AS orders_count,
        COALESCE(SUM("payableAmount"), 0)::numeric AS payable_amount
      FROM "Order"
      WHERE
        "isDeleted" = false
        AND "paymentStatus" = 'PAID'
        AND "paidAt" IS NOT NULL
        AND "paidAt" >= ${start}
        AND "paidAt" <= ${end}
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    return {
      range: { from: start.toISOString(), to: end.toISOString() },
      timezone: tz,
      data: rows.map((r) => ({
        day: r.day,
        ordersCount: Number(r.orders_count),
        payableAmount: this.money(r.payable_amount),
      })),
    };
  }

  @Get('top-products')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'پرفروش‌ترین محصولات' })
  async topProducts(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    this.assertCanView(req);
    const { start, end } = this.getRange(from, to);
    const take = Math.min(Math.max(Number(limit || 10), 1), 100);

    const rows = await this.prisma.$queryRaw<
      Array<{
        product_id: string;
        title: string;
        quantity: bigint;
        revenue: Prisma.Decimal;
        orders_count: bigint;
      }>
    >(Prisma.sql`
      SELECT
        oi."productId" AS product_id,
        MAX(oi."title") AS title,
        COALESCE(SUM(oi."quantity"), 0)::bigint AS quantity,
        COALESCE(SUM((COALESCE(oi."unitDiscountPrice", oi."unitPrice")) * oi."quantity"), 0)::numeric AS revenue,
        COUNT(DISTINCT oi."orderId")::bigint AS orders_count
      FROM "OrderItem" oi
      INNER JOIN "Order" o ON o.id = oi."orderId"
      WHERE
        oi."isDeleted" = false
        AND o."isDeleted" = false
        AND o."paymentStatus" = 'PAID'
        AND o."paidAt" IS NOT NULL
        AND o."paidAt" >= ${start}
        AND o."paidAt" <= ${end}
      GROUP BY oi."productId"
      ORDER BY revenue DESC
      LIMIT ${take}
    `);

    return {
      range: { from: start.toISOString(), to: end.toISOString() },
      limit: take,
      data: rows.map((r) => ({
        productId: r.product_id,
        title: r.title,
        quantity: Number(r.quantity),
        ordersCount: Number(r.orders_count),
        revenue: this.money(r.revenue),
      })),
    };
  }
}
