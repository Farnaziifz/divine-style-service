import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

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

    // 2. Generate 5 digit code
    const code = Math.floor(10000 + Math.random() * 90000).toString();

    // 3. Set expiration (2 minutes)
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000);

    // 4. Save to Otp table
    // Delete existing OTPs for this mobile to avoid clutter (Optional but good for clean up)
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

    // 5. Log code for dev environment
    console.log(`OTP for ${mobile}: ${code}`);

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

    // 3. Generate Token
    const payload = { sub: user.id, mobile: user.mobile, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    // 4. Delete OTP (Consumed)
    await this.prisma.otp.delete({
      where: { id: otpRecord.id },
    });

    return {
      accessToken,
      user,
    };
  }
}
