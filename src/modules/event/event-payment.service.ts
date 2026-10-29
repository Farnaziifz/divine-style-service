import { BadRequestException, ForbiddenException, Logger, Injectable, NotFoundException } from '@nestjs/common';
import { EventPaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import { PaymentService } from '../payment/payment.service';
import { SmsTextService } from '../shared/sms/sms-text.service';
import { EventService } from './event.service';
import { CreateEventPaymentDto } from './dtos/create-event-payment.dto';
import { serializeSpin } from './event-spin.service';
import { AssignEventPaymentItemsDto } from './dtos/assign-event-payment-items.dto';

type ProviderName = 'ZARINPAL' | 'ZIBAL';

function parseProviders(raw: string | null | undefined): ProviderName[] {
  const fallback: ProviderName[] = ['ZARINPAL'];
  if (!raw) return fallback;
  let items: unknown[];
  try {
    const parsed = JSON.parse(raw.trim());
    items = Array.isArray(parsed) ? parsed : raw.split(',');
  } catch {
    items = raw.split(',');
  }
  const normalized = items
    .map((x) => String(x).trim().toUpperCase())
    .filter((x): x is ProviderName => x === 'ZARINPAL' || x === 'ZIBAL');
  return normalized.length > 0 ? Array.from(new Set(normalized)) : fallback;
}

const ADMIN_PAYMENT_INCLUDE = {
  user: { select: { mobile: true, name: true } },
  offlineSale: { include: { items: { orderBy: { createdAt: 'asc' as const } } } },
} satisfies Prisma.EventPaymentInclude;

function serializeAdminPayment(
  p: Prisma.EventPaymentGetPayload<{ include: typeof ADMIN_PAYMENT_INCLUDE }>,
) {
  // فروشِ حذف‌شده (از صفحهٔ فروش حضوری) یعنی اقلام برگشته‌اند و پرداخت دوباره تعیین تکلیف نشده است
  const sale = p.offlineSale && !p.offlineSale.isDeleted ? p.offlineSale : null;
  const items = (sale?.items ?? []).map((i) => ({
    id: i.id,
    productId: i.productId,
    productVariantId: i.productVariantId,
    sku: i.sku,
    title: i.title,
    quantity: i.quantity,
    unitPrice: i.unitPrice.toNumber(),
  }));
  return {
    id: p.id,
    status: p.status,
    amount: p.amount.toNumber(),
    refId: p.refId,
    verifiedAt: p.verifiedAt,
    createdAt: p.createdAt,
    user: p.user,
    items,
    isAssigned: items.length > 0,
  };
}

@Injectable()
export class EventPaymentService {
  private readonly logger = new Logger(EventPaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly eventService: EventService,
    private readonly smsText: SmsTextService,
  ) {}

  /** پیامک فروش به شماره‌های اعلان مدیر؛ best-effort و فقط بار اول که پرداخت PAID می‌شود */
  private async notifyAdmins(paymentId: string) {
    try {
      const payment = await this.prisma.eventPayment.findUnique({
        where: { id: paymentId },
        include: {
          event: { select: { name: true, eventCode: true } },
          user: { select: { mobile: true } },
        },
      });
      if (!payment) return;
      const recipients = await this.prisma.orderNotificationPhone.findMany({
        where: { isActive: true, isDeleted: false },
        select: { phoneNumber: true },
      });
      if (recipients.length === 0) return;
      const text = this.smsText.buildAdminEventPaymentText({
        eventName: payment.event.name,
        eventCode: payment.event.eventCode,
        amount: payment.amount.toNumber(),
        customerMobile: payment.user.mobile,
        refId: payment.refId,
        paidAt: payment.verifiedAt ?? new Date(),
      });
      await Promise.all(recipients.map((r) => this.smsText.send(r.phoneNumber, text)));
    } catch (err) {
      this.logger.warn(`Event payment admin SMS failed for ${paymentId}: ${(err as Error).message}`);
    }
  }

  private async resolveProvider(requested?: ProviderName): Promise<ProviderName> {
    const [activeSetting, defaultSetting] = await this.prisma.$transaction([
      this.prisma.siteSetting.findUnique({
        where: { key: 'PAYMENT_ACTIVE_PROVIDERS' },
        select: { value: true },
      }),
      this.prisma.siteSetting.findUnique({
        where: { key: 'PAYMENT_DEFAULT_PROVIDER' },
        select: { value: true },
      }),
    ]);
    const active = parseProviders(activeSetting?.value);
    const desired = String(defaultSetting?.value ?? '').trim().toUpperCase();
    const fallback = active.includes(desired as ProviderName)
      ? (desired as ProviderName)
      : active[0];
    return requested && active.includes(requested) ? requested : fallback;
  }

  /**
   * پرداخت را PAID می‌کند و همان لحظه به‌عنوان یک فروش (کانال «ایونت …») به حساب خریدار ثبت می‌کند،
   * تا مثل خرید از سایت در شمارش پلهٔ خرید اول و گزارش‌های فروش بیاید. idempotent: اگر قبلاً ثبت شده دوباره نمی‌سازد.
   */
  private async markPaid(
    tx: Prisma.TransactionClient,
    payment: { id: string; userId: string; eventId: string; amount: Prisma.Decimal; offlineSaleId: string | null },
    refId: string | null,
    authority?: string,
  ) {
    let offlineSaleId = payment.offlineSaleId;
    if (!offlineSaleId) {
      const event = await tx.event.findUniqueOrThrow({
        where: { id: payment.eventId },
        select: { name: true },
      });
      const sale = await tx.offlineSale.create({
        data: {
          channel: `ایونت ${event.name}`,
          totalAmount: payment.amount,
          payableAmount: payment.amount,
          netAmount: payment.amount,
          note: `پرداخت آنلاین ایونت${refId ? ` — کد پیگیری ${refId}` : ''}`,
          customerId: payment.userId,
        },
        select: { id: true },
      });
      offlineSaleId = sale.id;
    }
    await tx.eventPayment.update({
      where: { id: payment.id },
      data: {
        status: 'PAID',
        refId,
        verifiedAt: new Date(),
        offlineSaleId,
        ...(authority ? { authority } : {}),
      },
    });
  }

  private landingUrl(): string {
    return (process.env.LANDING_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
  }

  async create(userId: string, dto: CreateEventPaymentDto) {
    const event = await this.eventService.findActiveByCode(dto.eventCode);
    const provider = await this.resolveProvider(dto.provider);

    const payment = await this.prisma.eventPayment.create({
      data: {
        eventId: event.id,
        userId,
        provider,
        amount: new Prisma.Decimal(dto.amount),
      },
    });

    const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3005';
    const callbackUrl = `${backendUrl}/event-payments/${provider.toLowerCase()}/callback`;
    const description = `Event payment ${payment.id}`;

    let requested: { authority: string; paymentUrl: string | null; isMock: boolean };
    try {
      requested =
        provider === 'ZIBAL'
          ? await this.paymentService.requestZibalPayment({
              amountRial: dto.amount * 10,
              description,
              callbackUrl,
            })
          : await this.paymentService.requestZarinpalPayment({
              amountToman: dto.amount,
              description,
              callbackUrl,
            });
    } catch (e) {
      await this.prisma.eventPayment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });
      throw e;
    }

    if (requested.isMock) {
      await this.prisma.$transaction((tx) =>
        this.markPaid(tx, payment, `MOCK-${Date.now()}`, requested.authority),
      );
      await this.notifyAdmins(payment.id);
      return { paymentId: payment.id, status: 'PAID' as const, paymentUrl: null };
    }

    await this.prisma.eventPayment.update({
      where: { id: payment.id },
      data: { authority: requested.authority },
    });
    return {
      paymentId: payment.id,
      status: 'INITIATED' as const,
      paymentUrl: requested.paymentUrl,
    };
  }

  /** بعد از بازگشت از درگاه، کاربر را به صفحهٔ وضعیت پرداخت در لندینگ برمی‌گرداند */
  async verifyCallback(
    provider: ProviderName,
    authority: string,
    zarinpalStatus?: string,
  ): Promise<string> {
    const landing = this.landingUrl();

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`event-payment:${authority}`}))`;

      const payment = await tx.eventPayment.findFirst({
        where: { authority },
        include: { event: { select: { eventCode: true } } },
      });
      if (!payment) return null;
      const target = { id: payment.id, eventCode: payment.event.eventCode, paidNow: false };
      if (payment.status === 'PAID') return target;

      if (provider === 'ZARINPAL' && zarinpalStatus !== 'OK') {
        await tx.eventPayment.update({
          where: { id: payment.id },
          data: { status: 'FAILED' },
        });
        return target;
      }

      let verified: { refId: string } | null = null;
      try {
        verified =
          provider === 'ZIBAL'
            ? await this.paymentService.verifyZibalPayment({ trackId: authority })
            : await this.paymentService.verifyZarinpalPayment({
                authority,
                amountToman: Math.round(Number(payment.amount)),
              });
      } catch (e) {
        if (!(e instanceof BadRequestException)) throw e;
      }

      if (verified) {
        // پول از کاربر کسر شده؛ خطای ثبت نباید پرداخت را FAILED کند
        await this.markPaid(tx, payment, verified.refId || null);
        target.paidNow = true;
      } else {
        await tx.eventPayment.update({
          where: { id: payment.id },
          data: { status: 'FAILED' },
        });
      }
      return target;
    });

    if (result?.paidNow) await this.notifyAdmins(result.id);

    return result
      ? `${landing}/${encodeURIComponent(result.eventCode)}/status/${result.id}`
      : landing;
  }

  /** لیست پرداخت‌های موفق یک ایونت برای ادمین، به‌همراه اقلام تعیین‌تکلیف‌شدهٔ هر پرداخت */
  async listForEvent(
    eventId: string,
    params: {
      page: number;
      limit: number;
      status?: EventPaymentStatus;
      unassignedOnly?: boolean;
    },
  ) {
    await this.eventService.findOne(eventId);
    const { page, limit, status, unassignedOnly } = params;

    const where: Prisma.EventPaymentWhereInput = {
      eventId,
      // تعیین‌تکلیف‌نشده فقط دربارهٔ پرداخت‌های موفق معنی دارد
      ...(unassignedOnly ? { status: 'PAID' as const } : status ? { status } : {}),
      ...(unassignedOnly
        ? { OR: [{ offlineSaleId: null }, { offlineSale: { is: { items: { none: {} } } } }] }
        : {}),
    };

    const [total, payments] = await this.prisma.$transaction([
      this.prisma.eventPayment.count({ where }),
      this.prisma.eventPayment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: ADMIN_PAYMENT_INCLUDE,
      }),
    ]);

    const data = payments.map(serializeAdminPayment);

    return { data, meta: { total, page, limit, lastPage: Math.ceil(total / limit) || 1 } };
  }

  /**
   * تعیین تکلیف یک پرداخت: اقلام را روی فروشِ همان پرداخت می‌نشاند و موجودی را کم می‌کند.
   * جایگزین‌کننده و idempotent است — موجودی اقلام قبلی برگردانده می‌شود و اقلام جدید کم می‌شود،
   * پس ویرایش یا ارسال دوبارهٔ یک درخواست موجودی را دوبار کم نمی‌کند. مبلغ پرداخت‌شده هرگز تغییر نمی‌کند.
   */
  async assignItems(eventId: string, paymentId: string, dto: AssignEventPaymentItemsDto) {
    const seen = new Set<string>();
    for (const item of dto.items) {
      if (seen.has(item.productVariantId)) {
        throw new BadRequestException('هر واریانت فقط یک‌بار در لیست می‌تواند باشد');
      }
      seen.add(item.productVariantId);
    }

    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: [...seen] }, isDeleted: false },
      select: {
        id: true,
        sku: true,
        productId: true,
        product: { select: { title: true, costPrice: true, isDeleted: true } },
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

    const itemsTotal = dto.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    const costOfGoods = dto.items.reduce(
      (sum, i) => sum + i.quantity * Number(variantById.get(i.productVariantId)!.product.costPrice),
      0,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`event-payment-assign:${paymentId}`}))`;

      const payment = await tx.eventPayment.findFirst({
        where: { id: paymentId, eventId },
        include: {
          event: { select: { name: true } },
          offlineSale: { include: { items: true } },
        },
      });
      if (!payment) throw new NotFoundException('پرداخت یافت نشد');
      if (payment.status !== 'PAID') {
        throw new BadRequestException('فقط پرداخت‌های موفق قابل تعیین تکلیف هستند');
      }

      // فروشِ حذف‌شده موجودی‌اش همان موقع برگردانده شده؛ دوباره برنگردان
      let sale = payment.offlineSale && !payment.offlineSale.isDeleted ? payment.offlineSale : null;
      if (sale) {
        for (const old of sale.items) {
          await tx.productVariant.updateMany({
            where: { id: old.productVariantId, isDeleted: false },
            data: { stock: { increment: old.quantity } },
          });
        }
      }

      for (const item of dto.items) {
        const reserved = await tx.productVariant.updateMany({
          where: { id: item.productVariantId, isDeleted: false, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (reserved.count === 0) {
          throw new BadRequestException(
            `موجودی کافی نیست: ${variantById.get(item.productVariantId)!.sku}`,
          );
        }
      }

      // پرداخت‌هایی که پیش از ثبت خودکار فروش PAID شده‌اند هنوز فروش ندارند
      const paid = payment.amount;
      const totalAmount = Math.max(itemsTotal, paid.toNumber());
      const saleData = {
        totalAmount,
        discountAmount: totalAmount - paid.toNumber(),
        payableAmount: paid,
        netAmount: paid,
        costOfGoods,
      };
      const itemRows = dto.items.map((item) => {
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
      });

      if (sale) {
        await tx.offlineSale.update({
          where: { id: sale.id },
          data: { ...saleData, items: { deleteMany: {}, create: itemRows } },
        });
      } else {
        const created = await tx.offlineSale.create({
          data: {
            ...saleData,
            channel: `ایونت ${payment.event.name}`,
            note: `پرداخت آنلاین ایونت${payment.refId ? ` — کد پیگیری ${payment.refId}` : ''}`,
            soldAt: payment.verifiedAt ?? payment.createdAt,
            customerId: payment.userId,
            items: { create: itemRows },
          },
          select: { id: true },
        });
        await tx.eventPayment.update({
          where: { id: payment.id },
          data: { offlineSaleId: created.id },
        });
      }
    });

    const saved = await this.prisma.eventPayment.findFirstOrThrow({
      where: { id: paymentId, eventId },
      include: ADMIN_PAYMENT_INCLUDE,
    });
    return serializeAdminPayment(saved);
  }

  async findMine(userId: string, id: string) {
    const payment = await this.prisma.eventPayment.findFirst({
      where: { id },
      include: {
        event: { select: { eventCode: true, name: true } },
        spin: true,
      },
    });
    if (!payment) throw new NotFoundException('پرداخت یافت نشد');
    if (payment.userId !== userId) throw new ForbiddenException();

    return {
      id: payment.id,
      status: payment.status,
      amount: payment.amount.toNumber(),
      refId: payment.refId,
      createdAt: payment.createdAt,
      verifiedAt: payment.verifiedAt,
      event: payment.event,
      spin: payment.spin ? serializeSpin(payment.spin) : null,
    };
  }
}
