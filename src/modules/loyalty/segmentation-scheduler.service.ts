import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SegmentationService } from './segmentation.service';
import { ChurnEvaluationService } from './bi/churn-evaluation.service';
import { LoyaltyEvaluationService } from './bi/loyalty-evaluation.service';

/**
 * هر شب ساعت ۳ بامداد: اول یک اسنپ‌شات جدید RFM/سگمنت برای همهٔ مشتریان ثبت می‌کند،
 * سپس (چون از خروجی سگمنت‌بندی می‌خوانند) ارزیابی ریزش و وفاداری را به‌ترتیب اجرا می‌کند.
 */
@Injectable()
export class SegmentationSchedulerService {
  private readonly logger = new Logger(SegmentationSchedulerService.name);

  constructor(
    private readonly segmentationService: SegmentationService,
    private readonly churnEvaluationService: ChurnEvaluationService,
    private readonly loyaltyEvaluationService: LoyaltyEvaluationService,
  ) {}

  @Cron('0 3 * * *')
  async runNightlySegmentation() {
    const summary = await this.segmentationService.runSegmentation();
    this.logger.log(
      `Nightly segmentation snapshot done: ${JSON.stringify(summary)}`,
    );

    try {
      await this.churnEvaluationService.runEvaluation();
    } catch (err) {
      this.logger.error('Churn evaluation failed', err as Error);
    }

    try {
      await this.loyaltyEvaluationService.runEvaluation();
    } catch (err) {
      this.logger.error('Loyalty evaluation failed', err as Error);
    }
  }
}
