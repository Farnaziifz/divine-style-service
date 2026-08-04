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
import { IncentiveReportService } from './incentive-report.service';
import { IncentiveReportQueryDto } from './dtos/incentive-report-query.dto';

@ApiTags('Loyalty — Incentive performance reports')
@Controller('loyalty/reports')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class IncentiveReportController {
  constructor(
    private readonly incentiveReportService: IncentiveReportService,
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

  @Get('incentive-performance')
  @ApiOperation({
    summary:
      'گزارش عملکرد مشوق‌ها: هزینه، درآمد نسبت‌داده‌شده و نرخ موفقیت — به‌تفکیک مشوق و سگمنت',
  })
  getPerformanceReport(
    @Req() req: any,
    @Query() query: IncentiveReportQueryDto,
  ) {
    this.assertCanView(req);
    return this.incentiveReportService.getPerformanceReport(query);
  }
}
