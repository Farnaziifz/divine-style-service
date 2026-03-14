import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { UpdateUserDto } from './dtos/update-user.dto';
import { PaginatedResult } from '../shared/interfaces/paginated-result.interface';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }

    // Exclude sensitive fields
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, hashedRefreshToken, ...result } = user;
    return result;
  }

  async updateProfile(userId: string, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...updateUserDto,
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, hashedRefreshToken, ...result } = user;
    return result;
  }

  /**
   * نظرات کلی برند (تستیمونیال صفحه اصلی) — بدون وابستگی به محصول، فقط تأییدشده‌ها
   */
  async getTestimonials(limit: number = 10) {
    const testimonials = await this.prisma.siteTestimonial.findMany({
      where: {
        isApproved: true,
        isDeleted: false,
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
      take: Math.min(limit, 50),
    });

    return testimonials.map((t) => ({
      id: t.id,
      rating: t.rating,
      comment: t.comment,
      createdAt: t.createdAt,
      userName: t.authorName,
      productTitle: null,
    }));
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    name?: string,
    mobile?: string,
  ): Promise<PaginatedResult<any>> {
    const skip = (page - 1) * limit;

    const where: any = {};

    if (name) {
      where.OR = [
        { name: { contains: name, mode: 'insensitive' } },
        { lastName: { contains: name, mode: 'insensitive' } },
      ];
    }

    if (mobile) {
      where.mobile = { contains: mobile };
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { orders: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const data = users.map((user) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, hashedRefreshToken, _count, ...result } = user;
      return {
        ...result,
        hasPassword: !!password,
        isProfileComplete: !!(
          user.name &&
          user.lastName &&
          user.nationalCode &&
          user.job
        ),
        ordersCount: _count.orders,
      };
    });

    return {
      data,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
        limit,
      },
    };
  }
}
