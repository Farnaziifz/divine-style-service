import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { countWelcomeTierPurchases } from '../discount/welcome-tier.count';
import { welcomeTierForPriorPaidCount } from '../discount/welcome-tier.rules';
import { PrismaService } from '../shared/prisma/prisma.service';
import { SmsTextService } from '../shared/sms/sms-text.service';
import { CreateOfflineSaleDto } from './dtos/create-offline-sale.dto';

@Injectable()
export class OfflineSaleService {
  private readonly logger = new Logger(OfflineSaleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly smsText: SmsTextService,
  ) {}

  /**
   * خریدار حضوری/اینستا: اگر حساب ندارد ساخته می‌شود. فروش به حساب او وصل می‌شود
   * و (برای پلهٔ تخفیف خوش‌آمدگویی) در شمارش خریدها لحاظ می‌شود.
   * خطا در این مرحله نباید ثبت فروش را خراب کند.
   */
  private async resolveCustomer(mobile: string, name?: string) {
    const trimmedName = name?.trim() || null;
    try {
      let user = await this.prisma.user.findUnique({ where: { mobile } });
      if (user?.isDeleted) return null;

      const isNewAccount = !user;
      if (!user) {
        user = await this.prisma.user.create({
          data: { mobile, name: trimmedName },
        });
      } else if (!user.name && trimmedName) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { name: trimmedName },
        });
      }

      const priorPurchases = await countWelcomeTierPurchases(this.prisma, user.id);
      return { user, isNewAccount, priorPurchases };
    } catch (err) {
      this.logger.error(
        `Offline sale customer lookup failed for ${mobile}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /** پیامک تشکر: می‌گوید این چندمین خرید بوده و تخفیف خرید بعدی چقدر است. */
  private async sendThanksSms(customer: {
    user: { mobile: string; name: string | null };
    isNewAccount: boolean;
    priorPurchases: number;
  }) {
    try {
      const purchaseNumber = customer.priorPurchases + 1;
      await this.smsText.send(
        customer.user.mobile,
        this.smsText.buildOfflinePurchaseThanksText({
          name: customer.user.name,
          purchaseNumber,
          isNewAccount: customer.isNewAccount,
          nextTier: welcomeTierForPriorPaidCount(purchaseNumber),
        }),
      );
    } catch (err) {
      this.logger.error(
        `Offline sale thanks SMS failed for ${customer.user.mobile}: ${(err as Error).message}`,
      );
    }
  }

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

    const customer = dto.customerMobile
      ? await this.resolveCustomer(dto.customerMobile, dto.customerName)
      : null;

    const sale = await this.prisma.$transaction(async (tx) => {
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
          customerId: customer?.user.id ?? null,
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

    if (customer && dto.sendSms !== false) await this.sendThanksSms(customer);
    return {
      ...sale,
      customer: customer
        ? {
            mobile: customer.user.mobile,
            name: customer.user.name,
            isNewAccount: customer.isNewAccount,
            purchaseNumber: customer.priorPurchases + 1,
          }
        : null,
    };
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
      ...(search
        ? {
            OR: [
              { channel: { contains: search, mode: 'insensitive' } },
              { customer: { mobile: { contains: search } } },
            ],
          }
        : {}),
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
        include: { items: true, customer: { select: { mobile: true, name: true } } },
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
      include: { items: true, customer: { select: { mobile: true, name: true } } },
    });
  }

  async update(id: string, dto: CreateOfflineSaleDto) {
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

    const customer = dto.customerMobile
      ? await this.resolveCustomer(dto.customerMobile, dto.customerName)
      : null;
    if (dto.customerMobile && !customer) {
      throw new BadRequestException('ساخت یا پیدا کردن حساب خریدار ممکن نشد');
    }

    let previousCustomerId: string | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.offlineSale.findFirst({
        where: { id, isDeleted: false },
        include: { items: true },
      });
      if (!existing) {
        throw new BadRequestException('فروش پیدا نشد');
      }
      previousCustomerId = existing.customerId;

      for (const item of existing.items) {
        await tx.productVariant.updateMany({
          where: { id: item.productVariantId, isDeleted: false },
          data: { stock: { increment: item.quantity } },
        });
      }

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

      return tx.offlineSale.update({
        where: { id },
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
          soldAt: dto.soldAt ? new Date(dto.soldAt) : existing.soldAt,
          customerId: customer?.user.id ?? null,
          items: {
            deleteMany: {},
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

    // پیامک فقط وقتی می‌رود که فروش تازه به این خریدار وصل شده باشد.
    const newlyLinked = !!customer && customer.user.id !== previousCustomerId;
    if (customer && newlyLinked && dto.sendSms !== false) {
      await this.sendThanksSms(customer);
    }
    return {
      ...updated,
      customer: customer
        ? {
            mobile: customer.user.mobile,
            name: customer.user.name,
            isNewAccount: customer.isNewAccount,
            purchaseNumber: customer.priorPurchases + 1,
          }
        : null,
    };
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
