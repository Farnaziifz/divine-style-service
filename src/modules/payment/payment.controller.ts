import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../shared/prisma/prisma.service';
import { PaginationDto } from '../shared/dtos/pagination.dto';
import { PaymentService } from './payment.service';

@ApiTags('Payment')
@Controller('payments')
export class PaymentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
  ) {}

  private hasPermission(user: any, permission: string) {
    return (
      Array.isArray(user?.permissions) && user.permissions.includes(permission)
    );
  }

  private canReadAllPayments(user: any) {
    return (
      user?.role === 'ADMIN' ||
      (user?.role === 'OPERATOR' && this.hasPermission(user, 'ORDERS_READ'))
    );
  }

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

  @Get('transactions')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List payment transactions' })
  async listTransactions(
    @Req() req: any,
    @Query() pagination: PaginationDto,
    @Query('userId') userId?: string,
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: any = { isDeleted: false };
    if (!this.canReadAllPayments(req.user)) {
      where.order = { is: { userId: req.user.id, isDeleted: false } };
    } else if (userId) {
      where.order = { is: { userId, isDeleted: false } };
    } else {
      where.order = { is: { isDeleted: false } };
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.paymentTransaction.count({ where }),
      this.prisma.paymentTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          provider: true,
          status: true,
          amount: true,
          authority: true,
          refId: true,
          createdAt: true,
          verifiedAt: true,
          order: {
            select: {
              id: true,
              orderCode: true,
              userId: true,
            },
          },
        },
      }),
    ]);

    return {
      data: data.map((tx) => ({
        id: tx.id,
        provider: tx.provider,
        status: tx.status,
        amount: this.toNumber(tx.amount),
        authority: tx.authority,
        refId: tx.refId,
        createdAt: tx.createdAt,
        verifiedAt: tx.verifiedAt,
        order: tx.order,
      })),
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  @Get('zarinpal/callback')
  @ApiOperation({ summary: 'Zarinpal callback' })
  async zarinpalCallback(
    @Query('Authority') authority: string,
    @Query('Status') status: string,
    @Query('lang') lang: string,
    @Res() res: Response,
  ) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const language = lang || 'fa';

    const callbackResult = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`zarinpal-callback:${authority}`}))`;

      const current = await tx.paymentTransaction.findFirst({
        where: { authority, isDeleted: false },
        include: { order: true },
      });

      if (!current) {
        return {
          redirect: `${frontendUrl}/${language}/payment/failed`,
        };
      }

      const orderId = current.orderId;
      const orderCode = current.order?.orderCode || orderId;

      if (
        current.status === 'PAID' ||
        current.order?.paymentStatus === 'PAID'
      ) {
        return {
          redirect: `${frontendUrl}/${language}/payment/success?orderCode=${encodeURIComponent(orderCode)}`,
        };
      }

      if (status !== 'OK') {
        const paymentUpdated = await tx.paymentTransaction.updateMany({
          where: { id: current.id, status: 'INITIATED' },
          data: {
            status: 'FAILED',
            verifiedAt: new Date(),
          },
        });
        await tx.order.updateMany({
          where: { id: orderId, paymentStatus: 'PENDING' },
          data: { paymentStatus: 'FAILED' },
        });

        if (paymentUpdated.count > 0) {
          const orderItems = await tx.orderItem.findMany({
            where: { orderId, isDeleted: false },
            select: { productVariantId: true, quantity: true },
          });

          const quantityByVariant = new Map<string, number>();
          for (const item of orderItems) {
            quantityByVariant.set(
              item.productVariantId,
              (quantityByVariant.get(item.productVariantId) ?? 0) +
                item.quantity,
            );
          }

          for (const [
            productVariantId,
            quantity,
          ] of quantityByVariant.entries()) {
            await tx.productVariant.updateMany({
              where: { id: productVariantId, isDeleted: false },
              data: { stock: { increment: quantity } },
            });
          }
        }
        return {
          redirect: `${frontendUrl}/${language}/payment/failed?orderCode=${encodeURIComponent(orderCode)}`,
        };
      }

      const amountToman = Math.round(Number(current.amount));
      const verified = await this.paymentService.verifyZarinpalPayment({
        authority,
        amountToman,
      });

      await tx.paymentTransaction.updateMany({
        where: { id: current.id, status: 'INITIATED' },
        data: {
          status: 'PAID',
          refId: verified.refId || null,
          verifiedAt: new Date(),
        },
      });
      await tx.order.updateMany({
        where: { id: orderId, paymentStatus: 'PENDING' },
        data: {
          paymentStatus: 'PAID',
          orderStatus: 'PAID',
          paidAt: new Date(),
        },
      });

      return {
        redirect: `${frontendUrl}/${language}/payment/success?orderCode=${encodeURIComponent(orderCode)}`,
      };
    });

    return res.redirect(callbackResult.redirect);
  }
}
