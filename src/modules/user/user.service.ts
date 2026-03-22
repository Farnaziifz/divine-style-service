import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { UpdateUserDto } from './dtos/update-user.dto';
import { PaginatedResult } from '../shared/interfaces/paginated-result.interface';
import {
  CreateUserAddressDto,
  UpdateUserAddressDto,
  UserAddressDto,
} from './dtos/user-address.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  private normalizeAddresses(addresses: unknown): UserAddressDto[] {
    if (!Array.isArray(addresses)) {
      return [];
    }

    return addresses as UserAddressDto[];
  }

  private normalizeDefaultAddress(
    addresses: UserAddressDto[],
  ): UserAddressDto[] {
    const hasDefault = addresses.some((a) => a.isDefault);

    if (!hasDefault && addresses.length > 0) {
      addresses[0].isDefault = true;
    }

    let defaultFound = false;
    return addresses.map((address) => {
      if (address.isDefault && !defaultFound) {
        defaultFound = true;
        return { ...address, isDefault: true };
      }
      return { ...address, isDefault: false };
    });
  }

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
      data: updateUserDto,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, hashedRefreshToken, ...result } = user;
    return result;
  }

  async getMyAddresses(userId: string): Promise<UserAddressDto[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { addresses: true },
    });

    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }

    return this.normalizeAddresses(user.addresses);
  }

  async addMyAddress(
    userId: string,
    createAddressDto: CreateUserAddressDto,
  ): Promise<UserAddressDto[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { addresses: true },
    });

    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }

    const currentAddresses = this.normalizeAddresses(user.addresses);
    const newAddress: UserAddressDto = {
      id: randomUUID(),
      ...createAddressDto,
      isDefault: Boolean(createAddressDto.isDefault),
    };

    let nextAddresses = [...currentAddresses, newAddress];

    if (newAddress.isDefault) {
      nextAddresses = nextAddresses.map((address) => ({
        ...address,
        isDefault: address.id === newAddress.id,
      }));
    } else {
      nextAddresses = this.normalizeDefaultAddress(nextAddresses);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        addresses: nextAddresses as unknown as any,
      },
      select: { addresses: true },
    });

    return this.normalizeAddresses(updatedUser.addresses);
  }

  async updateMyAddress(
    userId: string,
    addressId: string,
    updateAddressDto: UpdateUserAddressDto,
  ): Promise<UserAddressDto[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { addresses: true },
    });

    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }

    const currentAddresses = this.normalizeAddresses(user.addresses);
    const targetExists = currentAddresses.some((a) => a.id === addressId);

    if (!targetExists) {
      throw new NotFoundException('آدرس مورد نظر یافت نشد');
    }

    let nextAddresses = currentAddresses.map((address) =>
      address.id === addressId
        ? {
            ...address,
            ...updateAddressDto,
            isDefault:
              updateAddressDto.isDefault !== undefined
                ? updateAddressDto.isDefault
                : address.isDefault,
          }
        : address,
    );

    const updatedAddress = nextAddresses.find((a) => a.id === addressId)!;
    if (updatedAddress.isDefault) {
      nextAddresses = nextAddresses.map((address) => ({
        ...address,
        isDefault: address.id === addressId,
      }));
    } else {
      nextAddresses = this.normalizeDefaultAddress(nextAddresses);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        addresses: nextAddresses as unknown as any,
      },
      select: { addresses: true },
    });

    return this.normalizeAddresses(updatedUser.addresses);
  }

  async deleteMyAddress(
    userId: string,
    addressId: string,
  ): Promise<UserAddressDto[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { addresses: true },
    });

    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }

    const currentAddresses = this.normalizeAddresses(user.addresses);
    const filteredAddresses = currentAddresses.filter(
      (a) => a.id !== addressId,
    );

    if (filteredAddresses.length === currentAddresses.length) {
      throw new NotFoundException('آدرس مورد نظر یافت نشد');
    }

    const nextAddresses = this.normalizeDefaultAddress(filteredAddresses);

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        addresses: nextAddresses as unknown as any,
      },
      select: { addresses: true },
    });

    return this.normalizeAddresses(updatedUser.addresses);
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
