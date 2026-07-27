import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../shared/prisma/prisma.service';
import { UpdatePricingSettingsDto } from './dtos/update-pricing-settings.dto';

@ApiTags('Site settings')
@Controller('site-settings')
export class PricingSettingsController {
  constructor(private readonly prisma: PrismaService) {}

  private assertCanManage(req: any) {
    const isAdmin = req.user?.role === 'ADMIN';
    const isOperatorWithPermission =
      req.user?.role === 'OPERATOR' &&
      Array.isArray(req.user?.permissions) &&
      req.user.permissions.includes('SITE_SETTINGS_MANAGE');
    if (!isAdmin && !isOperatorWithPermission) {
      throw new ForbiddenException();
    }
  }

  @Get('pricing')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'دریافت تنظیمات قیمت‌گذاری (هزینه بسته‌بندی و مالیات)' })
  async getCurrent(@Req() req: any) {
    this.assertCanManage(req);
    const [packaging, tax] = await this.prisma.$transaction([
      this.prisma.siteSetting.findUnique({
        where: { key: 'PACKAGING_COST' },
        select: { value: true },
      }),
      this.prisma.siteSetting.findUnique({
        where: { key: 'TAX_PERCENT' },
        select: { value: true },
      }),
    ]);

    return {
      packagingCost: Number(packaging?.value) || 0,
      taxPercent: Number(tax?.value) || 0,
    };
  }

  @Patch('pricing')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تغییر تنظیمات قیمت‌گذاری (هزینه بسته‌بندی و مالیات)' })
  async update(@Req() req: any, @Body() dto: UpdatePricingSettingsDto) {
    this.assertCanManage(req);

    await this.prisma.$transaction([
      this.prisma.siteSetting.upsert({
        where: { key: 'PACKAGING_COST' },
        create: { key: 'PACKAGING_COST', value: String(dto.packagingCost) },
        update: { value: String(dto.packagingCost) },
      }),
      this.prisma.siteSetting.upsert({
        where: { key: 'TAX_PERCENT' },
        create: { key: 'TAX_PERCENT', value: String(dto.taxPercent) },
        update: { value: String(dto.taxPercent) },
      }),
    ]);

    return { packagingCost: dto.packagingCost, taxPercent: dto.taxPercent };
  }
}
