import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { StyleGameService } from './style-game.service';
import { StartSessionDto } from './dtos/start-session.dto';
import { SubmitAttemptDto } from './dtos/submit-attempt.dto';

@ApiTags('Style game')
@Controller('style-game')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class StyleGameController {
  constructor(private readonly styleGameService: StyleGameService) {}

  @Get('products')
  @ApiOperation({ summary: 'لیست محصولات قابل انتخاب (فعلاً فقط گوشواره)' })
  getProducts() {
    return this.styleGameService.getEligibleProducts();
  }

  @Post('sessions')
  @ApiOperation({ summary: 'شروع نشست جدید بازی با عکس کاربر' })
  startSession(@Req() req: any, @Body() dto: StartSessionDto) {
    return this.styleGameService.startSession(req.user.id, dto.eventCode, dto.photoUrl);
  }

  @Post('sessions/:id/attempts')
  @ApiOperation({ summary: 'ثبت یک تلاش (انتخاب محصول) و دریافت نتیجهٔ تولید/ارزیابی' })
  @ApiParam({ name: 'id', type: String })
  submitAttempt(@Req() req: any, @Param('id') id: string, @Body() dto: SubmitAttemptDto) {
    return this.styleGameService.submitAttempt(id, req.user.id, dto.productId);
  }
}
