import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { CreateSizeDto } from '../dtos/create-size.dto';

@ApiTags('Sizes')
@Controller('sizes')
export class SizeController {
  constructor(private readonly prisma: PrismaService) {}

  private assertCanWrite(req: any) {
    const isAdmin = req.user?.role === 'ADMIN';
    const isOperatorWithPermission =
      req.user?.role === 'OPERATOR' &&
      Array.isArray(req.user?.permissions) &&
      req.user.permissions.includes('PRODUCTS_WRITE');
    if (!isAdmin && !isOperatorWithPermission) {
      throw new ForbiddenException();
    }
  }

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
  async create(@Req() req: any, @Body() dto: CreateSizeDto) {
    this.assertCanWrite(req);
    return this.prisma.size.create({
      data: {
        name: dto.name.trim(),
        order: dto.order ?? 0,
      },
      select: { id: true, name: true, order: true },
    });
  }
}
