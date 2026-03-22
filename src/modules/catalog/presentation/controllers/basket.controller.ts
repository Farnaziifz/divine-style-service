import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DiscountService } from '../../../discount/discount.service';
import { PaymentService } from '../../../payment/payment.service';
import { UpsertBasketItemDto } from '../dtos/upsert-basket-item.dto';
import { UpdateBasketItemDto } from '../dtos/update-basket-item.dto';
import { BasketCheckoutPreviewDto } from '../dtos/basket-checkout-preview.dto';
import { BasketCheckoutDto } from '../dtos/basket-checkout.dto';

function toNumber(value: any): number {
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

function toCents(value: any): number {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

@ApiTags('Basket')
@Controller('basket')
export class BasketController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discountService: DiscountService,
    private readonly paymentService: PaymentService,
  ) {}

  private async getOrCreateActiveBasket(userId: string) {
    const existing = await this.prisma.tempBasket.findFirst({
      where: { userId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (existing) return existing;
    return this.prisma.tempBasket.create({
      data: { userId },
      select: { id: true },
    });
  }

  private async getBasketResponse(userId: string) {
    const basket = await this.prisma.tempBasket.findFirst({
      where: { userId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          where: { isDeleted: false },
          orderBy: { createdAt: 'desc' },
          include: {
            productVariant: {
              include: {
                product: {
                  include: {
                    category: true,
                    collections: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!basket) {
      return { id: null, items: [], total: 0 };
    }

    const items = basket.items.map((item) => {
      const variant = item.productVariant;
      const product = variant.product;
      return {
        id: item.id,
        quantity: item.quantity,
        productVariantId: variant.id,
        product: {
          ...product,
          variants: [variant],
        },
      };
    });

    const total = basket.items.reduce((sum, item) => {
      const variant = item.productVariant;
      const unit = variant.discountPrice ?? variant.price;
      return sum + toNumber(unit) * item.quantity;
    }, 0);

    return { id: basket.id, items, total };
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current basket' })
  async getCurrent(@Req() req: any) {
    return this.getBasketResponse(req.user.id);
  }

  @Post('items')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add item to basket (upsert)' })
  async upsertItem(@Req() req: any, @Body() dto: UpsertBasketItemDto) {
    const userId = req.user.id;
    const basket = await this.getOrCreateActiveBasket(userId);

    const quantity = dto.quantity ?? 1;
    if (quantity < 1) throw new BadRequestException('quantity must be >= 1');

    const variant = dto.productVariantId
      ? await this.prisma.productVariant.findFirst({
          where: { id: dto.productVariantId, isDeleted: false },
          select: { id: true, productId: true },
        })
      : await this.prisma.productVariant.findFirst({
          where: {
            productId: dto.productId,
            isDeleted: false,
            ...(dto.size != null ? { size: dto.size } : {}),
            ...(dto.color != null ? { color: dto.color } : {}),
          },
          select: { id: true, productId: true },
          orderBy: { createdAt: 'asc' },
        });

    if (!variant || variant.productId !== dto.productId) {
      throw new BadRequestException('Variant not found for product');
    }

    await this.prisma.tempBasketItem.upsert({
      where: {
        basketId_productVariantId: {
          basketId: basket.id,
          productVariantId: variant.id,
        },
      },
      update: {
        isDeleted: false,
        deletedAt: null,
        quantity: { increment: quantity },
      },
      create: {
        basketId: basket.id,
        productVariantId: variant.id,
        quantity,
      },
    });

    return this.getBasketResponse(userId);
  }

  @Patch('items/:id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update basket item quantity' })
  async updateItem(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateBasketItemDto,
  ) {
    const userId = req.user.id;
    const basket = await this.prisma.tempBasket.findFirst({
      where: { userId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!basket) throw new BadRequestException('Basket not found');

    await this.prisma.tempBasketItem.updateMany({
      where: { id, basketId: basket.id, isDeleted: false },
      data: { quantity: dto.quantity },
    });

    return this.getBasketResponse(userId);
  }

  @Delete('items/:id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove item from basket (soft delete)' })
  async removeItem(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.id;
    const basket = await this.prisma.tempBasket.findFirst({
      where: { userId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!basket) return this.getBasketResponse(userId);

    await this.prisma.tempBasketItem.updateMany({
      where: { id, basketId: basket.id, isDeleted: false },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    return this.getBasketResponse(userId);
  }

  @Post('checkout/preview')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Checkout preview',
  })
  async checkoutPreview(
    @Req() req: any,
    @Body() dto: BasketCheckoutPreviewDto,
  ) {
    const userId = req.user.id;
    const now = new Date();

    const basket = await this.prisma.tempBasket.findFirst({
      where: { userId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          where: { isDeleted: false },
          include: {
            productVariant: {
              include: {
                product: true,
              },
            },
          },
        },
      },
    });

    if (!basket || basket.items.length === 0) {
      throw new BadRequestException('Basket is empty');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { addresses: true },
    });
    const addresses = Array.isArray(user?.addresses)
      ? (user?.addresses as any[])
      : [];
    const selectedAddress = addresses.find((a) => a?.id === dto.addressId);
    if (!selectedAddress) throw new BadRequestException('Address not found');

    const subtotalCents = basket.items.reduce((sum, item) => {
      const variant = item.productVariant;
      const unit = variant.discountPrice ?? variant.price;
      return sum + toCents(unit) * item.quantity;
    }, 0);

    const shippingCostCents = 0;
    const discountCodeRaw = dto.discountCode?.trim();
    const discountCode = discountCodeRaw ? discountCodeRaw.toUpperCase() : null;
    let discountAmountCents = 0;

    if (discountCode) {
      const discount = await this.prisma.discountCode.findFirst({
        where: { code: discountCode },
        include: {
          eligibleUsers: { select: { userId: true } },
        },
      });

      if (
        !discount ||
        discount.isDeleted ||
        !discount.isActive ||
        now < discount.validFrom ||
        now > discount.validTo
      ) {
        throw new BadRequestException('کد تخفیف معتبر نیست');
      }

      if (
        discount.maxTotalUses != null &&
        discount.usedCount >= discount.maxTotalUses
      ) {
        throw new BadRequestException('کد تخفیف معتبر نیست');
      }

      if (discount.scope === 'USER_GROUP') {
        throw new BadRequestException('کدهای تخفیف گروهی هنوز فعال نیستند');
      }

      if (discount.scope === 'MULTIPLE_USERS') {
        const allowed = discount.eligibleUsers.some((e) => e.userId === userId);
        if (!allowed) {
          throw new BadRequestException('کد تخفیف معتبر نیست');
        }
      }

      if (
        discount.scope === 'SINGLE_USER' &&
        discount.userId &&
        discount.userId !== userId
      ) {
        throw new BadRequestException('کد تخفیف معتبر نیست');
      }

      const minOrder =
        discount.minOrderAmount != null
          ? toCents(discount.minOrderAmount)
          : null;
      if (minOrder != null && subtotalCents < minOrder) {
        throw new BadRequestException('کد تخفیف معتبر نیست');
      }

      discountAmountCents = this.discountService.computeDiscountAmountCents(
        subtotalCents,
        discount.valueType,
        discount.value,
      );
    }

    const payableCents =
      subtotalCents - discountAmountCents + shippingCostCents;

    return {
      subtotal: fromCents(subtotalCents),
      discountCode,
      discountAmount: fromCents(discountAmountCents),
      shippingCost: fromCents(shippingCostCents),
      payableAmount: fromCents(payableCents),
      address: selectedAddress,
    };
  }

  @Post('checkout')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Checkout basket -> create order and soft delete basket',
  })
  async checkout(@Req() req: any, @Body() dto: BasketCheckoutDto) {
    const userId = req.user.id;
    const now = new Date();

    const baseResult = await this.prisma.$transaction(async (tx) => {
      const basket = await tx.tempBasket.findFirst({
        where: { userId, isDeleted: false },
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            where: { isDeleted: false },
            include: {
              productVariant: {
                include: {
                  product: true,
                },
              },
            },
          },
        },
      });

      if (!basket || basket.items.length === 0) {
        throw new BadRequestException('Basket is empty');
      }

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { addresses: true },
      });
      const addresses = Array.isArray(user?.addresses)
        ? (user?.addresses as any[])
        : [];
      const selectedAddress = addresses.find((a) => a?.id === dto.addressId);
      if (!selectedAddress) throw new BadRequestException('Address not found');

      const subtotalCents = basket.items.reduce((sum, item) => {
        const variant = item.productVariant;
        const unit = variant.discountPrice ?? variant.price;
        return sum + toCents(unit) * item.quantity;
      }, 0);

      const shippingCostCents = 0;
      const discountCodeRaw = dto.discountCode?.trim();
      const discountCode = discountCodeRaw
        ? discountCodeRaw.toUpperCase()
        : null;
      let discountAmountCents = 0;

      if (discountCode) {
        const discount = await tx.discountCode.findFirst({
          where: { code: discountCode },
          include: {
            eligibleUsers: { select: { userId: true } },
          },
        });

        if (
          !discount ||
          discount.isDeleted ||
          !discount.isActive ||
          now < discount.validFrom ||
          now > discount.validTo
        ) {
          throw new BadRequestException('کد تخفیف معتبر نیست');
        }

        if (
          discount.maxTotalUses != null &&
          discount.usedCount >= discount.maxTotalUses
        ) {
          throw new BadRequestException('کد تخفیف معتبر نیست');
        }

        if (discount.scope === 'USER_GROUP') {
          throw new BadRequestException('کدهای تخفیف گروهی هنوز فعال نیستند');
        }

        if (discount.scope === 'MULTIPLE_USERS') {
          const allowed = discount.eligibleUsers.some(
            (e) => e.userId === userId,
          );
          if (!allowed) {
            throw new BadRequestException('کد تخفیف معتبر نیست');
          }
        }

        if (
          discount.scope === 'SINGLE_USER' &&
          discount.userId &&
          discount.userId !== userId
        ) {
          throw new BadRequestException('کد تخفیف معتبر نیست');
        }

        const minOrder =
          discount.minOrderAmount != null
            ? toCents(discount.minOrderAmount)
            : null;
        if (minOrder != null && subtotalCents < minOrder) {
          throw new BadRequestException('کد تخفیف معتبر نیست');
        }

        discountAmountCents = this.discountService.computeDiscountAmountCents(
          subtotalCents,
          discount.valueType,
          discount.value,
        );

        if (discount.maxTotalUses != null) {
          const updated = await tx.discountCode.updateMany({
            where: {
              code: discountCode,
              isDeleted: false,
              isActive: true,
              usedCount: { lt: discount.maxTotalUses },
            },
            data: { usedCount: { increment: 1 } },
          });
          if (updated.count === 0) {
            throw new BadRequestException('کد تخفیف معتبر نیست');
          }
        } else {
          await tx.discountCode.update({
            where: { code: discountCode },
            data: { usedCount: { increment: 1 } },
          });
        }
      }

      const payableCents =
        subtotalCents - discountAmountCents + shippingCostCents;

      const nowLocal = new Date();
      const y = nowLocal.getFullYear();
      const m = pad2(nowLocal.getMonth() + 1);
      const d = pad2(nowLocal.getDate());

      let orderCode = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        const rnd = Math.floor(Math.random() * 1_000_000);
        orderCode = `DV-${y}${m}${d}-${String(rnd).padStart(6, '0')}`;
        const exists = await tx.order.findUnique({
          where: { orderCode },
          select: { id: true },
        });
        if (!exists) break;
      }
      if (!orderCode) {
        orderCode = `DV-${y}${m}${d}-${Date.now()}`;
      }

      const order = await tx.order.create({
        data: {
          orderCode,
          userId,
          totalAmount: fromCents(subtotalCents),
          discountCode,
          discountAmount: fromCents(discountAmountCents),
          shippingCost: fromCents(shippingCostCents),
          payableAmount: fromCents(payableCents),
          shippingAddress: selectedAddress,
        },
        select: { id: true, orderCode: true },
      });

      await tx.orderItem.createMany({
        data: basket.items.map((item) => {
          const variant = item.productVariant;
          return {
            orderId: order.id,
            productId: variant.productId,
            productVariantId: variant.id,
            sku: variant.sku,
            title: variant.product.title,
            quantity: item.quantity,
            unitPrice: variant.price,
            unitDiscountPrice: variant.discountPrice ?? null,
            isDeleted: false,
            deletedAt: null,
          };
        }),
      });

      await tx.tempBasketItem.updateMany({
        where: { basketId: basket.id, isDeleted: false },
        data: { isDeleted: true, deletedAt: now },
      });

      await tx.tempBasket.update({
        where: { id: basket.id },
        data: { isDeleted: true, deletedAt: now },
        select: { id: true },
      });

      const payment = await tx.paymentTransaction.create({
        data: {
          orderId: order.id,
          provider: 'ZARINPAL',
          status: 'INITIATED',
          amount: fromCents(payableCents),
        },
        select: { id: true },
      });

      return {
        orderId: order.id,
        orderCode: order.orderCode,
        payableAmount: fromCents(payableCents),
        paymentTransactionId: payment.id,
      };
    });

    const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3005';
    const callbackUrl = `${backendUrl}/payments/zarinpal/callback?lang=fa`;
    const amountToman = Math.round(Number(baseResult.payableAmount));

    const requested = await this.paymentService.requestZarinpalPayment({
      amountToman,
      description: `Order ${baseResult.orderId}`,
      callbackUrl,
      mobile: req.user?.mobile,
    });

    if (requested.isMock) {
      await this.prisma.$transaction([
        this.prisma.paymentTransaction.update({
          where: { id: baseResult.paymentTransactionId },
          data: {
            authority: requested.authority,
            status: 'PAID',
            refId: `MOCK-${Date.now()}`,
            verifiedAt: new Date(),
          },
        }),
        this.prisma.order.update({
          where: { id: baseResult.orderId },
          data: { paymentStatus: 'PAID', paidAt: new Date() },
        }),
      ]);

      return {
        orderId: baseResult.orderId,
        orderCode: baseResult.orderCode,
        payableAmount: baseResult.payableAmount,
        paymentStatus: 'PAID',
        paymentUrl: null,
      };
    }

    await this.prisma.paymentTransaction.update({
      where: { id: baseResult.paymentTransactionId },
      data: { authority: requested.authority },
    });

    return {
      orderId: baseResult.orderId,
      orderCode: baseResult.orderCode,
      payableAmount: baseResult.payableAmount,
      paymentStatus: 'PENDING',
      paymentUrl: requested.paymentUrl,
    };
  }
}
