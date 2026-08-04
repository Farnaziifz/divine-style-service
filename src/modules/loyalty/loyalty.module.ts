import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { SegmentationService } from './segmentation.service';
import { SegmentationSchedulerService } from './segmentation-scheduler.service';
import { DiscountIncentiveController } from './discount-incentive/discount-incentive.controller';
import { DiscountIncentiveService } from './discount-incentive/discount-incentive.service';
import { DiscountRedemptionService } from './discount-incentive/discount-redemption.service';
import { CashbackIncentiveController } from './cashback-incentive/cashback-incentive.controller';
import { CashbackIncentiveService } from './cashback-incentive/cashback-incentive.service';
import { CashbackGrantService } from './cashback-incentive/cashback-grant.service';
import { CashbackApplyService } from './cashback-incentive/cashback-apply.service';
import { CouponIncentiveController } from './coupon-incentive/coupon-incentive.controller';
import { CouponIncentiveService } from './coupon-incentive/coupon-incentive.service';
import { CouponTriggerService } from './coupon-incentive/coupon-trigger.service';
import { BiEvaluationController } from './bi/bi-evaluation.controller';
import { ChurnEvaluationService } from './bi/churn-evaluation.service';
import { LoyaltyEvaluationService } from './bi/loyalty-evaluation.service';
import { IncentiveReportController } from './incentive-reports/incentive-report.controller';
import { IncentiveReportService } from './incentive-reports/incentive-report.service';
import { SegmentController } from './segments/segment.controller';
import { SegmentService } from './segments/segment.service';

@Module({
  imports: [SharedModule],
  controllers: [
    DiscountIncentiveController,
    CashbackIncentiveController,
    CouponIncentiveController,
    BiEvaluationController,
    IncentiveReportController,
    SegmentController,
  ],
  providers: [
    SegmentationService,
    SegmentationSchedulerService,
    DiscountIncentiveService,
    DiscountRedemptionService,
    CashbackIncentiveService,
    CashbackGrantService,
    CashbackApplyService,
    CouponIncentiveService,
    CouponTriggerService,
    ChurnEvaluationService,
    LoyaltyEvaluationService,
    IncentiveReportService,
    SegmentService,
  ],
  exports: [
    SegmentationService,
    DiscountIncentiveService,
    DiscountRedemptionService,
    CashbackIncentiveService,
    CashbackGrantService,
    CashbackApplyService,
    CouponIncentiveService,
    CouponTriggerService,
    ChurnEvaluationService,
    LoyaltyEvaluationService,
    IncentiveReportService,
    SegmentService,
  ],
})
export class LoyaltyModule {}
