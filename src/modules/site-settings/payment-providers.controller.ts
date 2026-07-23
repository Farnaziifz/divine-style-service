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
import { UpdatePaymentProvidersDto } from './dtos/update-payment-providers.dto';

type PaymentProviderKey = 'ZARINPAL' | 'ZIBAL';

@ApiTags('Site settings')
@Controller('site-settings')
export class PaymentProvidersController {
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

  private parseActiveProviders(
    raw: string | null | undefined,
  ): PaymentProviderKey[] {
    if (!raw) return ['ZARINPAL'];
    const trimmed = raw.trim();
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .map((x) => String(x).toUpperCase())
          .filter((x) => x === 'ZARINPAL' || x === 'ZIBAL') as PaymentProviderKey[];
        if (normalized.length > 0) return Array.from(new Set(normalized));
      }
    } catch {
      // ignore
    }

    const normalized = trimmed
      .split(',')
      .map((x) =>
        x
          .trim()
          .toUpperCase(),
      )
      .filter((x) => x === 'ZARINPAL' || x === 'ZIBAL') as PaymentProviderKey[];
    return normalized.length > 0
      ? Array.from(new Set(normalized))
      : ['ZARINPAL'];
  }

  private normalizeDefaultProvider(
    active: PaymentProviderKey[],
    rawDefault: string | null | undefined,
  ): PaymentProviderKey {
    const desired = String(rawDefault ?? '').trim().toUpperCase();
    const fallback = active[0] ?? 'ZARINPAL';
    if (desired === 'ZARINPAL' || desired === 'ZIBAL') {
      return active.includes(desired as PaymentProviderKey)
        ? (desired as PaymentProviderKey)
        : fallback;
    }
    return fallback;
  }

  @Get('payment-providers')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'دریافت تنظیمات درگاه‌های پرداخت' })
  async getCurrent(@Req() req: any) {
    this.assertCanManage(req);
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

    const activeProviders = this.parseActiveProviders(activeSetting?.value);
    const defaultProvider = this.normalizeDefaultProvider(
      activeProviders,
      defaultSetting?.value,
    );

    return {
      options: ['ZARINPAL', 'ZIBAL'] as PaymentProviderKey[],
      activeProviders,
      defaultProvider,
    };
  }

  @Patch('payment-providers')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تغییر تنظیمات درگاه‌های پرداخت' })
  async update(@Req() req: any, @Body() dto: UpdatePaymentProvidersDto) {
    this.assertCanManage(req);
    const activeProviders = Array.from(new Set(dto.activeProviders));
    const defaultProvider = this.normalizeDefaultProvider(
      activeProviders,
      dto.defaultProvider,
    );

    await this.prisma.$transaction([
      this.prisma.siteSetting.upsert({
        where: { key: 'PAYMENT_ACTIVE_PROVIDERS' },
        create: {
          key: 'PAYMENT_ACTIVE_PROVIDERS',
          value: JSON.stringify(activeProviders),
        },
        update: { value: JSON.stringify(activeProviders) },
      }),
      this.prisma.siteSetting.upsert({
        where: { key: 'PAYMENT_DEFAULT_PROVIDER' },
        create: { key: 'PAYMENT_DEFAULT_PROVIDER', value: defaultProvider },
        update: { value: defaultProvider },
      }),
    ]);

    return { activeProviders, defaultProvider };
  }
}
