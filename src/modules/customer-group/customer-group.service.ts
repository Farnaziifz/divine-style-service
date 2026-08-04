import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import { CreateCustomerGroupDto } from './dtos/create-customer-group.dto';
import { UpdateCustomerGroupDto } from './dtos/update-customer-group.dto';
import { CustomerGroupQueryDto } from './dtos/customer-group-query.dto';

@Injectable()
export class CustomerGroupService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly memberSelect = {
    user: {
      select: {
        id: true,
        mobile: true,
        name: true,
        lastName: true,
      },
    },
  } as const;

  private async assertMembersExist(userIds: string[]) {
    const unique = [...new Set(userIds)];
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: unique },
        role: { not: Role.ADMIN },
        isDeleted: false,
      },
      select: { id: true },
    });
    if (users.length !== unique.length) {
      throw new BadRequestException(
        'یک یا چند کاربر یافت نشد یا حساب ادمین قابل انتخاب نیست',
      );
    }
    return unique;
  }

  private serialize(group: {
    id: string;
    title: string;
    description: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    _count?: { members: number };
    members?: {
      user: {
        id: string;
        mobile: string;
        name: string | null;
        lastName: string | null;
      };
    }[];
  }) {
    const { _count, members, ...rest } = group;
    return {
      ...rest,
      membersCount: _count?.members ?? members?.length ?? 0,
      ...(members ? { members: members.map((m) => m.user) } : {}),
    };
  }

  async create(dto: CreateCustomerGroupDto) {
    const memberUserIds = dto.memberUserIds?.length
      ? await this.assertMembersExist(dto.memberUserIds)
      : [];

    const group = await this.prisma.customerGroup.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        isActive: dto.isActive ?? true,
        members: memberUserIds.length
          ? {
              createMany: { data: memberUserIds.map((userId) => ({ userId })) },
            }
          : undefined,
      },
      include: { _count: { select: { members: true } } },
    });

    return this.serialize(group);
  }

  async findAll(query: CustomerGroupQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.CustomerGroupWhereInput = { isDeleted: false };
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.search?.trim()) {
      where.title = { contains: query.search.trim(), mode: 'insensitive' };
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.customerGroup.count({ where }),
      this.prisma.customerGroup.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { members: true } } },
      }),
    ]);

    return {
      data: rows.map((r) => this.serialize(r)),
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    const group = await this.prisma.customerGroup.findFirst({
      where: { id, isDeleted: false },
      include: {
        _count: { select: { members: true } },
        members: { select: this.memberSelect, orderBy: { addedAt: 'desc' } },
      },
    });
    if (!group) {
      throw new NotFoundException('دسته‌بندی یافت نشد');
    }
    return this.serialize(group);
  }

  async update(id: string, dto: UpdateCustomerGroupDto) {
    const current = await this.prisma.customerGroup.findFirst({
      where: { id, isDeleted: false },
    });
    if (!current) {
      throw new NotFoundException('دسته‌بندی یافت نشد');
    }

    const nextMemberUserIds =
      dto.memberUserIds !== undefined
        ? await this.assertMembersExist(dto.memberUserIds)
        : undefined;

    const group = await this.prisma.$transaction(async (tx) => {
      await tx.customerGroup.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      if (nextMemberUserIds !== undefined) {
        await tx.customerGroupMember.deleteMany({
          where: { customerGroupId: id },
        });
        if (nextMemberUserIds.length) {
          await tx.customerGroupMember.createMany({
            data: nextMemberUserIds.map((userId) => ({
              customerGroupId: id,
              userId,
            })),
          });
        }
      }

      return tx.customerGroup.findFirst({
        where: { id },
        include: {
          _count: { select: { members: true } },
          members: { select: this.memberSelect, orderBy: { addedAt: 'desc' } },
        },
      });
    });

    if (!group) {
      throw new BadRequestException('به‌روزرسانی ناموفق بود');
    }
    return this.serialize(group);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.customerGroup.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date(), isActive: false },
    });
    return { success: true };
  }
}
