import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';

@Injectable()
export class ShoppingListService {
  constructor(private readonly prisma: PrismaService) {}

  async add(userId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId, isDeleted: false },
    });
    if (!product) {
      throw new NotFoundException('محصول یافت نشد');
    }
    const existing = await this.prisma.shoppingListItem.findUnique({
      where: {
        userId_productId: { userId, productId },
      },
    });
    if (existing) {
      throw new ConflictException('این محصول قبلاً به لیست خرید اضافه شده است');
    }
    return this.prisma.shoppingListItem.create({
      data: { userId, productId },
      include: {
        product: {
          include: {
            category: true,
            collections: true,
            variants: true,
          },
        },
      },
    });
  }

  async remove(userId: string, productId: string) {
    const item = await this.prisma.shoppingListItem.findUnique({
      where: {
        userId_productId: { userId, productId },
      },
    });
    if (!item) {
      throw new NotFoundException('آیتم در لیست خرید یافت نشد');
    }
    await this.prisma.shoppingListItem.delete({
      where: { id: item.id },
    });
    return { success: true };
  }

  async findAllByUserId(userId: string) {
    const items = await this.prisma.shoppingListItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          include: {
            category: true,
            collections: true,
            variants: true,
          },
        },
      },
    });
    return {
      items: items.map((row) => ({
        id: row.id,
        productId: row.productId,
        addedAt: row.createdAt,
        product: row.product,
      })),
    };
  }

  async hasProduct(userId: string, productId: string): Promise<boolean> {
    const item = await this.prisma.shoppingListItem.findUnique({
      where: {
        userId_productId: { userId, productId },
      },
    });
    return !!item;
  }
}
