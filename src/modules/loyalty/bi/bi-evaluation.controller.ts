import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChurnEvaluationService } from './churn-evaluation.service';
import { LoyaltyEvaluationService } from './loyalty-evaluation.service';
import { SnapshotHistoryQueryDto } from './dtos/snapshot-history-query.dto';

@ApiTags('Loyalty — BI evaluations')
@Controller('loyalty/bi')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class BiEvaluationController {
  constructor(
    private readonly churnEvaluationService: ChurnEvaluationService,
    private readonly loyaltyEvaluationService: LoyaltyEvaluationService,
  ) {}

  private assertCanView(req: any) {
    const isAdmin = req.user?.role === 'ADMIN';
    const isOperatorWithPermission =
      req.user?.role === 'OPERATOR' &&
      Array.isArray(req.user?.permissions) &&
      req.user.permissions.includes('LOYALTY_CLUB_MANAGE');
    if (!isAdmin && !isOperatorWithPermission) {
      throw new ForbiddenException();
    }
  }

  @Get('churn/latest')
  @ApiOperation({ summary: 'آخرین اسنپ‌شات نرخ ریزش' })
  getLatestChurn(@Req() req: any) {
    this.assertCanView(req);
    return this.churnEvaluationService.getLatest();
  }

  @Get('churn/history')
  @ApiOperation({
    summary: 'تاریخچهٔ اسنپ‌شات‌های نرخ ریزش (برای نمودار روند)',
  })
  getChurnHistory(@Req() req: any, @Query() query: SnapshotHistoryQueryDto) {
    this.assertCanView(req);
    return this.churnEvaluationService.getHistory(query);
  }

  @Get('loyalty/latest')
  @ApiOperation({ summary: 'آخرین اسنپ‌شات نرخ وفاداری' })
  getLatestLoyalty(@Req() req: any) {
    this.assertCanView(req);
    return this.loyaltyEvaluationService.getLatest();
  }

  @Get('loyalty/history')
  @ApiOperation({
    summary: 'تاریخچهٔ اسنپ‌شات‌های نرخ وفاداری (برای نمودار روند)',
  })
  getLoyaltyHistory(@Req() req: any, @Query() query: SnapshotHistoryQueryDto) {
    this.assertCanView(req);
    return this.loyaltyEvaluationService.getHistory(query);
  }
}
