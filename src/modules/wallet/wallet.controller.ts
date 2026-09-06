import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { WalletService } from './wallet.service';
import { TopUpWalletDto } from './dtos/topup-wallet.dto';
import { RequestWithdrawalDto } from './dtos/request-withdrawal.dto';
import { ResolveWithdrawalDto } from './dtos/resolve-withdrawal.dto';
import { WithdrawalQueryDto } from './dtos/withdrawal-query.dto';

@ApiTags('Wallet')
@Controller()
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  private assertAdmin(req: any) {
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException();
    }
  }

  @Get('wallet/mine')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'موجودی، تاریخچه و درخواست‌های برداشت من' })
  getMine(@Req() req: any) {
    return this.walletService.getMine(req.user.id);
  }

  @Post('wallet/topup')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'شارژ کیف‌پول از درگاه پرداخت' })
  topUp(@Req() req: any, @Body() dto: TopUpWalletDto) {
    return this.walletService.topUp(req.user.id, dto);
  }

  @Get('wallet/topup/zarinpal/callback')
  @ApiOperation({ summary: 'Zarinpal callback (wallet top-up)' })
  async zarinpalTopUpCallback(
    @Query('Authority') authority: string,
    @Query('Status') status: string,
    @Query('lang') lang: string,
    @Res() res: Response,
  ) {
    const redirect = await this.walletService.verifyTopUpCallback(
      'ZARINPAL',
      authority,
      status,
      lang,
    );
    return res.redirect(redirect);
  }

  @Get('wallet/topup/zibal/callback')
  @ApiOperation({ summary: 'Zibal callback (wallet top-up)' })
  async zibalTopUpCallback(
    @Query('trackId') trackId: string,
    @Query('lang') lang: string,
    @Res() res: Response,
  ) {
    const redirect = await this.walletService.verifyTopUpCallback(
      'ZIBAL',
      trackId,
      undefined,
      lang,
    );
    return res.redirect(redirect);
  }

  @Post('wallet/withdrawals')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'درخواست برداشت از کیف‌پول' })
  requestWithdrawal(@Req() req: any, @Body() dto: RequestWithdrawalDto) {
    return this.walletService.requestWithdrawal(req.user.id, dto);
  }

  @Get('wallet/withdrawals/mine')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'درخواست‌های برداشت من' })
  listMyWithdrawals(@Req() req: any) {
    return this.walletService.listMyWithdrawals(req.user.id);
  }

  @Get('admin/wallet/withdrawals')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'لیست همهٔ درخواست‌های برداشت (ادمین)' })
  listWithdrawalsForAdmin(@Req() req: any, @Query() query: WithdrawalQueryDto) {
    this.assertAdmin(req);
    return this.walletService.listWithdrawalsForAdmin(query);
  }

  @Patch('admin/wallet/withdrawals/:id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تسویهٔ درخواست برداشت (ادمین)' })
  @ApiParam({ name: 'id', type: String })
  resolveWithdrawal(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ResolveWithdrawalDto,
  ) {
    this.assertAdmin(req);
    return this.walletService.resolveWithdrawal(id, dto);
  }
}
