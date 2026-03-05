import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SendOtpDto } from './dtos/send-otp.dto';
import { VerifyOtpDto } from './dtos/verify-otp.dto';

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
}
