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
import { OrderReservationService } from '../../../order/order-reservation.service';
import { RESERVATION_TTL_MS } from '../../../order/reservation.constants';
import { UpsertBasketItemDto } from '../dtos/upsert-basket-item.dto';
import { UpdateBasketItemDto } from '../dtos/update-basket-item.dto';
import { BasketCheckoutPreviewDto } from '../dtos/basket-checkout-preview.dto';
import { BasketCheckoutDto } from '../dtos/basket-checkout.dto';

function reservationDeadline(): Date {
  return new Date(Date.now() + RESERVATION_TTL_MS);
}

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
    private readonly orderReservation: OrderReservationService,
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
      // قیمت سطح محصول است؛ برای سازگاری با فرانتی که variant.price می‌خواند، آینه می‌کنیم.
      const variantWithPrice = {
        ...variant,
        price: product.finalPrice,
        discountPrice: product.discountPrice ?? null,
        discountPercent: product.discountPercent ?? null,
      };
      return {
        id: item.id,
        quantity: item.quantity,
        productVariantId: variant.id,
        product: {
          ...product,
          variants: [variantWithPrice],
        },
      };
    });

    const total = basket.items.reduce((sum, item) => {
      const variant = item.productVariant;
      const unit = variant.product.discountPrice ?? variant.product.finalPrice;
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
          where: {
            id: dto.productVariantId,
            isDeleted: false,
            product: { isActive: true, isDeleted: false },
          },
          select: { id: true, productId: true },
        })
      : await this.prisma.productVariant.findFirst({
          where: {
            productId: dto.productId,
            isDeleted: false,
            product: { isActive: true, isDeleted: false },
            ...(dto.size != null ? { size: dto.size } : {}),
            ...(dto.color != null ? { color: dto.color } : {}),
          },
          select: { id: true, productId: true },
          orderBy: { createdAt: 'asc' },
        });

    if (!variant || variant.productId !== dto.productId) {
      throw new BadRequestException('Variant not found for product');
    }

    await this.prisma.$transaction(async (tx) => {
      const reserved = await tx.productVariant.updateMany({
        where: { id: variant.id, isDeleted: false, stock: { gte: quantity } },
        data: { stock: { decrement: quantity } },
      });
      if (reserved.count === 0) {
        throw new BadRequestException('موجودی کافی نیست');
      }

      await tx.tempBasketItem.upsert({
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
          reservedUntil: reservationDeadline(),
        },
        create: {
          basketId: basket.id,
          productVariantId: variant.id,
          quantity,
          reservedUntil: reservationDeadline(),
        },
      });
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

    await this.prisma.$transaction(async (tx) => {
      const item = await tx.tempBasketItem.findFirst({
        where: { id, basketId: basket.id, isDeleted: false },
        select: { productVariantId: true, quantity: true },
      });
      if (!item) throw new BadRequestException('Item not found');

      const delta = dto.quantity - item.quantity;
      if (delta > 0) {
        const reserved = await tx.productVariant.updateMany({
          where: {
            id: item.productVariantId,
            isDeleted: false,
            stock: { gte: delta },
          },
          data: { stock: { decrement: delta } },
        });
        if (reserved.count === 0) {
          throw new BadRequestException('موجودی کافی نیست');
        }
      } else if (delta < 0) {
        await tx.productVariant.updateMany({
          where: { id: item.productVariantId, isDeleted: false },
          data: { stock: { increment: -delta } },
        });
      }

      await tx.tempBasketItem.updateMany({
        where: { id, basketId: basket.id, isDeleted: false },
        data: { quantity: dto.quantity, reservedUntil: reservationDeadline() },
      });
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

    await this.prisma.$transaction(async (tx) => {
      const item = await tx.tempBasketItem.findFirst({
        where: { id, basketId: basket.id, isDeleted: false },
        select: { productVariantId: true, quantity: true },
      });
      if (!item) return;

      await tx.tempBasketItem.updateMany({
        where: { id, basketId: basket.id, isDeleted: false },
        data: { isDeleted: true, deletedAt: new Date() },
      });
      await tx.productVariant.updateMany({
        where: { id: item.productVariantId, isDeleted: false },
        data: { stock: { increment: item.quantity } },
      });
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
      const unit = variant.product.discountPrice ?? variant.product.finalPrice;
      return sum + toCents(unit) * item.quantity;
    }, 0);

    let shippingCostCents = 0;
    if (dto.shippingMethodId) {
      const method = await this.prisma.shippingMethod.findFirst({
        where: { id: dto.shippingMethodId, isDeleted: false, isActive: true },
        select: { price: true },
      });
      if (!method) throw new BadRequestException('روش ارسال معتبر نیست');
      shippingCostCents = toCents(method.price ?? 0);
    }
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
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`checkout:${userId}`}))`;

      const parseActiveProviders = (
        raw: string | null | undefined,
      ): Array<'ZARINPAL' | 'ZIBAL'> => {
        if (!raw) return ['ZARINPAL'];
        const trimmed = raw.trim();
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            const normalized = parsed
              .map((x) => String(x).toUpperCase())
              .filter((x) => x === 'ZARINPAL' || x === 'ZIBAL') as Array<
              'ZARINPAL' | 'ZIBAL'
            >;
            return normalized.length > 0
              ? Array.from(new Set(normalized))
              : ['ZARINPAL'];
          }
        } catch {
          // ignore
        }
        const normalized = trimmed
          .split(',')
          .map((x) => x.trim().toUpperCase())
          .filter((x) => x === 'ZARINPAL' || x === 'ZIBAL') as Array<
          'ZARINPAL' | 'ZIBAL'
        >;
        return normalized.length > 0
          ? Array.from(new Set(normalized))
          : ['ZARINPAL'];
      };

      const normalizeDefaultProvider = (
        active: Array<'ZARINPAL' | 'ZIBAL'>,
        rawDefault: string | null | undefined,
      ): 'ZARINPAL' | 'ZIBAL' => {
        const desired = String(rawDefault ?? '')
          .trim()
          .toUpperCase();
        const fallback = active[0] ?? 'ZARINPAL';
        if (desired === 'ZARINPAL' || desired === 'ZIBAL') {
          return active.includes(desired as 'ZARINPAL' | 'ZIBAL')
            ? (desired as 'ZARINPAL' | 'ZIBAL')
            : fallback;
        }
        return fallback;
      };

      const activeSetting = await tx.siteSetting.findUnique({
        where: { key: 'PAYMENT_ACTIVE_PROVIDERS' },
        select: { value: true },
      });
      const defaultSetting = await tx.siteSetting.findUnique({
        where: { key: 'PAYMENT_DEFAULT_PROVIDER' },
        select: { value: true },
      });

      const activeProviders = parseActiveProviders(activeSetting?.value);
      const defaultProvider = normalizeDefaultProvider(
        activeProviders,
        defaultSetting?.value,
      );
      const requestedProvider = dto.paymentProvider;
      const paymentProvider =
        requestedProvider && activeProviders.includes(requestedProvider)
          ? requestedProvider
          : defaultProvider;

      // Every checkout call creates its own order — no reusing a prior gateway
      // authority (they go stale fast and the gateway rejects old ones as
      // "expired"). Any earlier attempt by this user still sitting in
      // PENDING_PAYMENT past this window is abandoned; release it before
      // creating the new order below (the background sweeper also does this
      // globally, but we don't want to wait on it here).
      const stalePending = await tx.paymentTransaction.findMany({
        where: {
          isDeleted: false,
          provider: paymentProvider as any,
          status: 'INITIATED',
          createdAt: { lt: new Date(Date.now() - RESERVATION_TTL_MS) },
          order: {
            isDeleted: false,
            userId,
            paymentStatus: 'PENDING',
            orderStatus: 'PENDING_PAYMENT',
          },
        },
        select: { orderId: true },
      });

      for (const stale of stalePending) {
        await this.orderReservation.releaseOrder(tx, stale.orderId);
      }

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
        const unit = variant.product.discountPrice ?? variant.product.finalPrice;
        return sum + toCents(unit) * item.quantity;
      }, 0);

      let shippingCostCents = 0;
      let shippingMethodId: string | null = null;
      let shippingMethodTitle: string | null = null;
      let shippingMethodPrice: number | null = null;
      if (dto.shippingMethodId) {
        const method = await tx.shippingMethod.findFirst({
          where: { id: dto.shippingMethodId, isDeleted: false, isActive: true },
          select: { id: true, title: true, price: true },
        });
        if (!method) throw new BadRequestException('روش ارسال معتبر نیست');
        shippingCostCents = toCents(method.price ?? 0);
        shippingMethodId = method.id;
        shippingMethodTitle = method.title;
        shippingMethodPrice = method.price ?? null;
      }
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

      // Stock was already reserved when these items were added to the
      // basket (see BasketController.upsertItem/updateItem) — nothing to
      // decrement here. Just guard against the sweeper having released a
      // reservation concurrently (should be rare; it only removes items
      // whose 5-minute hold already expired).
      for (const item of basket.items) {
        if (!item.productVariant.product.isActive) {
          throw new BadRequestException('این محصول دیگر در دسترس نیست');
        }
        if (!item.reservedUntil || item.reservedUntil <= now) {
          throw new BadRequestException('موجودی محصول کافی نیست');
        }
      }

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
          shippingMethodId,
          shippingMethodTitle,
          shippingMethodPrice,
          payableAmount: fromCents(payableCents),
          shippingAddress: selectedAddress,
          orderStatus: 'PENDING_PAYMENT',
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
            unitPrice: variant.product.finalPrice,
            unitDiscountPrice: variant.product.discountPrice ?? null,
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
          provider: paymentProvider as any,
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
        paymentProvider,
      };
    });

    const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3005';
    const requestedLangRaw = (dto as any)?.lang?.trim?.();
    const requestedLang =
      requestedLangRaw === 'en' || requestedLangRaw === 'fa'
        ? requestedLangRaw
        : 'fa';
    const callbackUrl =
      baseResult.paymentProvider === 'ZIBAL'
        ? `${backendUrl}/payments/zibal/callback?lang=${requestedLang}`
        : `${backendUrl}/payments/zarinpal/callback?lang=${requestedLang}`;
    const amountToman = Math.round(Number(baseResult.payableAmount));

    let requested: {
      authority: string;
      paymentUrl: string | null;
      isMock: boolean;
    };
    try {
      if (baseResult.paymentProvider === 'ZIBAL') {
        requested = await this.paymentService.requestZibalPayment({
          amountRial: amountToman * 10,
          description: `Order ${baseResult.orderId}`,
          callbackUrl,
        });
      } else {
        requested = await this.paymentService.requestZarinpalPayment({
          amountToman,
          description: `Order ${baseResult.orderId}`,
          callbackUrl,
          mobile: req.user?.mobile,
        });
      }
    } catch (e) {
      await this.prisma.$transaction(async (tx) => {
        await this.orderReservation.releaseOrder(tx, baseResult.orderId);

        const orderItems = await tx.orderItem.findMany({
          where: { orderId: baseResult.orderId, isDeleted: false },
          select: { productVariantId: true, quantity: true },
        });
        const quantityByVariant = new Map<string, number>();
        for (const item of orderItems) {
          quantityByVariant.set(
            item.productVariantId,
            (quantityByVariant.get(item.productVariantId) ?? 0) + item.quantity,
          );
        }

        const basketToRestore = await tx.tempBasket.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });
        if (basketToRestore) {
          await tx.tempBasket.updateMany({
            where: { id: basketToRestore.id },
            data: { isDeleted: false, deletedAt: null },
          });
          for (const [
            productVariantId,
            quantity,
          ] of quantityByVariant.entries()) {
            await tx.tempBasketItem.upsert({
              where: {
                basketId_productVariantId: {
                  basketId: basketToRestore.id,
                  productVariantId,
                },
              },
              update: {
                isDeleted: false,
                deletedAt: null,
                quantity,
                reservedUntil: reservationDeadline(),
              },
              create: {
                basketId: basketToRestore.id,
                productVariantId,
                quantity,
                reservedUntil: reservationDeadline(),
              },
            });
          }
        }
      });
      throw e;
    }

    if (requested.isMock) {
      await this.prisma.$transaction([
        this.prisma.paymentTransaction.updateMany({
          where: { id: baseResult.paymentTransactionId, status: 'INITIATED' },
          data: {
            authority: requested.authority,
            status: 'PAID',
            refId: `MOCK-${Date.now()}`,
            verifiedAt: new Date(),
          },
        }),
        this.prisma.order.updateMany({
          where: { id: baseResult.orderId, paymentStatus: 'PENDING' },
          data: {
            paymentStatus: 'PAID',
            orderStatus: 'PAID',
            paidAt: new Date(),
          },
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

    await this.prisma.paymentTransaction.updateMany({
      where: { id: baseResult.paymentTransactionId, status: 'INITIATED' },
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
