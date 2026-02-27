import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('otp')
  async sendOtp(@Body('mobile') mobile: string) {
    return this.authService.sendOtp(mobile);
  }

  @Post('verify')
  async verifyOtp(
    @Body('mobile') mobile: string,
    @Body('code') code: string,
  ) {
    return this.authService.verifyOtp(mobile, code);
  }
}
