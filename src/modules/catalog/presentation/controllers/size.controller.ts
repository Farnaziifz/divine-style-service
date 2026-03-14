import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { CreateSizeDto } from '../dtos/create-size.dto';

@ApiTags('Sizes')
@Controller('sizes')
export class SizeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'لیست سایزها (برای انتخاب در واریانت محصول)' })
  async findAll() {
    return this.prisma.size.findMany({
      where: { isDeleted: false },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, order: true },
    });
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'افزودن سایز جدید' })
  async create(@Body() dto: CreateSizeDto) {
    return this.prisma.size.create({
      data: {
        name: dto.name.trim(),
        order: dto.order ?? 0,
      },
      select: { id: true, name: true, order: true },
    });
  }
}
