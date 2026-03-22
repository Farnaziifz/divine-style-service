import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { CreateDiscountCodeDto } from './dtos/create-discount-code.dto';
import { UpdateDiscountCodeDto } from './dtos/update-discount-code.dto';
import { DiscountCodeQueryDto } from './dtos/discount-code-query.dto';
import {
  DiscountCode,
  DiscountCodeScope,
  DiscountValueType,
  Prisma,
} from '@prisma/client';

@Injectable()
export class DiscountService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private assertScopePayload(dto: {
    scope: DiscountCodeScope;
    userId?: string | null;
    userGroupId?: string | null;
  }) {
    if (dto.scope === DiscountCodeScope.ALL_USERS) {
      if (dto.userId || dto.userGroupId) {
        throw new BadRequestException(
          'برای تخفیف عمومی نباید کاربر یا گروه مشخص شود',
        );
      }
    }
    if (dto.scope === DiscountCodeScope.SINGLE_USER) {
      if (!dto.userId) {
        throw new BadRequestException('برای تخفیف تک‌کاربره، userId الزامی است');
      }
      if (dto.userGroupId) {
        throw new BadRequestException('برای تخفیف تک‌کاربره نباید userGroupId ارسال شود');
      }
    }
    if (dto.scope === DiscountCodeScope.USER_GROUP) {
      if (!dto.userGroupId) {
        throw new BadRequestException(
          'برای تخفیف گروهی، userGroupId الزامی است (تعریف گروه‌ها بعداً)',
        );
      }
      if (dto.userId) {
        throw new BadRequestException('برای تخفیف گروهی نباید userId ارسال شود');
      }
    }
  }

  private assertValueRules(valueType: DiscountValueType, value: number) {
    if (valueType === DiscountValueType.PERCENT) {
      if (value <= 0 || value > 100) {
        throw new BadRequestException('درصد تخفیف باید بین ۱ تا ۱۰۰ باشد');
      }
    } else if (valueType === DiscountValueType.FIXED_AMOUNT) {
      if (value <= 0) {
        throw new BadRequestException('مبلغ تخفیف باید بزرگ‌تر از صفر باشد');
      }
    }
  }

  private assertDates(validFrom: Date, validTo: Date) {
    if (validFrom >= validTo) {
      throw new BadRequestException('تاریخ پایان باید بعد از تاریخ شروع باشد');
    }
  }

  private serialize(dc: DiscountCode) {
    return {
      ...dc,
      value: dc.value.toNumber(),
      minOrderAmount: dc.minOrderAmount?.toNumber() ?? null,
    };
  }

  async create(dto: CreateDiscountCodeDto) {
    const code = this.normalizeCode(dto.code);
    this.assertScopePayload({
      scope: dto.scope,
      userId: dto.userId,
      userGroupId: dto.userGroupId,
    });
    this.assertValueRules(dto.valueType, dto.value);

    const validFrom = new Date(dto.validFrom);
    const validTo = new Date(dto.validTo);
    this.assertDates(validFrom, validTo);

    if (dto.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: { id: true },
      });
      if (!user) {
        throw new BadRequestException('کاربر یافت نشد');
      }
    }

    const existing = await this.prisma.discountCode.findFirst({
      where: { code },
    });
    if (existing) {
      throw new ConflictException('این کد تخفیف قبلاً ثبت شده است');
    }

    const created = await this.prisma.discountCode.create({
      data: {
        code,
        title: dto.title?.trim() || null,
        scope: dto.scope,
        userId: dto.scope === DiscountCodeScope.SINGLE_USER ? dto.userId : null,
        userGroupId:
          dto.scope === DiscountCodeScope.USER_GROUP ? dto.userGroupId : null,
        valueType: dto.valueType,
        value: new Prisma.Decimal(dto.value),
        minOrderAmount:
          dto.minOrderAmount != null
            ? new Prisma.Decimal(dto.minOrderAmount)
            : null,
        validFrom,
        validTo,
        maxTotalUses: dto.maxTotalUses ?? null,
        isActive: dto.isActive ?? true,
      },
    });

    return this.serialize(created);
  }

  async findAll(query: DiscountCodeQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.DiscountCodeWhereInput = {};

    if (query.scope) {
      where.scope = query.scope;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.search?.trim()) {
      const s = query.search.trim();
      where.OR = [
        { code: { contains: s, mode: 'insensitive' } },
        { title: { contains: s, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.discountCode.count({ where }),
      this.prisma.discountCode.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              mobile: true,
              name: true,
              lastName: true,
            },
          },
        },
      }),
    ]);

    return {
      data: rows.map((r) => {
        const { user, ...dc } = r;
        return { ...this.serialize(dc), user };
      }),
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    const row = await this.prisma.discountCode.findFirst({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            mobile: true,
            name: true,
            lastName: true,
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('کد تخفیف یافت نشد');
    }
    const { user, ...dc } = row;
    return { ...this.serialize(dc), user };
  }

  async update(id: string, dto: UpdateDiscountCodeDto) {
    const current = await this.prisma.discountCode.findFirst({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            mobile: true,
            name: true,
            lastName: true,
          },
        },
      },
    });
    if (!current) {
      throw new NotFoundException('کد تخفیف یافت نشد');
    }

    const scope = dto.scope ?? current.scope;
    let userId: string | null = current.userId;
    let userGroupId: string | null = current.userGroupId;

    if (dto.scope !== undefined) {
      if (dto.scope === DiscountCodeScope.ALL_USERS) {
        userId = null;
        userGroupId = null;
      } else if (dto.scope === DiscountCodeScope.SINGLE_USER) {
        userGroupId = null;
        userId = dto.userId ?? current.userId;
      } else {
        userId = null;
        userGroupId = dto.userGroupId ?? current.userGroupId;
      }
    } else {
      if (dto.userId !== undefined) userId = dto.userId;
      if (dto.userGroupId !== undefined) userGroupId = dto.userGroupId;
    }

    this.assertScopePayload({ scope, userId, userGroupId });

    const valueType = dto.valueType ?? current.valueType;
    const valueNum = dto.value ?? current.value.toNumber();
    if (dto.valueType !== undefined || dto.value !== undefined) {
      this.assertValueRules(valueType, valueNum);
    }

    const validFrom =
      dto.validFrom !== undefined ? new Date(dto.validFrom) : current.validFrom;
    const validTo =
      dto.validTo !== undefined ? new Date(dto.validTo) : current.validTo;
    this.assertDates(validFrom, validTo);

    const targetUserId =
      scope === DiscountCodeScope.SINGLE_USER ? userId : null;
    if (targetUserId) {
      const user = await this.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true },
      });
      if (!user) {
        throw new BadRequestException('کاربر یافت نشد');
      }
    }

    if (dto.code !== undefined) {
      const normalized = this.normalizeCode(dto.code);
      const clash = await this.prisma.discountCode.findFirst({
        where: { code: normalized, NOT: { id } },
      });
      if (clash) {
        throw new ConflictException('این کد تخفیف قبلاً ثبت شده است');
      }
    }

    const updated = await this.prisma.discountCode.update({
      where: { id },
      data: {
        ...(dto.code !== undefined ? { code: this.normalizeCode(dto.code) } : {}),
        ...(dto.title !== undefined
          ? { title: dto.title?.trim() || null }
          : {}),
        scope,
        userId,
        userGroupId,
        ...(dto.valueType !== undefined ? { valueType: dto.valueType } : {}),
        ...(dto.value !== undefined
          ? { value: new Prisma.Decimal(dto.value) }
          : {}),
        ...(dto.minOrderAmount !== undefined
          ? {
              minOrderAmount:
                dto.minOrderAmount == null
                  ? null
                  : new Prisma.Decimal(dto.minOrderAmount),
            }
          : {}),
        validFrom,
        validTo,
        ...(dto.maxTotalUses !== undefined
          ? { maxTotalUses: dto.maxTotalUses }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            mobile: true,
            name: true,
            lastName: true,
          },
        },
      },
    });

    const { user, ...dc } = updated;
    return { ...this.serialize(dc), user };
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.discountCode.delete({ where: { id } });
    return { success: true };
  }
}
