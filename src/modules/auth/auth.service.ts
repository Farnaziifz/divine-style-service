import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { SmsTextService } from '../shared/sms/sms-text.service';
import { DiscountService } from '../discount/discount.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as dns from 'node:dns';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // شمارندهٔ تلاش‌های ناموفق تایید OTP به ازای شماره موبایل — جلوگیری از brute-force روی کد ۵ رقمی
  private readonly otpAttempts = new Map<
    string,
    { count: number; firstAttemptAt: number }
  >();
  private readonly MAX_OTP_ATTEMPTS = 5;
  private readonly OTP_ATTEMPT_WINDOW_MS = 2 * 60 * 1000;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private smsText: SmsTextService,
    private discountService: DiscountService,
  ) {}

  /** Best-effort — a welcome-discount failure must never block signup/login. */
  private async issueWelcomeDiscount(
    userId: string,
    mobile: string,
  ): Promise<void> {
    try {
      const stage =
        await this.discountService.createWelcomeStagesForUser(userId);
      if (!stage) {
        this.logger.warn(
          `Welcome discount: no code generated for user ${userId} (collision after retries)`,
        );
        return;
      }
      const text = this.smsText.buildWelcomeDiscountText(
        stage.code,
        stage.value,
      );
      await this.smsText.send(mobile, text);
    } catch (err) {
      this.logger.error(
        `Welcome discount failed for user ${userId}: ${(err as Error).message}`,
      );
    }
  }

  private assertOtpAttemptsAllowed(mobile: string) {
    const entry = this.otpAttempts.get(mobile);
    if (!entry) return;
    const withinWindow =
      Date.now() - entry.firstAttemptAt < this.OTP_ATTEMPT_WINDOW_MS;
    if (withinWindow && entry.count >= this.MAX_OTP_ATTEMPTS) {
      throw new BadRequestException(
        'تعداد تلاش‌های مجاز تمام شده. لطفا کد جدید درخواست کنید.',
      );
    }
    if (!withinWindow) {
      this.otpAttempts.delete(mobile);
    }
  }

  private recordFailedOtpAttempt(mobile: string) {
    const now = Date.now();
    const entry = this.otpAttempts.get(mobile);
    if (entry && now - entry.firstAttemptAt < this.OTP_ATTEMPT_WINDOW_MS) {
      entry.count += 1;
    } else {
      this.otpAttempts.set(mobile, { count: 1, firstAttemptAt: now });
    }
  }

  private isOtpTraceEnabled() {
    return (process.env.OTP_TRACE || 'false').toLowerCase() === 'true';
  }

  private maskMobile(mobile: string) {
    if (!mobile) return mobile;
    if (mobile.length <= 4) return '****';
    return `${mobile.slice(0, 4)}****${mobile.slice(-2)}`;
  }

  private trace(message: string, meta?: Record<string, unknown>) {
    if (!this.isOtpTraceEnabled()) return;
    if (!meta) {
      this.logger.log(`[otp-trace] ${message}`);
      return;
    }
    try {
      this.logger.log(
        `[otp-trace] ${message} | ${JSON.stringify(meta).slice(0, 1500)}`,
      );
    } catch {
      this.logger.log(`[otp-trace] ${message}`);
    }
  }

  private formatFetchError(error: unknown) {
    const err = error as any;
    const name = typeof err?.name === 'string' ? err.name : 'Error';
    const message =
      typeof err?.message === 'string' ? err.message : String(err);
    const cause = err?.cause;
    const causeName = typeof cause?.name === 'string' ? cause.name : null;
    const causeMessage =
      typeof cause?.message === 'string' ? cause.message : null;
    const code =
      typeof cause?.code === 'string'
        ? cause.code
        : typeof err?.code === 'string'
          ? err.code
          : null;
    const errno =
      typeof cause?.errno === 'number'
        ? String(cause.errno)
        : typeof err?.errno === 'number'
          ? String(err.errno)
          : null;
    const syscall =
      typeof cause?.syscall === 'string'
        ? cause.syscall
        : typeof err?.syscall === 'string'
          ? err.syscall
          : null;
    const hostname =
      typeof cause?.hostname === 'string'
        ? cause.hostname
        : typeof err?.hostname === 'string'
          ? err.hostname
          : null;

    const parts = [
      `${name}: ${message}`,
      causeName || causeMessage
        ? `cause=${causeName ?? 'Error'}:${causeMessage ?? ''}`
        : null,
      code ? `code=${code}` : null,
      errno ? `errno=${errno}` : null,
      syscall ? `syscall=${syscall}` : null,
      hostname ? `host=${hostname}` : null,
    ].filter(Boolean);

    return parts.join(' | ');
  }

  private getSmsConfig() {
    const apiKey = process.env.SMS_IR_API_KEY?.trim() || '';
    const verifyUrlRaw = process.env.SMS_IR_VERIFY_URL?.trim() || '';
    const verifyUrl = (verifyUrlRaw || 'https://api.sms.ir/v1/send/verify')
      .trim()
      .replace(/^['"`\s]+/, '')
      .replace(/['"`\s]+$/, '');
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

    this.trace('sms.ir: config loaded', {
      verifyUrl,
      templateId,
      logOtpOnly,
      hasApiKey: Boolean(apiKey),
      dnsServers: dns.getServers?.() ?? [],
    });

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
          name: 'OTP',
          value: code,
        },
        {
          name: 'Code',
          value: code,
        },
      ],
    };

    this.trace('sms.ir: prepared request payload', {
      mobile: this.maskMobile(mobile),
      templateId,
      parameters: payload.parameters.map((p) => p.name),
    });

    let res: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      this.trace('sms.ir: sending request', { verifyUrl });
      res = await fetch(verifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/plain, */*',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch (error) {
      this.trace('sms.ir: request failed', {
        error: this.formatFetchError(error),
        dnsServers: dns.getServers?.() ?? [],
      });
      throw new InternalServerErrorException(
        `ارسال پیامک با خطا مواجه شد: ${this.formatFetchError(error)}`,
      );
    }

    const text = await res.text();
    this.trace('sms.ir: response received', {
      status: res.status,
      ok: res.ok,
      bodyPreview: text ? text.slice(0, 350) : '',
    });
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

    this.trace('sendOtp: start', { mobile: this.maskMobile(mobile) });

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
    this.trace('sendOtp: provider resolved', { provider });
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
    // کد جدید یعنی فرصت تلاش جدید
    this.otpAttempts.delete(mobile);

    const { debugReturnCode } = this.getSmsConfig();
    if (debugReturnCode) {
      return { message: 'کد تایید ارسال شد', expiresAt, code };
    }
    return { message: 'کد تایید ارسال شد', expiresAt };
  }

  async verifyOtp(mobile: string, code: string) {
    this.assertOtpAttemptsAllowed(mobile);

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
      this.recordFailedOtpAttempt(mobile);
      throw new BadRequestException('کد تایید نامعتبر یا منقضی شده است');
    }

    this.otpAttempts.delete(mobile);

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
      void this.issueWelcomeDiscount(user.id, user.mobile);
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
