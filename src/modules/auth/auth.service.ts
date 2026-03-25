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
    const templateId = Number(process.env.SMS_IR_VERIFY_TEMPLATE_ID || '123456');
    const enabled = (process.env.SMS_PROVIDER || 'sms_ir').toLowerCase() === 'sms_ir';
    const logOtpOnly = (process.env.SMS_LOG_OTP_ONLY || 'false').toLowerCase() === 'true';
    const debugReturnCode =
      (process.env.OTP_DEBUG_RETURN_CODE || 'false').toLowerCase() === 'true';
    return { apiKey, verifyUrl, templateId, enabled, logOtpOnly, debugReturnCode };
  }

  private async sendOtpViaSmsIr(mobile: string, code: string) {
    const { apiKey, verifyUrl, templateId, enabled, logOtpOnly } =
      this.getSmsConfig();

    // For local development without provider setup
    if (!enabled || logOtpOnly || !apiKey) {
      console.log(`OTP for ${mobile}: ${code}`);
      return;
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
          Accept: 'text/plain',
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

    const ok = res.ok && parsed && parsed.status === 1;
    if (!ok) {
      const msg =
        parsed?.message || `SMS provider error (${res.status})`;
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

    // 5. Send OTP via SMS provider first (sandbox/production)
    await this.sendOtpViaSmsIr(mobile, code);

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
