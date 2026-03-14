import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../shared/prisma/prisma.service';
import { PaginationDto } from '../shared/dtos/pagination.dto';

@ApiTags('Orders')
@Controller('orders')
export class OrderController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all orders' })
  async findAll(@Query() pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 10;
    const skip = (page - 1) * limit;

    const [total, data] = await this.prisma.$transaction([
      this.prisma.order.count(),
      this.prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              mobile: true,
              name: true,
              lastName: true,
            },
          },
          items: {
            where: { isDeleted: false },
            select: {
              id: true,
              productId: true,
              productVariantId: true,
              sku: true,
              title: true,
              quantity: true,
              unitPrice: true,
              unitDiscountPrice: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
      },
    };
  }
}
