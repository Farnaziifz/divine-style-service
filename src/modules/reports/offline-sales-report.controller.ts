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
import { toJalaali, toGregorian, jalaaliMonthLength } from 'jalaali-js';
import { PrismaService } from '../shared/prisma/prisma.service';

const JALALI_MONTH_NAMES = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

@ApiTags('Admin Reports')
@Controller('admin/reports/offline-sales')
export class AdminOfflineSalesReportController {
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

  /** بازهٔ [start, end) میلادی معادل یک ماه شمسی، بر اساس نیمهٔ شب تهران (UTC+03:30). */
  private jalaaliMonthRange(jy: number, jm: number) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const startG = toGregorian(jy, jm, 1);
    const nextJy = jm === 12 ? jy + 1 : jy;
    const nextJm = jm === 12 ? 1 : jm + 1;
    const endG = toGregorian(nextJy, nextJm, 1);
    const start = new Date(
      `${startG.gy}-${pad(startG.gm)}-${pad(startG.gd)}T00:00:00+03:30`,
    );
    const end = new Date(
      `${endG.gy}-${pad(endG.gm)}-${pad(endG.gd)}T00:00:00+03:30`,
    );
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
  @ApiOperation({ summary: 'خلاصه فروش دستی (حضوری/اینستا)' })
  async summary(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    this.assertCanView(req);
    const { start, end } = this.getRange(from, to);

    const agg = await this.prisma.offlineSale.aggregate({
      where: { isDeleted: false, soldAt: { gte: start, lte: end } },
      _count: { id: true },
      _sum: {
        totalAmount: true,
        discountAmount: true,
        commissionAmount: true,
        payableAmount: true,
        netAmount: true,
        costOfGoods: true,
      },
    });

    const netAmount = Number(agg._sum.netAmount ?? 0);
    const costOfGoods = Number(agg._sum.costOfGoods ?? 0);

    return {
      range: { from: start.toISOString(), to: end.toISOString() },
      salesCount: agg._count.id ?? 0,
      totalAmount: this.money(agg._sum.totalAmount),
      discountAmount: this.money(agg._sum.discountAmount),
      commissionAmount: this.money(agg._sum.commissionAmount),
      payableAmount: this.money(agg._sum.payableAmount),
      netAmount: this.money(agg._sum.netAmount),
      costOfGoods: this.money(agg._sum.costOfGoods),
      netProfit: this.money(netAmount - costOfGoods),
    };
  }

