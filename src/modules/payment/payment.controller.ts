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

    const tx = await this.prisma.paymentTransaction.findFirst({
      where: { authority, isDeleted: false },
      include: { order: true },
    });

    if (!tx) {
      return res.redirect(`${frontendUrl}/${language}/payment/failed`);
    }

    const orderId = tx.orderId;

    if (status !== 'OK') {
      await this.prisma.$transaction([
        this.prisma.paymentTransaction.update({
          where: { id: tx.id },
          data: {
            status: 'FAILED',
            verifiedAt: new Date(),
          },
        }),
        this.prisma.order.update({
          where: { id: orderId },
          data: { paymentStatus: 'FAILED' },
        }),
      ]);
      return res.redirect(
        `${frontendUrl}/${language}/payment/failed?orderId=${orderId}`,
      );
    }

    const amountToman = Math.round(Number(tx.amount));
    const verified = await this.paymentService.verifyZarinpalPayment({
      authority,
      amountToman,
    });

    await this.prisma.$transaction([
      this.prisma.paymentTransaction.update({
        where: { id: tx.id },
        data: {
          status: 'PAID',
          refId: verified.refId || null,
          verifiedAt: new Date(),
        },
      }),
      this.prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: 'PAID', paidAt: new Date() },
      }),
    ]);

    return res.redirect(
      `${frontendUrl}/${language}/payment/success?orderId=${orderId}`,
    );
  }
}
