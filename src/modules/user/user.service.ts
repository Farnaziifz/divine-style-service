import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { UpdateUserDto } from './dtos/update-user.dto';

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

  async findAll(
    page: number = 1,
    limit: number = 10,
    name?: string,
    mobile?: string,
  ) {
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
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