  @Get('by-channel')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'فروش دستی به تفکیک محل فروش' })
  async byChannel(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    this.assertCanView(req);
    const { start, end } = this.getRange(from, to);

    const rows = await this.prisma.offlineSale.groupBy({
      by: ['channel'],
      where: { isDeleted: false, soldAt: { gte: start, lte: end } },
      _count: { id: true },
      _sum: { totalAmount: true, netAmount: true, costOfGoods: true },
      orderBy: { _sum: { totalAmount: 'desc' } },
    });

    return {
      range: { from: start.toISOString(), to: end.toISOString() },
      data: rows.map((r) => {
        const netAmount = Number(r._sum.netAmount ?? 0);
        const costOfGoods = Number(r._sum.costOfGoods ?? 0);
        return {
          channel: r.channel,
          salesCount: r._count.id,
          totalAmount: this.money(r._sum.totalAmount),
          netAmount: this.money(r._sum.netAmount),
          netProfit: this.money(netAmount - costOfGoods),
        };
      }),
    };
  }

  @Get('daily-jalali')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'فروش دستی روزانه در یک ماه شمسی' })
  async dailyJalali(
    @Req() req: any,
    @Query('year') yearParam?: string,
    @Query('month') monthParam?: string,
  ) {
    this.assertCanView(req);
    const nowJalali = toJalaali(new Date());
    const jy = yearParam ? Number(yearParam) : nowJalali.jy;
    const jm = monthParam ? Number(monthParam) : nowJalali.jm;
    if (!Number.isInteger(jy) || !Number.isInteger(jm) || jm < 1 || jm > 12) {
      throw new BadRequestException('سال یا ماه نامعتبر است');
    }

    const monthLength = jalaaliMonthLength(jy, jm);
    const { start, end } = this.jalaaliMonthRange(jy, jm);

    const rows = await this.prisma.$queryRaw<
      Array<{
        day: string;
        sales_count: bigint;
        net_amount: Prisma.Decimal;
      }>
    >(Prisma.sql`
      SELECT
        to_char(date_trunc('day', ("soldAt" AT TIME ZONE 'Asia/Tehran')), 'YYYY-MM-DD') AS day,
        COUNT(*)::bigint AS sales_count,
        COALESCE(SUM("netAmount"), 0)::numeric AS net_amount
      FROM "OfflineSale"
      WHERE
        "isDeleted" = false
        AND "soldAt" >= ${start}
        AND "soldAt" < ${end}
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    const byJalaliDay = new Map<number, { salesCount: number; netAmount: number }>();
    for (const r of rows) {
      const [gy, gm, gd] = r.day.split('-').map(Number);
      const j = toJalaali(gy, gm, gd);
      if (j.jy === jy && j.jm === jm) {
        byJalaliDay.set(j.jd, {
          salesCount: Number(r.sales_count),
          netAmount: Number(r.net_amount),
        });
      }
    }

    const data = Array.from({ length: monthLength }, (_, i) => {
      const day = i + 1;
      const entry = byJalaliDay.get(day);
      return {
        day,
        salesCount: entry?.salesCount ?? 0,
        netAmount: entry?.netAmount ?? 0,
      };
    });

    return { year: jy, month: jm, monthName: JALALI_MONTH_NAMES[jm - 1], monthLength, data };
  }

  @Get('monthly-jalali')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'فروش دستی ماهانه در یک سال شمسی' })
  async monthlyJalali(@Req() req: any, @Query('year') yearParam?: string) {
    this.assertCanView(req);
    const nowJalali = toJalaali(new Date());
    const jy = yearParam ? Number(yearParam) : nowJalali.jy;
    if (!Number.isInteger(jy)) {
      throw new BadRequestException('سال نامعتبر است');
    }

    const { start } = this.jalaaliMonthRange(jy, 1);
    const { start: end } = this.jalaaliMonthRange(jy + 1, 1);

    const rows = await this.prisma.$queryRaw<
      Array<{
        day: string;
        sales_count: bigint;
        net_amount: Prisma.Decimal;
        cost_of_goods: Prisma.Decimal;
      }>
    >(Prisma.sql`
      SELECT
        to_char(date_trunc('day', ("soldAt" AT TIME ZONE 'Asia/Tehran')), 'YYYY-MM-DD') AS day,
        COUNT(*)::bigint AS sales_count,
        COALESCE(SUM("netAmount"), 0)::numeric AS net_amount,
        COALESCE(SUM("costOfGoods"), 0)::numeric AS cost_of_goods
      FROM "OfflineSale"
      WHERE
        "isDeleted" = false
        AND "soldAt" >= ${start}
        AND "soldAt" < ${end}
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    const buckets = Array.from({ length: 12 }, () => ({
      salesCount: 0,
      netAmount: 0,
      costOfGoods: 0,
    }));
    for (const r of rows) {
      const [gy, gm, gd] = r.day.split('-').map(Number);
      const j = toJalaali(gy, gm, gd);
      if (j.jy === jy) {
        buckets[j.jm - 1].salesCount += Number(r.sales_count);
        buckets[j.jm - 1].netAmount += Number(r.net_amount);
        buckets[j.jm - 1].costOfGoods += Number(r.cost_of_goods);
      }
    }

    return {
      year: jy,
      data: buckets.map((b, i) => ({
        month: i + 1,
        monthName: JALALI_MONTH_NAMES[i],
        salesCount: b.salesCount,
        netAmount: b.netAmount,
        netProfit: b.netAmount - b.costOfGoods,
      })),
    };
  }
}
