import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
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

    // 5. Save to Otp table
    // Delete expired OTPs for this mobile to avoid clutter
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

    // 6. Log code for dev environment
    console.log(`OTP for ${mobile}: ${code}`);

    // In dev mode, return the code for testing
    return { message: 'کد تایید ارسال شد', expiresAt, code };
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
