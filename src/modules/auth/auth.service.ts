import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  private getSmsConfig() {
    const apiKey = process.env.SMS_IR_API_KEY?.trim() || '';
    const verifyUrl =
      process.env.SMS_IR_VERIFY_URL?.trim() ||
      'https://api.sms.ir/v1/send/verify';
    const templateId = Number(
      (process.env.SMS_IR_VERIFY_TEMPLATE_ID || '0').trim(),
    );
    const logOtpOnly =
      (process.env.SMS_LOG_OTP_ONLY || 'false').toLowerCase() === 'true';
    const debugReturnCode =
      (process.env.OTP_DEBUG_RETURN_CODE || 'false').toLowerCase() === 'true';
    return {
      apiKey,
      verifyUrl,
      templateId,
      logOtpOnly,
      debugReturnCode,
    };
  }

  private async getOtpProvider(): Promise<'ussdpanel' | 'sms_ir'> {
    try {
      const setting = await this.prisma.siteSetting.findUnique({
        where: { key: 'OTP_PROVIDER' },
        select: { value: true },
      });
      if (setting?.value === 'sms_ir' || setting?.value === 'ussdpanel') {
        return setting.value as 'sms_ir' | 'ussdpanel';
      }
    } catch {
      // ignore
    }

    const envProvider = (process.env.OTP_PROVIDER || '').trim().toLowerCase();
    if (envProvider === 'sms_ir') return 'sms_ir';
    return 'ussdpanel';
  }

  private async sendOtpViaSmsIr(mobile: string, code: string) {
    const { apiKey, verifyUrl, templateId, logOtpOnly } = this.getSmsConfig();

    if (logOtpOnly) {
      console.log(`OTP for ${mobile}: ${code}`);
      return;
    }

    if (!apiKey) {
      throw new InternalServerErrorException(
        'تنظیمات پیامک کامل نیست (SMS_IR_API_KEY)',
      );
    }

    if (!Number.isFinite(templateId) || templateId <= 0) {
      throw new InternalServerErrorException(
        'تنظیمات پیامک کامل نیست (SMS_IR_VERIFY_TEMPLATE_ID)',
      );
    }

    const payload = {
      mobile,
      templateId,
      parameters: [
        {
          name: 'Code',
          value: code,
        },
      ],
    };

    let res: Response;
    try {
      res = await fetch(verifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/plain, */*',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw new InternalServerErrorException(
        `ارسال پیامک با خطا مواجه شد: ${String(error)}`,
      );
    }

    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    const ok = res.ok && parsed && Number(parsed.status) === 1;
    if (!ok) {
      const msg =
        parsed?.message ||
        (text ? text.slice(0, 200) : '') ||
        `SMS provider error (${res.status})`;
      throw new InternalServerErrorException(
        `ارسال پیامک با خطا مواجه شد: ${msg}`,
      );
    }
  }

  private getUssdPanelConfig() {
    const apiKey = process.env.USSDPANEL_API_KEY?.trim() || '';
    const baseUrl =
      process.env.USSDPANEL_BASE_URL?.trim() ||
      'https://my.ussdpanel.com/api/OTP/v1';
    const logOtpOnly =
      (process.env.SMS_LOG_OTP_ONLY || 'false').toLowerCase() === 'true';
    return { apiKey, baseUrl, logOtpOnly };
  }

  private async sendOtpViaUssdPanel(
    mobile: string,
    code: string,
    validTimeMinutes: number,
  ) {
    const { apiKey, baseUrl, logOtpOnly } = this.getUssdPanelConfig();

    if (logOtpOnly) {
      console.log(`OTP for ${mobile}: ${code}`);
      return;
    }

    if (!apiKey) {
      throw new InternalServerErrorException(
        'تنظیمات پیامک کامل نیست (USSDPANEL_API_KEY)',
      );
    }

    const validTime = Math.min(1440, Math.max(1, Math.floor(validTimeMinutes)));
    const url = `${baseUrl.replace(/\/+$/, '')}/setOTP`;

    const body = new URLSearchParams();
    body.set('apiKey', apiKey);
    body.set('mobile', mobile);
    body.set('OTP', code);
    body.set('validTime', String(validTime));
    body.set('type', 'SMS');

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json, text/plain, */*',
        },
        body,
      });
    } catch (error) {
      throw new InternalServerErrorException(
        `ارسال پیامک با خطا مواجه شد: ${String(error)}`,
      );
    }

    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    const ok = res.ok && parsed && Number(parsed.code) > 100;
    if (!ok) {
      const msg =
        parsed?.message ||
        (text ? text.slice(0, 200) : '') ||
        `OTP provider error (${res.status})`;
      throw new InternalServerErrorException(
        `ارسال پیامک با خطا مواجه شد: ${msg}`,
      );
    }
  }

  async sendOtp(mobile: string) {
    // 1. Validate mobile number (simple check)
    if (!/^09\d{9}$/.test(mobile)) {
      throw new BadRequestException('شماره موبایل نامعتبر است');
    }

    // 2. Check for existing valid OTP
    const existingOtp = await this.prisma.otp.findFirst({
      where: {
        mobile,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (existingOtp) {
      const remainingTime = Math.ceil(
        (existingOtp.expiresAt.getTime() - Date.now()) / 1000,
      );
      throw new BadRequestException(
        `کد تایید قبلی هنوز معتبر است. لطفا ${remainingTime} ثانیه دیگر صبر کنید.`,
      );
    }

    // 3. Generate 5 digit code
    const code = Math.floor(10000 + Math.random() * 90000).toString();

    // 4. Set expiration (2 minutes)
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000);

    // 5. Send OTP via provider first (sandbox/production)
    const provider = await this.getOtpProvider();
    if (provider === 'sms_ir') {
      await this.sendOtpViaSmsIr(mobile, code);
    } else {
      await this.sendOtpViaUssdPanel(mobile, code, 2);
    }

    // 6. Save to Otp table
    // Delete previous OTPs for this mobile to avoid clutter
    await this.prisma.otp.deleteMany({
      where: { mobile },
    });

    await this.prisma.otp.create({
      data: {
        mobile,
        code,
        expiresAt,
      },
    });

    const { debugReturnCode } = this.getSmsConfig();
    if (debugReturnCode) {
      return { message: 'کد تایید ارسال شد', expiresAt, code };
    }
    return { message: 'کد تایید ارسال شد', expiresAt };
  }

  async verifyOtp(mobile: string, code: string) {
    // 1. Find OTP record
    const otpRecord = await this.prisma.otp.findFirst({
      where: {
        mobile,
        code,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!otpRecord) {
      throw new BadRequestException('کد تایید نامعتبر یا منقضی شده است');
    }

    // 2. Find or Create User
    let user = await this.prisma.user.findUnique({
      where: { mobile },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          mobile,
        },
      });
    }

    // 3. Generate Tokens
    const tokens = await this.getTokens(user.id, user.mobile, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    // 4. Delete OTP (Consumed)
    await this.prisma.otp.delete({
      where: { id: otpRecord.id },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user,
    };
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.hashedRefreshToken) {
      throw new UnauthorizedException('Access Denied');
    }

    const refreshTokenMatches = await bcrypt.compare(
      refreshToken,
      user.hashedRefreshToken,
    );

    if (!refreshTokenMatches) {
      throw new UnauthorizedException('Access Denied');
    }

    const tokens = await this.getTokens(user.id, user.mobile, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async updateRefreshToken(userId: string, refreshToken: string) {
    const salt = await bcrypt.genSalt();
    const hashedRefreshToken = await bcrypt.hash(refreshToken, salt);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        hashedRefreshToken,
      },
    });
  }

  async getTokens(userId: string, mobile: string, role: string) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        {
          sub: userId,
          mobile,
          role,
        },
        {
          secret: 'secretKey', // TODO: Use env variable
          expiresIn: '15m',
        },
      ),
      this.jwtService.signAsync(
        {
          sub: userId,
          mobile,
          role,
        },
        {
          secret: 'refreshSecretKey', // TODO: Use env variable
          expiresIn: '7d',
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  async setPassword(userId: string, password: string) {
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(password, salt);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
      },
    });

    return { message: 'رمز عبور با موفقیت تنظیم شد' };
  }

  async loginWithPassword(mobile: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { mobile },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('شماره موبایل یا رمز عبور اشتباه است');
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      throw new UnauthorizedException('شماره موبایل یا رمز عبور اشتباه است');
    }

    const tokens = await this.getTokens(user.id, user.mobile, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user,
    };
  }
}
