import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { PrismaService } from '../shared/prisma/prisma.service';
import { PaymentService } from './payment.service';

@ApiTags('Payment')
@Controller('payments')
export class PaymentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
  ) {}

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
