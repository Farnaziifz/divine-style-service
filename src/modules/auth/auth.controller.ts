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
}
