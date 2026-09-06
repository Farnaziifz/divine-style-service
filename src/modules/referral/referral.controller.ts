import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ReferralService } from './referral.service';
import { CreateReferralCodeDto } from './dtos/create-referral-code.dto';
import { CreateBloggerReferralCodeDto } from './dtos/create-blogger-referral-code.dto';
import { UpdateReferralCodeDto } from './dtos/update-referral-code.dto';
import { ReferralCodeQueryDto } from './dtos/referral-code-query.dto';

@ApiTags('Referral codes')
@Controller()
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  private assertAdmin(req: any) {
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException();
    }
  }

  @Post('referral-codes')
  @ApiOperation({ summary: 'ساخت کد ریفرال برای خودم' })
  create(@Req() req: any, @Body() dto: CreateReferralCodeDto) {
    return this.referralService.createForSelf(req.user.id, dto);
  }

  @Get('referral-codes/mine')
  @ApiOperation({ summary: 'کدهای ریفرال من' })
  findMine(@Req() req: any) {
    return this.referralService.findMine(req.user.id);
  }

  @Patch('referral-codes/:id')
  @ApiOperation({ summary: 'ویرایش کد ریفرال (مالک یا ادمین)' })
  @ApiParam({ name: 'id', type: String })
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateReferralCodeDto,
  ) {
    return this.referralService.update(id, dto, req.user);
  }

  @Delete('referral-codes/:id')
  @ApiOperation({ summary: 'غیرفعال‌سازی کد ریفرال (مالک یا ادمین)' })
  @ApiParam({ name: 'id', type: String })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.referralService.deactivate(id, req.user);
  }

  @Post('admin/referral-codes')
  @ApiOperation({ summary: 'ساخت کد ریفرال برای بلاگر (ادمین)' })
  createForBlogger(@Req() req: any, @Body() dto: CreateBloggerReferralCodeDto) {
    this.assertAdmin(req);
    return this.referralService.createForBlogger(dto);
  }

  @Get('admin/referral-codes')
  @ApiOperation({ summary: 'لیست همه کدهای ریفرال (ادمین)' })
  findAllForAdmin(@Req() req: any, @Query() query: ReferralCodeQueryDto) {
    this.assertAdmin(req);
    return this.referralService.findAllForAdmin(query);
  }
}
