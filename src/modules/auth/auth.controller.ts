import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SendOtpDto } from './dtos/send-otp.dto';
import { VerifyOtpDto } from './dtos/verify-otp.dto';
import { RefreshTokenGuard } from './refresh-token.guard';
import { Request } from 'express';
import { SetPasswordDto } from './dtos/set-password.dto';
import { AuthGuard } from '@nestjs/passport';
import { LoginDto } from './dtos/login.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('otp')
  @ApiOperation({ summary: 'ارسال کد تایید به شماره موبایل' })
  @ApiResponse({ status: 201, description: 'کد تایید ارسال شد' })
  @ApiResponse({ status: 400, description: 'شماره موبایل نامعتبر است' })
  async sendOtp(@Body() sendOtpDto: SendOtpDto) {
    return this.authService.sendOtp(sendOtpDto.mobile);
  }

  @Post('verify')
  @ApiOperation({ summary: 'بررسی کد تایید و دریافت توکن' })
  @ApiResponse({ status: 201, description: 'توکن با موفقیت صادر شد' })
  @ApiResponse({
    status: 400,
    description: 'کد تایید نامعتبر یا منقضی شده است',
  })
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyOtp(verifyOtpDto.mobile, verifyOtpDto.code);
  }

  @Post('refresh')
  @UseGuards(RefreshTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تمدید توکن با استفاده از رفرش توکن' })
  @ApiResponse({ status: 200, description: 'توکن جدید صادر شد' })
  @ApiResponse({ status: 401, description: 'رفرش توکن نامعتبر است' })
  refreshTokens(@Req() req: Request) {
    const userId = req.user['sub'];
    const refreshToken = req.user['refreshToken'];
    return this.authService.refreshTokens(userId, refreshToken);
  }

  @Post('set-password')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تنظیم رمز عبور برای کاربر جاری' })
  @ApiResponse({ status: 200, description: 'رمز عبور با موفقیت تنظیم شد' })
  @ApiResponse({ status: 401, description: 'عدم دسترسی (توکن نامعتبر)' })
  async setPassword(@Req() req: any, @Body() setPasswordDto: SetPasswordDto) {
    return this.authService.setPassword(req.user.id, setPasswordDto.password);
  }

  @Post('login')
  @ApiOperation({ summary: 'ورود با شماره موبایل و رمز عبور' })
  @ApiResponse({ status: 200, description: 'ورود موفق و دریافت توکن' })
  @ApiResponse({
    status: 401,
    description: 'نام کاربری یا رمز عبور اشتباه است',
  })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.loginWithPassword(
      loginDto.mobile,
      loginDto.password,
    );
  }
}
