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
import { UpsertBasketItemDto } from '../dtos/upsert-basket-item.dto';
import { UpdateBasketItemDto } from '../dtos/update-basket-item.dto';

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

@ApiTags('Basket')
@Controller('basket')
export class BasketController {
  constructor(private readonly prisma: PrismaService) {}

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

  @Post('checkout')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Checkout basket -> create order and soft delete basket',
  })
  async checkout(@Req() req: any) {
    const userId = req.user.id;
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
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

      const totalAmount = basket.items.reduce((sum, item) => {
        const variant = item.productVariant;
        const unit = variant.discountPrice ?? variant.price;
        return sum + toNumber(unit) * item.quantity;
      }, 0);

      const order = await tx.order.create({
        data: {
          userId,
          totalAmount,
        },
        select: { id: true },
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

      return { orderId: order.id, totalAmount };
    });

    return result;
  }
}
