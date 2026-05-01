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
import { UpdateOtpProviderDto } from './dtos/update-otp-provider.dto';

@ApiTags('Site settings')
@Controller('site-settings')
export class OtpProviderController {
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

  private resolveDefaultProviderFromEnv(): 'ussdpanel' | 'sms_ir' {
    const raw = (process.env.OTP_PROVIDER || '').trim().toLowerCase();
    if (raw === 'sms_ir') return 'sms_ir';
    return 'ussdpanel';
  }

  @Get('otp-provider')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'دریافت سرویس OTP فعال' })
  async getCurrent(@Req() req: any) {
    this.assertCanManage(req);
    const setting = await this.prisma.siteSetting.findUnique({
      where: { key: 'OTP_PROVIDER' },
      select: { value: true },
    });

    const provider =
      setting?.value === 'sms_ir' || setting?.value === 'ussdpanel'
        ? (setting.value as 'sms_ir' | 'ussdpanel')
        : this.resolveDefaultProviderFromEnv();

    return { provider, options: ['ussdpanel', 'sms_ir'] };
  }

  @Patch('otp-provider')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تغییر سرویس OTP فعال' })
  async update(@Req() req: any, @Body() dto: UpdateOtpProviderDto) {
    this.assertCanManage(req);
    await this.prisma.siteSetting.upsert({
      where: { key: 'OTP_PROVIDER' },
      create: { key: 'OTP_PROVIDER', value: dto.provider },
      update: { value: dto.provider },
    });
    return { provider: dto.provider };
  }
}
