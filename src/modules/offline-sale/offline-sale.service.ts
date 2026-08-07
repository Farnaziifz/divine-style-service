import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import { CreateOfflineSaleDto } from './dtos/create-offline-sale.dto';

@Injectable()
export class OfflineSaleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOfflineSaleDto, createdByUserId?: string) {
    const variantIds = dto.items.map((i) => i.productVariantId);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds }, isDeleted: false },
      select: {
        id: true,
        sku: true,
        productId: true,
        product: { select: { id: true, title: true, costPrice: true, isDeleted: true } },
      },
    });
    const variantById = new Map(variants.map((v) => [v.id, v]));

    for (const item of dto.items) {
      const variant = variantById.get(item.productVariantId);
      if (!variant || variant.product.isDeleted) {
        throw new BadRequestException('محصول یا واریانت پیدا نشد');
      }
      if (variant.productId !== item.productId) {
        throw new BadRequestException('واریانت متعلق به این محصول نیست');
      }
    }

    const totalAmount = dto.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );
    const discountAmount = dto.discountAmount ?? 0;
    if (discountAmount > totalAmount) {
      throw new BadRequestException('مبلغ تخفیف نمی‌تواند بیشتر از جمع فروش باشد');
    }
    const payableAmount = totalAmount - discountAmount;
    const commissionPercent = dto.commissionPercent ?? null;
    const commissionAmount = commissionPercent
      ? (payableAmount * commissionPercent) / 100
      : 0;
    const netAmount = payableAmount - commissionAmount;
    const costOfGoods = dto.items.reduce((sum, item) => {
      const variant = variantById.get(item.productVariantId)!;
      return sum + item.quantity * Number(variant.product.costPrice);
    }, 0);

    return this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        const reserved = await tx.productVariant.updateMany({
          where: {
            id: item.productVariantId,
            isDeleted: false,
            stock: { gte: item.quantity },
          },
          data: { stock: { decrement: item.quantity } },
        });
        if (reserved.count === 0) {
          const variant = variantById.get(item.productVariantId)!;
          throw new BadRequestException(`موجودی کافی نیست: ${variant.sku}`);
        }
      }

      return tx.offlineSale.create({
        data: {
          channel: dto.channel.trim(),
          commissionPercent,
          discountAmount,
          totalAmount,
          commissionAmount,
          payableAmount,
          netAmount,
          costOfGoods,
          note: dto.note?.trim() || null,
          soldAt: dto.soldAt ? new Date(dto.soldAt) : new Date(),
          createdByUserId: createdByUserId ?? null,
          items: {
            create: dto.items.map((item) => {
              const variant = variantById.get(item.productVariantId)!;
              return {
                productId: item.productId,
                productVariantId: item.productVariantId,
                sku: variant.sku,
                title: variant.product.title,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                unitCostPrice: Number(variant.product.costPrice),
              };
            }),
          },
        },
        include: { items: true },
      });
    });
  }

  async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    from?: Date;
    to?: Date;
  }) {
    const { page, limit, search, from, to } = params;
    const skip = (page - 1) * limit;
    const where: Prisma.OfflineSaleWhereInput = {
      isDeleted: false,
      ...(search ? { channel: { contains: search, mode: 'insensitive' } } : {}),
      ...(from || to
        ? { soldAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.offlineSale.count({ where }),
      this.prisma.offlineSale.findMany({
        where,
        orderBy: { soldAt: 'desc' },
        skip,
        take: limit,
        include: { items: true },
      }),
    ]);

    return {
      data,
      meta: { total, page, limit, lastPage: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    return this.prisma.offlineSale.findFirst({
      where: { id, isDeleted: false },
      include: { items: true },
    });
  }

  async remove(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.offlineSale.findFirst({
        where: { id, isDeleted: false },
        include: { items: true },
      });
      if (!sale) {
        throw new BadRequestException('فروش پیدا نشد');
      }

      for (const item of sale.items) {
        await tx.productVariant.updateMany({
          where: { id: item.productVariantId, isDeleted: false },
          data: { stock: { increment: item.quantity } },
        });
      }

      await tx.offlineSale.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date() },
      });

      return { success: true };
    });
  }
}
